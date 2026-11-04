"""Approvals: created by it_system.request_access, decided by a manager."""
from sqlalchemy import text

from app.db import get_engine
from app.mock_apis import log_action


def find_by_run(run_id: str) -> dict | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, status, approver_id, requester_id, payload FROM approvals WHERE run_id = :run_id ORDER BY created_at DESC LIMIT 1"),
            {"run_id": run_id},
        ).mappings().first()
    return dict(row) if row else None


def get(approval_id: str) -> dict | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """SELECT id, run_id, status, approver_id, requester_id, payload, decided_at
                   FROM approvals WHERE id = :id"""
            ),
            {"id": approval_id},
        ).mappings().first()
    return dict(row) if row else None


def decide(approval_id: str, decision: str, comment: str | None, approver_id: str) -> dict:
    assert decision in ("approved", "rejected")
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """UPDATE approvals SET status = :status, comment = :comment, decided_at = now()
                   WHERE id = :id"""
            ),
            {"status": decision, "comment": comment, "id": approval_id},
        )
        conn.execute(
            text("UPDATE access_requests SET status = :status WHERE approval_id = :id"),
            {"status": decision, "id": approval_id},
        )
    log_action(approver_id, f"approval_{decision}", "approval", approval_id, {"comment": comment})
    return {"approval_id": approval_id, "status": decision}


def undo(approval_id: str) -> dict:
    """Reverts a just-decided approval back to pending — only valid within a short undo window
    enforced by the router, not here. Does not attempt to re-pause the LangGraph run that
    already resumed off this decision; see decide_approval's undo endpoint docstring."""
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """UPDATE approvals SET status = 'pending', comment = NULL, decided_at = NULL
                   WHERE id = :id"""
            ),
            {"id": approval_id},
        )
        conn.execute(
            text("UPDATE access_requests SET status = 'pending' WHERE approval_id = :id"),
            {"id": approval_id},
        )
    return {"approval_id": approval_id, "status": "pending"}
