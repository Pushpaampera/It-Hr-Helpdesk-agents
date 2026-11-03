"""Loads/saves LinUCB arm state from/to the bandit_arms / bandit_state tables."""
import json

from sqlalchemy import text

from app.bandit.linucb import LinUCBArm
from app.db import get_engine


def load_arms() -> dict[str, tuple[str, LinUCBArm]]:
    """Returns {arm_name: (arm_id, LinUCBArm)}."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """SELECT a.id, a.name, s.a_matrix, s.b_vector
                   FROM bandit_arms a LEFT JOIN bandit_state s ON s.arm_id = a.id"""
            )
        ).mappings().all()
    arms = {}
    for r in rows:
        a_matrix = r["a_matrix"] if r["a_matrix"] is not None else None
        b_vector = r["b_vector"] if r["b_vector"] is not None else None
        arms[r["name"]] = (str(r["id"]), LinUCBArm(a_matrix=a_matrix, b_vector=b_vector))
    return arms


def record_decision(run_id: str, context: dict, arm_id: str, ucb_scores: dict) -> str:
    import uuid

    decision_id = str(uuid.uuid4())
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """INSERT INTO bandit_decisions (id, run_id, context, arm_id, ucb_scores)
                   VALUES (:id, :run_id, :context, :arm_id, :ucb_scores)"""
            ),
            {"id": decision_id, "run_id": run_id, "context": json.dumps(context), "arm_id": arm_id,
             "ucb_scores": json.dumps(ucb_scores)},
        )
    return decision_id


def save_arm_state(arm_id: str, arm: LinUCBArm, pulls_increment: int = 1) -> None:
    state = arm.to_json()
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """INSERT INTO bandit_state (arm_id, a_matrix, b_vector, pulls, updated_at)
                   VALUES (:arm_id, :a, :b, :pulls, now())
                   ON CONFLICT (arm_id) DO UPDATE SET a_matrix = :a, b_vector = :b,
                       pulls = bandit_state.pulls + :pulls, updated_at = now()"""
            ),
            {"arm_id": arm_id, "a": json.dumps(state["a_matrix"]), "b": json.dumps(state["b_vector"]),
             "pulls": pulls_increment},
        )


def record_reward(decision_id: str, reward: float) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO bandit_rewards (decision_id, reward) VALUES (:decision_id, :reward)"),
            {"decision_id": decision_id, "reward": reward},
        )


def find_decision_for_run(run_id: str) -> dict | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, arm_id FROM bandit_decisions WHERE run_id = :run_id ORDER BY created_at DESC LIMIT 1"),
            {"run_id": run_id},
        ).mappings().first()
    return dict(row) if row else None


def arm_name_by_id(arm_id: str) -> str | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(text("SELECT name FROM bandit_arms WHERE id = :id"), {"id": arm_id}).mappings().first()
    return row["name"] if row else None
