"""GET /api/hr/overview, GET /api/hr/leave-requests, PATCH /api/hr/leave-requests/{id}/decide
— the HR Insights page's backing data: company-wide headcount/leave posture plus the real
pending leave requests HR actually has to act on (seeded at ~15% pending, see
app/seed/generators/ops.py). HR/admin only."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles
from app.mock_apis import log_action
from app.models.user import User

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


@router.patch("/leave-requests/{leave_request_id}/decide")
def decide_leave_request(
    leave_request_id: str, req: DecideLeaveRequest,
    current_user: User = Depends(require_roles("hr", "admin")), db: Session = Depends(get_db),
):
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")

    lr = db.execute(
        text("SELECT id, user_id, leave_type, days, status FROM leave_requests WHERE id = :id"),
        {"id": leave_request_id},
    ).mappings().first()
    if not lr:
        raise HTTPException(404, "Leave request not found")
    if lr["status"] != "pending":
        raise HTTPException(409, f"Leave request already {lr['status']}")

    db.execute(
        text("UPDATE leave_requests SET status = :status WHERE id = :id"),
        {"status": req.decision, "id": leave_request_id},
    )
    if req.decision == "approved":
        db.execute(
            text(
                "UPDATE leave_balances SET used_days = used_days + :days WHERE user_id = :uid AND leave_type = :lt"
            ),
            {"days": lr["days"], "uid": str(lr["user_id"]), "lt": lr["leave_type"]},
        )
    db.commit()
    log_action(str(current_user.id), f"leave_request_{req.decision}", "leave_request", leave_request_id, {})
    return {"id": leave_request_id, "status": req.decision}
