"""GET /api/tickets (list), GET /api/tickets/{id} (detail + events), PATCH /api/tickets/{id}
(update). Employees see only their own tickets; manager/hr/admin see every ticket."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_self_or_roles, get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/tickets", tags=["tickets"])

STAFF_ROLES = ("manager", "hr", "admin")
VALID_STATUSES = ("open", "in_progress", "waiting", "resolved", "closed")
VALID_PRIORITIES = ("low", "medium", "high", "urgent")


@router.get("")
def list_tickets(
    status: str | None = None,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    where = []
    params: dict = {}
    if current_user.role not in STAFF_ROLES:
        where.append("t.user_id = :uid")
        params["uid"] = str(current_user.id)
    if status:
        where.append("t.status = :status")
        params["status"] = status
    if category:
        where.append("t.category = :category")
        params["category"] = category
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = db.execute(
        text(
            f"""SELECT t.id, t.number, t.user_id, u.name AS user_name, t.category, t.priority,
                   t.status, t.summary, t.assignee_id, a.name AS assignee_name, t.resolved_at, t.created_at
               FROM tickets t JOIN users u ON u.id = t.user_id
               LEFT JOIN users a ON a.id = t.assignee_id
               {clause} ORDER BY t.created_at DESC"""
        ),
        params,
    ).mappings().all()
    return [dict(row) for row in rows]


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = db.execute(
        text(
            """SELECT t.*, u.name AS user_name FROM tickets t JOIN users u ON u.id = t.user_id
               WHERE t.id = :id"""
        ),
        {"id": ticket_id},
    ).mappings().first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    ensure_self_or_roles(current_user, ticket["user_id"], *STAFF_ROLES)

    events = db.execute(
        text("SELECT id, actor, type, note, created_at FROM ticket_events WHERE ticket_id = :id ORDER BY created_at"),
        {"id": ticket_id},
    ).mappings().all()
    return {"ticket": dict(ticket), "events": [dict(e) for e in events]}


class UpdateTicketRequest(BaseModel):
    status: str | None = None
    priority: str | None = None
    assignee_id: str | None = None
    note: str | None = None


@router.patch("/{ticket_id}")
def update_ticket(
    ticket_id: str, req: UpdateTicketRequest,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(403, "Only manager/hr/admin can update tickets")
    ticket = db.execute(text("SELECT id, status FROM tickets WHERE id = :id"), {"id": ticket_id}).mappings().first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if req.status is not None and req.status not in VALID_STATUSES:
        raise HTTPException(400, f"status must be one of {VALID_STATUSES}")
    if req.priority is not None and req.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {VALID_PRIORITIES}")

    sets = []
    params: dict = {"id": ticket_id}
    if req.status is not None:
        sets.append("status = :status")
        params["status"] = req.status
        if req.status in ("resolved", "closed"):
            sets.append("resolved_at = now()")
    if req.priority is not None:
        sets.append("priority = :priority")
        params["priority"] = req.priority
    if req.assignee_id is not None:
        sets.append("assignee_id = :assignee_id")
        params["assignee_id"] = req.assignee_id

    if sets:
        db.execute(text(f"UPDATE tickets SET {', '.join(sets)} WHERE id = :id"), params)

    if req.status is not None or req.note:
        note = req.note or f"Status changed to {req.status}."
        db.execute(
            text("INSERT INTO ticket_events (ticket_id, actor, type, note) VALUES (:id, :actor, :type, :note)"),
            {"id": ticket_id, "actor": current_user.name, "type": "status_change" if req.status else "note", "note": note},
        )
    db.commit()
    return get_ticket(ticket_id, current_user, db)
