"""GET /api/analytics/kpis, /timeseries, /departments — dashboard charts over agent_runs,
feedback, tickets and approvals. HR/admin only (company-wide numbers, not an
employee's own data)."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles

router = APIRouter(
    prefix="/api/analytics", tags=["analytics"], dependencies=[Depends(require_roles("hr", "admin"))]
)


@router.get("/kpis")
def kpis(db: Session = Depends(get_db)):
    runs = db.execute(
        text(
            """SELECT count(*) AS total_runs,
                   count(*) FILTER (WHERE status = 'resolved') AS resolved_runs,
                   count(*) FILTER (WHERE status = 'escalated') AS escalated_runs,
                   avg(total_latency_ms) AS avg_latency_ms,
                   sum(cost_usd) AS total_cost_usd
               FROM agent_runs"""
        )
    ).mappings().first()
    feedback = db.execute(text("SELECT avg(rating) AS avg_rating, count(*) AS total_feedback FROM feedback")).mappings().first()
    tickets = db.execute(
        text("SELECT count(*) AS open_tickets FROM tickets WHERE status NOT IN ('resolved', 'closed')")
    ).mappings().first()
    approvals = db.execute(text("SELECT count(*) AS pending_approvals FROM approvals WHERE status = 'pending'")).mappings().first()

    total = runs["total_runs"] or 0
    return {
        "total_runs": total,
        "resolved_runs": runs["resolved_runs"] or 0,
        "escalated_runs": runs["escalated_runs"] or 0,
        "resolved_rate": round((runs["resolved_runs"] or 0) / total, 4) if total else 0.0,
        "escalation_rate": round((runs["escalated_runs"] or 0) / total, 4) if total else 0.0,
        "avg_latency_ms": round(runs["avg_latency_ms"] or 0, 1),
        "total_cost_usd": round(runs["total_cost_usd"] or 0, 4),
        "avg_rating": round(feedback["avg_rating"] or 0, 2),
        "total_feedback": feedback["total_feedback"] or 0,
        "open_tickets": tickets["open_tickets"] or 0,
        "pending_approvals": approvals["pending_approvals"] or 0,
    }


@router.get("/timeseries")
def timeseries(days: int = 30, db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """SELECT date_trunc('day', r.created_at) AS day,
                   count(*) AS total_runs,
                   count(*) FILTER (WHERE r.status = 'resolved') AS resolved_runs,
                   count(*) FILTER (WHERE r.status = 'escalated') AS escalated_runs,
                   avg(f.rating) AS avg_rating
               FROM agent_runs r LEFT JOIN feedback f ON f.run_id = r.id
               WHERE r.created_at >= now() - (:days || ' days')::interval
               GROUP BY day ORDER BY day"""
        ),
        {"days": days},
    ).mappings().all()
    return [
        {
            "day": r["day"].date().isoformat(), "total_runs": r["total_runs"],
            "resolved_runs": r["resolved_runs"], "escalated_runs": r["escalated_runs"],
            "avg_rating": round(r["avg_rating"], 2) if r["avg_rating"] is not None else None,
        }
        for r in rows
    ]


@router.get("/departments")
def departments(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """SELECT r.route,
                   count(*) AS total_runs,
                   count(*) FILTER (WHERE r.status = 'resolved') AS resolved_runs,
                   count(*) FILTER (WHERE r.status = 'escalated') AS escalated_runs,
                   avg(r.total_latency_ms) AS avg_latency_ms,
                   avg(f.rating) AS avg_rating
               FROM agent_runs r LEFT JOIN feedback f ON f.run_id = r.id
               WHERE r.route IS NOT NULL
               GROUP BY r.route ORDER BY r.route"""
        )
    ).mappings().all()
    return [
        {
            "route": r["route"], "total_runs": r["total_runs"], "resolved_runs": r["resolved_runs"],
            "escalated_runs": r["escalated_runs"],
            "avg_latency_ms": round(r["avg_latency_ms"] or 0, 1),
            "avg_rating": round(r["avg_rating"], 2) if r["avg_rating"] is not None else None,
        }
        for r in rows
    ]
