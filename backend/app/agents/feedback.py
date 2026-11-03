"""Finn, the Quality Keeper. After the final answer, a feedback_requested event is emitted by
the graph; when the user submits a rating, submit_feedback() computes the LinUCB reward and
updates the bandit (app/bandit/store.py)."""
from sqlalchemy import text

from app.bandit import store as bandit_store
from app.bandit.linucb import compute_reward
from app.db import get_engine


def submit_feedback(run_id: str, rating: int, resolved: bool, comment: str | None) -> dict:
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO feedback (run_id, rating, resolved, comment) VALUES (:run_id, :rating, :resolved, :comment)"),
            {"run_id": run_id, "rating": rating, "resolved": resolved, "comment": comment},
        )

    reward = compute_reward(rating, resolved)
    decision = bandit_store.find_decision_for_run(run_id)
    if decision:
        arm_id = str(decision["arm_id"])
        arm_name = bandit_store.arm_name_by_id(arm_id)
        arms = bandit_store.load_arms()
        if arm_name and arm_name in arms:
            _, arm = arms[arm_name]
            # Re-derive the context vector isn't available here without re-fetching; LinUCB only
            # needs the context used at decision time, which is stored on bandit_decisions.context.
            engine2 = get_engine()
            with engine2.connect() as conn:
                row = conn.execute(
                    text("SELECT context FROM bandit_decisions WHERE run_id = :run_id ORDER BY created_at DESC LIMIT 1"),
                    {"run_id": run_id},
                ).mappings().first()
            if row and row["context"].get("features"):
                arm.update(row["context"]["features"], reward)
                bandit_store.save_arm_state(arm_id, arm, pulls_increment=1)
        bandit_store.record_reward(str(decision["id"]), reward)

    return {"reward": reward, "updated_bandit": decision is not None}
