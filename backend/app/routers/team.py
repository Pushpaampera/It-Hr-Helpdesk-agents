"""GET /api/team — a manager's direct reports plus enough real per-person signal (open
tickets, pending leave requests, last activity) to make the Team page useful rather than just
a name list. Manager/admin only (admin can pass ?manager_id= to view any manager's team;
without it, admin sees the whole company since they have no manager_id of their own)."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/api/team", tags=["team"], dependencies=[Depends(require_roles("manager", "admin"))])


@router.get("")
def list_team(
    manager_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_manager_id = manager_id if (manager_id and current_user.role == "admin") else str(current_user.id)

    members = db.execute(
        text(
            """SELECT id, name, email, title, department, created_at
               FROM users WHERE manager_id = :mid AND is_active ORDER BY name"""
        ),
        {"mid": target_manager_id},
    ).mappings().all()

    result = []
    for m in members:
        uid = str(m["id"])
        tickets = db.execute(
            text(
                """SELECT count(*) AS total,
                       count(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) AS open
                   FROM tickets WHERE user_id = :uid"""
            ),
            {"uid": uid},
        ).mappings().first()
        pending_leave = db.execute(
            text("SELECT count(*) AS n FROM leave_requests WHERE user_id = :uid AND status = 'pending'"),
            {"uid": uid},
        ).mappings().first()
        last_run = db.execute(
            text("SELECT max(created_at) AS last_at FROM agent_runs WHERE user_id = :uid"),
            {"uid": uid},
        ).mappings().first()
        result.append({
            "id": uid, "name": m["name"], "email": m["email"], "title": m["title"], "department": m["department"],
            "open_tickets": tickets["open"] or 0, "total_tickets": tickets["total"] or 0,
            "pending_leave_requests": pending_leave["n"] or 0,
            "last_activity_at": last_run["last_at"].isoformat() if last_run["last_at"] else None,
        })
    return result
