"""GET /api/bandit/stats — arm pulls, average reward over time, a simple regret estimate, and
per-context win rates, for the Reinforcement Lab dashboard. Manager/hr/admin only."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles

router = APIRouter(
    prefix="/api/bandit", tags=["bandit"], dependencies=[Depends(require_roles("manager", "hr", "admin"))]
)


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    arms = db.execute(
        text(
            """SELECT a.id, a.name, a.config, s.pulls,
                   (SELECT avg(rw.reward) FROM bandit_rewards rw
                    JOIN bandit_decisions d ON d.id = rw.decision_id WHERE d.arm_id = a.id) AS avg_reward
               FROM bandit_arms a LEFT JOIN bandit_state s ON s.arm_id = a.id ORDER BY a.name"""
        )
    ).mappings().all()
    arm_rows = [
        {
            "arm_id": str(a["id"]), "name": a["name"], "config": a["config"], "pulls": a["pulls"] or 0,
            "avg_reward": round(a["avg_reward"], 4) if a["avg_reward"] is not None else None,
        }
        for a in arms
    ]

    best_reward = max((a["avg_reward"] for a in arm_rows if a["avg_reward"] is not None), default=None)
    total_pulls = sum(a["pulls"] for a in arm_rows)
    cumulative_regret = None
    if best_reward is not None:
        cumulative_regret = round(
            sum((best_reward - (a["avg_reward"] or 0.0)) * a["pulls"] for a in arm_rows), 4
        )

    reward_over_time = db.execute(
        text(
            """SELECT date_trunc('day', rw.created_at) AS day, a.name AS arm, avg(rw.reward) AS avg_reward,
                   count(*) AS pulls
               FROM bandit_rewards rw
               JOIN bandit_decisions d ON d.id = rw.decision_id
               JOIN bandit_arms a ON a.id = d.arm_id
               GROUP BY day, a.name ORDER BY day"""
        )
    ).mappings().all()

    win_rates = db.execute(
        text(
            """SELECT (d.context->>'dept') AS dept,
                   (d.context->'features'->>5)::float > 0.5 AS has_error_code,
                   a.name AS arm, count(*) AS n
               FROM bandit_decisions d JOIN bandit_arms a ON a.id = d.arm_id
               WHERE d.context ? 'dept'
               GROUP BY dept, has_error_code, a.name"""
        )
    ).mappings().all()

    return {
        "arms": arm_rows,
        "total_pulls": total_pulls,
        "best_arm": max(arm_rows, key=lambda a: a["avg_reward"] or -1.0)["name"] if arm_rows else None,
        "cumulative_regret": cumulative_regret,
        "reward_over_time": [
            {"day": r["day"].date().isoformat(), "arm": r["arm"], "avg_reward": round(r["avg_reward"], 4), "pulls": r["pulls"]}
            for r in reward_over_time
        ],
        "context_win_rates": [
            {"dept": r["dept"], "has_error_code": bool(r["has_error_code"]), "arm": r["arm"], "n": r["n"]}
            for r in win_rates
        ],
    }
