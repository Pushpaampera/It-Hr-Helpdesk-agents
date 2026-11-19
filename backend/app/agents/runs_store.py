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


def find_awaiting_reply_run(conversation_id: str) -> dict | None:
    """The most recent run on this conversation that's paused waiting on the user's own next
    chat message (the confirm_resolution/offer_ticket gates) — chat.py checks this to decide
    whether an incoming message is a fresh question or a reply to a pending gate."""
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """SELECT * FROM agent_runs WHERE conversation_id = :cid
                   AND status = 'awaiting_user_confirmation' ORDER BY created_at DESC LIMIT 1"""
            ),
            {"cid": conversation_id},
        ).mappings().first()
    return dict(row) if row else None


def find_pending_clarification(conversation_id: str) -> dict | None:
    """The conversation's latest run, if that run ended by asking a clarifying question — so the
    next message is read as the answer to it, not as a brand-new question."""
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM agent_runs WHERE conversation_id = :cid ORDER BY created_at DESC LIMIT 1"),
            {"cid": conversation_id},
        ).mappings().first()
    if row and row["outcome"] == "needs_clarification":
        return dict(row)
    return None


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
