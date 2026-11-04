"""POST /api/chat/stream (SSE) and GET /api/runs/{id}/events (replay).

Phase 4: wrapped with the real JWT auth dependency — the caller's identity comes from the
bearer token, not a user_id body field (Phase 3's interim approach).
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agents.events import load_events_for_run, new_run_id
from app.agents.graph import resume_after_user_reply, start_chat
from app.agents.runs_store import find_awaiting_reply_run, get_run, save_message
from app.deps import ensure_self_or_roles, get_current_user
from app.models.user import User

router = APIRouter(prefix="/api", tags=["chat"])


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

    queue: asyncio.Queue = asyncio.Queue()

    # A reply to a pending "did this solve your problem?"/"want a ticket?" gate continues the
    # SAME run instead of starting a fresh one — that's how the chatbot avoids ever creating a
    # ticket without an explicit "yes" from the user.
    awaiting = find_awaiting_reply_run(req.conversation_id) if req.conversation_id else None

    if awaiting:
        # agent_runs.id is a Postgres `uuid` column — psycopg deserializes it as a uuid.UUID,
        # not a str, unlike new_run_id() below. Every subsequent emitted event carries this as
        # its `run_id` field, so an un-stringified UUID here crashes json.dumps mid-stream on
        # the very first event after a resume (TypeError: Object of type UUID is not JSON
        # serializable) — only reachable via the confirm_resolution/offer_ticket resume path,
        # never a fresh run, which is why it didn't show up in the original happy-path tests.
        run_id = str(awaiting["id"])
        if req.conversation_id:
            save_message(req.conversation_id, "user", req.message, run_id=run_id)
        task = asyncio.create_task(resume_after_user_reply(run_id, req.message, queue=queue))
    else:
        run_id = new_run_id()
        if req.conversation_id:
            save_message(req.conversation_id, "user", req.message, run_id=run_id)
        task = asyncio.create_task(start_chat(user, req.message, req.conversation_id, run_id, queue))

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
def get_run_events(run_id: str, current_user: User = Depends(get_current_user)):
    run = get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    ensure_self_or_roles(current_user, run["user_id"], "manager", "hr", "admin")
    return {"run_id": run_id, "status": run["status"], "events": load_events_for_run(run_id)}
