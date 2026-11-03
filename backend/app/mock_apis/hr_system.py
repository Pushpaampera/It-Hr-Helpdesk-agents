"""Mock HR system API: leave balances, leave requests, payslips."""
from sqlalchemy import text

from app.db import get_engine
from app.mock_apis import log_action


def get_leave_balances(user_id: str) -> list[dict]:
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT leave_type, total_days, used_days FROM leave_balances WHERE user_id = :uid"),
            {"uid": user_id},
        ).mappings().all()
    return [
        {"leave_type": r["leave_type"], "total_days": r["total_days"], "used_days": r["used_days"],
         "remaining_days": r["total_days"] - r["used_days"]}
        for r in rows
    ]


def apply_leave(user_id: str, leave_type: str, start_date: str, end_date: str, reason: str) -> dict:
    from datetime import date

    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    days = (end - start).days + 1

    engine = get_engine()
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, days, reason, status)
                   VALUES (:uid, :lt, :start, :end, :days, :reason, 'approved') RETURNING id"""
            ),
            {"uid": user_id, "lt": leave_type, "start": start, "end": end, "days": days, "reason": reason},
        ).mappings().first()
        conn.execute(
            text(
                "UPDATE leave_balances SET used_days = used_days + :days WHERE user_id = :uid AND leave_type = :lt"
            ),
            {"days": days, "uid": user_id, "lt": leave_type},
        )
    log_action(user_id, "apply_leave", "leave_request", str(row["id"]),
               {"leave_type": leave_type, "start_date": start_date, "end_date": end_date, "days": days})
    return {"leave_request_id": str(row["id"]), "leave_type": leave_type, "days": days, "status": "approved"}


def get_payslip(user_id: str, month: str | None = None) -> dict | None:
    engine = get_engine()
    with engine.connect() as conn:
        if month:
            row = conn.execute(
                text("SELECT month, gross, net, deductions FROM payslips WHERE user_id = :uid AND month = :m"),
                {"uid": user_id, "m": month},
            ).mappings().first()
        else:
            row = conn.execute(
                text("SELECT month, gross, net, deductions FROM payslips WHERE user_id = :uid ORDER BY month DESC LIMIT 1"),
                {"uid": user_id},
            ).mappings().first()
    if not row:
        return None
    log_action(user_id, "view_payslip", "payslip", str(user_id), {"month": row["month"]})
    return dict(row)
