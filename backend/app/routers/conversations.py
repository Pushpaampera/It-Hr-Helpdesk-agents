"""POST/GET /api/conversations (create/list) and GET /api/conversations/{id} (detail +
messages). A conversation row must exist before `app/agents/runs_store.py::save_message` can
attach a message to it, so this router owns conversation creation."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_self_or_roles, get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class CreateConversationRequest(BaseModel):
    title: str | None = None


@router.post("")
def create_conversation(
    req: CreateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            """INSERT INTO conversations (user_id, title) VALUES (:uid, :title)
               RETURNING id, user_id, title, status, created_at"""
        ),
        {"uid": str(current_user.id), "title": req.title or "New conversation"},
    ).mappings().first()
    db.commit()
    return dict(row)


@router.get("")
def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """SELECT c.id, c.title, c.status, c.created_at,
                   (SELECT m.content FROM messages m WHERE m.conversation_id = c.id
                    ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                   (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
               FROM conversations c WHERE c.user_id = :uid ORDER BY c.created_at DESC"""
        ),
        {"uid": str(current_user.id)},
    ).mappings().all()
    return [dict(row) for row in rows]


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    conv = db.execute(
        text("SELECT id, user_id, title, status, created_at FROM conversations WHERE id = :id"),
        {"id": conversation_id},
    ).mappings().first()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    ensure_self_or_roles(current_user, conv["user_id"], "manager", "hr", "admin")

    messages = db.execute(
        text(
            """SELECT id, role, content, routed_to, confidence, sources, run_id, created_at
               FROM messages WHERE conversation_id = :id ORDER BY created_at"""
        ),
        {"id": conversation_id},
    ).mappings().all()
    return {"conversation": dict(conv), "messages": [dict(m) for m in messages]}
