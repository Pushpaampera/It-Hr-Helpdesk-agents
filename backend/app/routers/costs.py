"""GET /api/costs — token/cost breakdown over agent_runs, for the Cost Observatory dashboard.
Manager/hr/admin only."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles

router = APIRouter(
    prefix="/api/costs", tags=["costs"], dependencies=[Depends(require_roles("manager", "hr", "admin"))]
)


@router.get("")
def costs(days: int = 30, db: Session = Depends(get_db)):
    totals = db.execute(
        text(
            """SELECT sum(cost_usd) AS total_cost_usd, sum(tokens_in) AS total_tokens_in,
                   sum(tokens_out) AS total_tokens_out, count(*) AS total_runs
               FROM agent_runs WHERE created_at >= now() - (:days || ' days')::interval"""
        ),
        {"days": days},
    ).mappings().first()

    by_day = db.execute(
        text(
            """SELECT date_trunc('day', created_at) AS day, sum(cost_usd) AS cost_usd,
                   sum(tokens_in) AS tokens_in, sum(tokens_out) AS tokens_out
               FROM agent_runs WHERE created_at >= now() - (:days || ' days')::interval
               GROUP BY day ORDER BY day"""
        ),
        {"days": days},
    ).mappings().all()

    by_route = db.execute(
        text(
            """SELECT coalesce(route, 'OTHER') AS route, sum(cost_usd) AS cost_usd,
                   sum(tokens_in) AS tokens_in, sum(tokens_out) AS tokens_out, count(*) AS runs
               FROM agent_runs WHERE created_at >= now() - (:days || ' days')::interval
               GROUP BY route ORDER BY route"""
        ),
        {"days": days},
    ).mappings().all()

    by_model = db.execute(
        text(
            """SELECT model, sum(tokens_in + tokens_out) AS tokens, count(*) AS calls
               FROM agent_events WHERE model IS NOT NULL AND ts >= now() - (:days || ' days')::interval
               GROUP BY model ORDER BY tokens DESC"""
        ),
        {"days": days},
    ).mappings().all()

    return {
        "total_cost_usd": round(totals["total_cost_usd"] or 0, 4),
        "total_tokens_in": int(totals["total_tokens_in"] or 0),
        "total_tokens_out": int(totals["total_tokens_out"] or 0),
        "total_runs": totals["total_runs"] or 0,
        "by_day": [
            {"day": r["day"].date().isoformat(), "cost_usd": round(r["cost_usd"] or 0, 4),
             "tokens_in": int(r["tokens_in"] or 0), "tokens_out": int(r["tokens_out"] or 0)}
            for r in by_day
        ],
        "by_route": [
            {"route": r["route"], "cost_usd": round(r["cost_usd"] or 0, 4),
             "tokens_in": int(r["tokens_in"] or 0), "tokens_out": int(r["tokens_out"] or 0), "runs": r["runs"]}
            for r in by_route
        ],
        "by_model": [
            {"model": r["model"], "tokens": int(r["tokens"] or 0), "calls": r["calls"]} for r in by_model
        ],
    }
