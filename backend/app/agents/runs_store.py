"""agent_runs row lifecycle: created when a chat starts, updated as the graph progresses."""
import json

from sqlalchemy import text

from app.db import get_engine


def create_run(run_id: str, user_id: str, conversation_id: str | None, query: str) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """INSERT INTO agent_runs (id, conversation_id, user_id, query, status)
                   VALUES (:id, :conversation_id, :user_id, :query, 'running')"""
            ),
            {"id": run_id, "conversation_id": conversation_id, "user_id": user_id, "query": query},
        )


def update_run(run_id: str, **fields) -> None:
    if not fields:
        return
    allowed = {"route", "status", "total_latency_ms", "tokens_in", "tokens_out", "cost_usd", "outcome", "strategy_arm_id"}
    sets = []
    params: dict = {"id": run_id}
    for k, v in fields.items():
        if k not in allowed:
            continue
        sets.append(f"{k} = :{k}")
        params[k] = v
    if not sets:
        return
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text(f"UPDATE agent_runs SET {', '.join(sets)} WHERE id = :id"), params)


def get_run(run_id: str) -> dict | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM agent_runs WHERE id = :id"), {"id": run_id}).mappings().first()
    return dict(row) if row else None


def last_event_seq(run_id: str) -> int:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT COALESCE(MAX(seq), 0) AS m FROM agent_events WHERE run_id = :id"), {"id": run_id}
        ).mappings().first()
    return int(row["m"]) if row else 0


def save_message(conversation_id: str, role: str, content: str, run_id: str | None = None,
                  routed_to: str | None = None, confidence: float | None = None, sources: list | None = None) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """INSERT INTO messages (conversation_id, role, content, run_id, routed_to, confidence, sources)
                   VALUES (:cid, :role, :content, :run_id, :routed_to, :confidence, :sources)"""
            ),
            {"cid": conversation_id, "role": role, "content": content, "run_id": run_id,
             "routed_to": routed_to, "confidence": confidence, "sources": json.dumps(sources or [])},
        )
