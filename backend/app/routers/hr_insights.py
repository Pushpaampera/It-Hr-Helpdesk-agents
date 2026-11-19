"""GET /api/hr/overview, GET /api/hr/leave-requests, PATCH /api/hr/leave-requests/{id}/decide
— the HR Insights page's backing data: company-wide headcount/leave posture plus the real
pending leave requests HR actually has to act on (seeded at ~15% pending, see
app/seed/generators/ops.py). HR/admin only."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles
from app.mock_apis import log_action
from app.models.user import User
from app.notify import notify, notify_after_undo_window

router = APIRouter(prefix="/api/hr", tags=["hr"], dependencies=[Depends(require_roles("hr", "admin"))])


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    headcount = db.execute(
        text("SELECT department, count(*) AS n FROM users WHERE is_active GROUP BY department ORDER BY department")
    ).mappings().all()

    leave_counts = db.execute(
        text("SELECT status, count(*) AS n FROM leave_requests GROUP BY status")
    ).mappings().all()
    leave_by_status = {r["status"]: r["n"] for r in leave_counts}

    balances = db.execute(
        text(
            """SELECT leave_type, sum(total_days) AS total, sum(used_days) AS used
               FROM leave_balances GROUP BY leave_type ORDER BY leave_type"""
        )
    ).mappings().all()

    upcoming = db.execute(
        text(
            """SELECT lr.id, lr.user_id, u.name AS user_name, lr.leave_type, lr.start_date, lr.end_date, lr.days
               FROM leave_requests lr JOIN users u ON u.id = lr.user_id
               WHERE lr.status = 'approved' AND lr.start_date >= :today
               ORDER BY lr.start_date LIMIT 10"""
        ),
        {"today": date.today()},
    ).mappings().all()

    return {
        "headcount_by_department": [{"department": r["department"], "count": r["n"]} for r in headcount],
        "leave_requests_by_status": {
            "pending": leave_by_status.get("pending", 0),
            "approved": leave_by_status.get("approved", 0),
            "rejected": leave_by_status.get("rejected", 0),
        },
        "leave_balances_by_type": [
            {
                "leave_type": r["leave_type"], "total_days": r["total"] or 0, "used_days": r["used"] or 0,
                "utilization": round((r["used"] or 0) / r["total"], 4) if r["total"] else 0.0,
            }
            for r in balances
        ],
        "upcoming_approved_leave": [
            {
                "id": str(r["id"]), "user_id": str(r["user_id"]), "user_name": r["user_name"],
                "leave_type": r["leave_type"], "start_date": r["start_date"].isoformat(),
                "end_date": r["end_date"].isoformat(), "days": r["days"],
            }
            for r in upcoming
        ],
    }


@router.get("/leave-requests")
def list_leave_requests(status: str | None = None, db: Session = Depends(get_db)):
    where = "WHERE lr.status = :status" if status else ""
    params = {"status": status} if status else {}
    rows = db.execute(
        text(
            f"""SELECT lr.id, lr.user_id, u.name AS user_name, u.department, lr.leave_type,
                   lr.start_date, lr.end_date, lr.days, lr.reason, lr.status, lr.created_at
               FROM leave_requests lr JOIN users u ON u.id = lr.user_id
               {where} ORDER BY lr.created_at DESC"""
        ),
        params,
    ).mappings().all()
    return [
        {
            "id": str(r["id"]), "user_id": str(r["user_id"]), "user_name": r["user_name"],
            "department": r["department"], "leave_type": r["leave_type"],
            "start_date": r["start_date"].isoformat(), "end_date": r["end_date"].isoformat(),
            "days": r["days"], "reason": r["reason"], "status": r["status"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


class DecideLeaveRequest(BaseModel):
    decision: str  # "approved" | "rejected"
    comment: str | None = None


@router.patch("/leave-requests/{leave_request_id}/decide")
def decide_leave_request(
    leave_request_id: str, req: DecideLeaveRequest, background: BackgroundTasks,
    current_user: User = Depends(require_roles("hr", "admin")), db: Session = Depends(get_db),
):
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")
    if req.decision == "rejected" and not (req.comment or "").strip():
        raise HTTPException(400, "A reason is required to reject a request")

    lr = db.execute(
        text("SELECT id, user_id, leave_type, start_date, end_date, days, status FROM leave_requests WHERE id = :id"),
        {"id": leave_request_id},
    ).mappings().first()
    if not lr:
        raise HTTPException(404, "Leave request not found")
    if lr["status"] != "pending":
        raise HTTPException(409, f"Leave request already {lr['status']}")

    comment = (req.comment or "").strip() or None
    decided_at = db.execute(
        text("""UPDATE leave_requests SET status = :status, decided_at = now(), decided_by = :by,
                       decision_comment = :comment
                WHERE id = :id RETURNING decided_at"""),
        {"status": req.decision, "id": leave_request_id, "by": str(current_user.id), "comment": comment},
    ).scalar_one()
    if req.decision == "approved":
        db.execute(
            text(
                "UPDATE leave_balances SET used_days = used_days + :days WHERE user_id = :uid AND leave_type = :lt"
            ),
            {"days": lr["days"], "uid": str(lr["user_id"]), "lt": lr["leave_type"]},
        )
    db.commit()
    log_action(str(current_user.id), f"leave_request_{req.decision}", "leave_request", leave_request_id, {"comment": req.comment})
    background.add_task(
        notify_after_undo_window,
        lambda: _still_decided(leave_request_id, req.decision, decided_at),
        lambda: _tell_employee(dict(lr), req.decision, comment, current_user.name),
    )
    return {"id": leave_request_id, "status": req.decision}


def _still_decided(leave_request_id: str, decision: str, decided_at) -> bool:
    """True if the decision wasn't undone (or undone and re-decided) during the Undo window."""
    from app.db import get_engine

    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT status, decided_at FROM leave_requests WHERE id = :id"), {"id": leave_request_id}
        ).mappings().first()
    return bool(row) and row["status"] == decision and row["decided_at"] == decided_at


def _tell_employee(lr: dict, decision: str, comment: str | None, hr_name: str) -> None:
    days = lr["days"]
    days_txt = f"{int(days) if float(days).is_integer() else days} day{'' if days == 1 else 's'}"
    fmt = lambda d: f"{d.day} {d.strftime('%b %Y')}"  # noqa: E731
    dates = fmt(lr["start_date"]) if lr["start_date"] == lr["end_date"] else f"{fmt(lr['start_date'])} to {fmt(lr['end_date'])}"
    leave = f"{lr['leave_type']} leave ({days_txt}, {dates})"
    if decision == "approved":
        title = "Your leave has been approved"
        body = f"{hr_name} from HR approved your {leave}."
        if comment:
            body += f"\nNote from HR: {comment}"
    else:
        title = "Your leave request was not approved"
        body = f"{hr_name} from HR rejected your {leave}.\nReason: {comment}\nIf you have questions, reply through Talk to HR or ask the Assistant."
    notify(str(lr["user_id"]), f"leave_{decision}", title, body, important=True)


@router.post("/leave-requests/{leave_request_id}/undo")
def undo_leave_request(
    leave_request_id: str,
    current_user: User = Depends(require_roles("hr", "admin")), db: Session = Depends(get_db),
):
    """Reverts a just-decided leave request back to pending, within a 5-second window —
    restoring any leave balance deducted on approval. Mirrors approvals_api.undo's scope
    boundary: nothing downstream of the decision is unwound, only this record."""
    lr = db.execute(
        text("SELECT id, user_id, leave_type, days, status, decided_at FROM leave_requests WHERE id = :id"),
        {"id": leave_request_id},
    ).mappings().first()
    if not lr:
        raise HTTPException(404, "Leave request not found")
    if lr["status"] not in ("approved", "rejected"):
        raise HTTPException(409, "This leave request hasn't been decided yet")
    decided_at = lr["decided_at"]
    if decided_at is None:
        raise HTTPException(409, "No decision timestamp on record")
    decided_at_aware = decided_at if decided_at.tzinfo else decided_at.replace(tzinfo=timezone.utc)
    if (datetime.now(timezone.utc) - decided_at_aware).total_seconds() > 5:
        raise HTTPException(409, "The undo window has expired")

    if lr["status"] == "approved":
        db.execute(
            text(
                "UPDATE leave_balances SET used_days = used_days - :days WHERE user_id = :uid AND leave_type = :lt"
            ),
            {"days": lr["days"], "uid": str(lr["user_id"]), "lt": lr["leave_type"]},
        )
    db.execute(
        text("UPDATE leave_requests SET status = 'pending', decided_at = NULL, decided_by = NULL, decision_comment = NULL WHERE id = :id"),
        {"id": leave_request_id},
    )
    db.commit()
    log_action(str(current_user.id), "leave_request_undo", "leave_request", leave_request_id, {})
    return {"id": leave_request_id, "status": "pending"}
