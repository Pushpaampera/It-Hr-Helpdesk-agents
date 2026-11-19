"""GET /api/notifications, POST /api/notifications/{id}/read, POST /api/notifications/read-all,
GET/PUT /api/notifications/preferences — the signed-in person's own notifications for the bell in
the top bar, and their choice of which ones are also emailed. Every query is scoped to
the current user: nobody (admins included) can read anyone else's notifications."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.notify import email_configured

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def my_notifications(limit: int = 30, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    limit = max(1, min(limit, 100))
    rows = db.execute(
        text("""SELECT id, kind, title, body, link, email_status, read_at, created_at
                FROM notifications WHERE user_id = :uid ORDER BY created_at DESC LIMIT :limit"""),
        {"uid": str(current_user.id), "limit": limit},
    ).mappings().all()
    unread = db.execute(
        text("SELECT count(*) FROM notifications WHERE user_id = :uid AND read_at IS NULL"),
        {"uid": str(current_user.id)},
    ).scalar_one()
    return {
        "unread_count": unread,
        "items": [
            {
                "id": str(r["id"]), "kind": r["kind"], "title": r["title"], "body": r["body"], "link": r["link"],
                "email_status": r["email_status"], "read": r["read_at"] is not None,
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
    }


class Preferences(BaseModel):
    email: Literal["important", "all", "off"]


def _preferences(db: Session, user: User) -> dict:
    pref = db.execute(
        text("SELECT email_notifications FROM users WHERE id = :id"), {"id": str(user.id)}
    ).scalar_one()
    return {"email": pref, "email_available": email_configured()}


@router.get("/preferences")
def get_preferences(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _preferences(db, current_user)


@router.put("/preferences")
def set_preferences(body: Preferences, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(
        text("UPDATE users SET email_notifications = :p WHERE id = :id"), {"p": body.email, "id": str(current_user.id)}
    )
    db.commit()
    return _preferences(db, current_user)


@router.post("/read-all")
def mark_all_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(
        text("UPDATE notifications SET read_at = now() WHERE user_id = :uid AND read_at IS NULL"),
        {"uid": str(current_user.id)},
    )
    db.commit()
    return {"ok": True}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        res = db.execute(
            text("""UPDATE notifications SET read_at = coalesce(read_at, now())
                    WHERE id = :id AND user_id = :uid"""),
            {"id": notification_id, "uid": str(current_user.id)},
        )
    except Exception:  # noqa: BLE001 — a malformed id is just "not found"
        db.rollback()
        raise HTTPException(404, "Notification not found")
    if res.rowcount == 0:
        raise HTTPException(404, "Notification not found")
    db.commit()
    return {"ok": True}
