"""POST /api/chat/stream (SSE) and GET /api/runs/{id}/events (replay).

Phase 3 scope: no JWT auth wiring yet (that's Phase 4) — the caller identifies the user by
user_id in the request body. Phase 4 wraps this with the real auth dependency.
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agents.events import load_events_for_run, new_run_id
from app.agents.graph import start_chat
from app.agents.runs_store import get_run, save_message
from app.mock_apis.directory import get_user

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    user_id: str
    message: str
    conversation_id: str | None = None


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    user = get_user(req.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user = {k: str(v) if v is not None else v for k, v in user.items()}

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
def get_run_events(run_id: str):
    run = get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return {"run_id": run_id, "status": run["status"], "events": load_events_for_run(run_id)}
