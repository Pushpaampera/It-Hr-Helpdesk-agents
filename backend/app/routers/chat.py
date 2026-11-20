"""POST /api/chat/stream (SSE) and GET /api/runs/{id}/events (replay).

Phase 4: wrapped with the real JWT auth dependency — the caller's identity comes from the
bearer token, not a user_id body field (Phase 3's interim approach).
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.agents import clarify, hr_confidential
from app.agents import leave_request as leave
from app.agents import password_reset as pw_reset
from app.agents.spelling import correct as fix_spelling
from app.agents.events import load_events_for_run, new_run_id
from app.agents.graph import is_gate_reply, resume_after_user_reply, start_chat
from app.agents.runs_store import (
    find_awaiting_reply_run, find_pending_clarification, get_run, save_message, update_run,
)
from app.config import get_settings
from app.db import get_db
from app.deps import ensure_self_or_roles, get_current_user
from app.models.user import User
from app.routers.tickets import can_view_run

router = APIRouter(prefix="/api", tags=["chat"])
settings = get_settings()

# What chat history keeps instead of a verification code typed during a password reset.
CODE_PLACEHOLDER = "[Verification code entered]"

# What chat history keeps instead of a private message. HR, admins (and IT support, for runs
# behind a ticket they work on) can open conversations and agent runs, so the person's own words
# must never be stored there.
PRIVATE_PLACEHOLDER = "[Private HR matter: not stored in chat. The employee was directed to HR.]"


def _private_hr_reply(req: "ChatRequest", current_user: User, match: hr_confidential.ConfidentialMatch):
    """Answers a complaint / conflict / harassment / personal matter WITHOUT the agents: no LLM
    call, no agent run, no events, nothing stored except a placeholder. Streams one step for the
    activity panel and a final answer carrying an `hr_redirect` card for the frontend."""
    hr_email = settings.HR_CONTACT_EMAIL or "hr@acme.test"
    answer = hr_confidential.reply_for(match, current_user.name.split(" ")[0], hr_email)
    if req.conversation_id:
        save_message(req.conversation_id, "user", PRIVATE_PLACEHOLDER)
        save_message(req.conversation_id, "assistant", answer, routed_to="HR_PRIVATE")

    redirect = {
        "category": match.category,
        "category_label": hr_confidential.CATEGORY_LABELS[match.category],
        "urgent": match.urgent,
        "crisis": match.crisis,
        "hr_email": hr_email,
    }

    async def event_generator():
        step = {
            "type": "agent_event", "run_id": None, "seq": 1, "agent": "guard", "status": "completed",
            "caption": "Gus recognised a private matter and pointed you to HR. Nothing was saved.",
            "action": "private_hr_redirect", "detail": {}, "ts": None,
        }
        yield {"event": "agent_event", "data": json.dumps(step)}
        final = {
            "type": "final", "run_id": None, "seq": 2, "answer": answer, "sources": [], "route": None,
            "resolved": True, "ticket_number": None, "hr_redirect": redirect, "ts": None,
        }
        yield {"event": "final", "data": json.dumps(final)}

    return EventSourceResponse(event_generator())


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, current_user: User = Depends(get_current_user)):
    user = {
        "id": str(current_user.id), "name": current_user.name, "email": current_user.email,
        "role": current_user.role, "department": current_user.department,
        "manager_id": str(current_user.manager_id) if current_user.manager_id else None,
    }

    # Private HR matters (complaints, conflicts, harassment, personal issues) are checked first,
    # before anything is stored, logged or sent to a model — even mid-way through another
    # question's "did this solve your problem?" step.
    private = hr_confidential.detect(req.message)
    if private:
        return _private_hr_reply(req, current_user, private)

    queue: asyncio.Queue = asyncio.Queue()

    # A reply to a pending "did this solve your problem?"/"want a ticket?" gate continues the
    # SAME run instead of starting a fresh one — that's how the chatbot avoids ever creating a
    # ticket without an explicit "yes" from the user.
    awaiting = find_awaiting_reply_run(req.conversation_id) if req.conversation_id else None
    reset_step = pw_reset.open_step_for_run(str(awaiting["id"])) if awaiting else None
    leave_step = leave.open_step_for_run(str(awaiting["id"])) if awaiting else None
    if awaiting:
        # Inside a password reset: "which account?" takes an account name, the code step takes a
        # code / "resend" / "cancel". Inside a leave request: the type, the dates, the reason or
        # the final OK. Every other open question takes a yes/no.
        if reset_step:
            answers_it = pw_reset.answers_open_step(reset_step, req.message, is_gate_reply)
        elif leave_step:
            answers_it = leave.answers_open_step(leave_step, fix_spelling(req.message))
        else:
            answers_it = is_gate_reply(req.message)
        if not answers_it:
            # The person has moved on to a new question. Close the open question (no ticket is
            # created; a half-done password reset or leave request is cancelled) and answer it as
            # a fresh run.
            if reset_step:
                pw_reset.cancel_open_for_run(str(awaiting["id"]))
            if leave_step:
                leave.cancel_open_for_run(str(awaiting["id"]))
            update_run(str(awaiting["id"]), status="resolved", outcome="moved_on")
            awaiting = None

    if awaiting:
        # agent_runs.id is a Postgres `uuid` column — psycopg deserializes it as a uuid.UUID,
        # not a str, unlike new_run_id() below. Every subsequent emitted event carries this as
        # its `run_id` field, so an un-stringified UUID here crashes json.dumps mid-stream on
        # the very first event after a resume (TypeError: Object of type UUID is not JSON
        # serializable) — only reachable via the confirm_resolution/offer_ticket resume path,
        # never a fresh run, which is why it didn't show up in the original happy-path tests.
        run_id = str(awaiting["id"])
        if req.conversation_id:
            # A verification code is never kept in chat history.
            stored = CODE_PLACEHOLDER if reset_step == "code" and any(c.isdigit() for c in req.message) else req.message
            save_message(req.conversation_id, "user", stored, run_id=run_id)
        task = asyncio.create_task(resume_after_user_reply(run_id, req.message, queue=queue))
    else:
        run_id = new_run_id()
        if req.conversation_id:
            save_message(req.conversation_id, "user", req.message, run_id=run_id)
        # If the last turn asked "what's happening with your laptop?", this message is the
        # answer: search with the original question plus this detail. Chat history keeps the
        # person's own words; only the run's query is combined.
        query, clarified = req.message, False
        pending = find_pending_clarification(req.conversation_id) if req.conversation_id else None
        if pending:
            combined = clarify.combine_with_followup(pending["query"], req.message)
            if combined:
                query, clarified = combined, True
        task = asyncio.create_task(
            start_chat(user, query, req.conversation_id, run_id, queue, clarified=clarified)
        )

    async def event_generator():
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield {"event": item.get("type", "message"), "data": json.dumps(item)}
        finally:
            if not task.done():
                task.cancel()

    return EventSourceResponse(event_generator())


@router.get("/runs/{run_id}/events")
def get_run_events(run_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if not (current_user.role == "it_support" and can_view_run(db, run_id, current_user)):
        ensure_self_or_roles(current_user, run["user_id"], "hr", "admin")
    return {"run_id": run_id, "status": run["status"], "events": load_events_for_run(run_id)}
