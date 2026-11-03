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
from app.agents.graph import start_chat
from app.agents.runs_store import get_run, save_message
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

    run_id = new_run_id()
    queue: asyncio.Queue = asyncio.Queue()

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
