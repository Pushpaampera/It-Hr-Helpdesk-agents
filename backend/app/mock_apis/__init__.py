"""In-process mock APIs behind what would be /api/mock/... in a real deployment. Every call
writes to the real tables (so the dashboard reflects every action) and logs to audit_log."""
from sqlalchemy import text

from app.db import get_engine


def log_action(actor_id: str | None, action: str, target_type: str, target_id: str | None, detail: dict) -> None:
    import json

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """INSERT INTO audit_log (actor_id, action, target_type, target_id, detail)
                   VALUES (:actor_id, :action, :target_type, :target_id, :detail)"""
            ),
            {"actor_id": actor_id, "action": action, "target_type": target_type, "target_id": target_id,
             "detail": json.dumps(detail)},
        )
