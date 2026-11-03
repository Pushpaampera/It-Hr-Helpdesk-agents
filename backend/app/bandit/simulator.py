"""`poetry run simulate-feedback --n 500` — generates synthetic feedback against the *live*
bandit state (not a throwaway copy), demonstrating the "lexical wins for error-code queries,
semantic wins for vague ones" pattern and leaving `bandit_state` warmed up for the demo, the
same way `app/seed/generators/ops.py::generate_historical_runs` does for the 300 seeded runs.
"""
import random
import uuid

from sqlalchemy import text

from app.bandit import store as bandit_store
from app.bandit.features import build_context_vector
from app.bandit.linucb import compute_reward, select_arm
from app.db import get_engine
from app.seed.generators.ops import HR_SAMPLE_QUERIES, IT_SAMPLE_QUERIES


def run_simulation(n: int = 500) -> dict:
    rng = random.Random()
    engine = get_engine()

    with engine.connect() as conn:
        employee_ids = [str(r[0]) for r in conn.execute(text("SELECT id FROM users WHERE role = 'employee'")).all()]
    if not employee_ids:
        raise RuntimeError("No employee users found in the database — run `poetry run seed` first.")

    with engine.connect() as conn:
        snapshot = conn.execute(
            text(
                """SELECT a.name, s.pulls, (SELECT avg(reward) FROM bandit_rewards rw
                       JOIN bandit_decisions d ON d.id = rw.decision_id WHERE d.arm_id = a.id) AS avg_reward
                   FROM bandit_arms a LEFT JOIN bandit_state s ON s.arm_id = a.id"""
            )
        ).mappings().all()
    before = {r["name"]: {"pulls": r["pulls"] or 0, "avg_reward": r["avg_reward"]} for r in snapshot}

    for i in range(n):
        dept = "IT" if rng.random() < 0.55 else "HR"
        query, code = rng.choice(IT_SAMPLE_QUERIES if dept == "IT" else HR_SAMPLE_QUERIES)
        hour = rng.randint(0, 23)
        confidence = round(rng.uniform(0.6, 0.98), 2)

        arms = bandit_store.load_arms()
        linucb_arms = {name: arm for name, (_, arm) in arms.items()}
        context_vec = build_context_vector(dept, query, hour, confidence)
        arm_name, ucb_scores = select_arm(context_vec, linucb_arms)
        arm_id, arm = arms[arm_name]

        user_id = rng.choice(employee_ids)
        run_id = str(uuid.uuid4())
        with engine.begin() as conn:
            conn.execute(
                text(
                    """INSERT INTO agent_runs (id, user_id, query, route, status, outcome)
                       VALUES (:id, :uid, :q, :route, 'resolved', 'resolved')"""
                ),
                {"id": run_id, "uid": user_id, "q": query, "route": dept},
            )

        decision_id = bandit_store.record_decision(
            run_id, {"dept": dept, "query": query, "hour": hour, "features": context_vec}, arm_id, ucb_scores,
        )

        ideal_arm = "lexical_heavy" if code else "semantic_heavy"
        matched_ideal = arm_name in (ideal_arm, "hybrid_rerank")
        rating = rng.choices([5, 4], weights=[0.7, 0.3])[0] if matched_ideal else rng.choices([3, 2, 1], weights=[0.3, 0.4, 0.3])[0]
        resolved = matched_ideal or rng.random() < 0.3
        reward = compute_reward(rating, resolved)

        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO feedback (run_id, rating, resolved) VALUES (:rid, :rating, :resolved)"),
                {"rid": run_id, "rating": rating, "resolved": resolved},
            )
        bandit_store.record_reward(decision_id, reward)
        arm.update(context_vec, reward)
        bandit_store.save_arm_state(arm_id, arm, pulls_increment=1)

    with engine.connect() as conn:
        snapshot_after = conn.execute(
            text(
                """SELECT a.name, s.pulls, (SELECT avg(reward) FROM bandit_rewards rw
                       JOIN bandit_decisions d ON d.id = rw.decision_id WHERE d.arm_id = a.id) AS avg_reward
                   FROM bandit_arms a LEFT JOIN bandit_state s ON s.arm_id = a.id"""
            )
        ).mappings().all()
    after = {r["name"]: {"pulls": r["pulls"] or 0, "avg_reward": r["avg_reward"]} for r in snapshot_after}

    summary = {"n": n, "before": before, "after": after}
    print(f"[simulate-feedback] ran {n} synthetic feedback rounds against the live bandit")
    for name in after:
        b, a = before.get(name, {"pulls": 0, "avg_reward": None}), after[name]
        print(
            f"  {name}: pulls {b['pulls']} -> {a['pulls']}, "
            f"avg_reward {b['avg_reward']} -> {round(a['avg_reward'], 4) if a['avg_reward'] is not None else None}"
        )
    return summary
