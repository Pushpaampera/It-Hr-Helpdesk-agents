"""Mock directory API: user lookups and who approves access requests (an admin)."""
from sqlalchemy import text

from app.db import get_engine


def get_user(user_id: str) -> dict | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, name, email, personal_email, role, department, title, manager_id FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
    return dict(row) if row else None


def pick_access_approver() -> dict | None:
    """An admin approves system-access requests: the active admin with the fewest pending
    approvals (ties by name)."""
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """SELECT u.id, u.name, u.email, u.role,
                          (SELECT count(*) FROM approvals a WHERE a.approver_id = u.id AND a.status = 'pending') AS load
                     FROM users u
                    WHERE u.is_active AND u.role = 'admin'
                    ORDER BY load, u.name
                    LIMIT 1"""
            )
        ).mappings().first()
    return dict(row) if row else None


def find_users_by_name_fragment(fragment: str) -> list[dict]:
    """Used by the Guard to detect 'show me <someone else>'s ...' requests."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, name, email FROM users WHERE name ILIKE :pattern"),
            {"pattern": f"%{fragment}%"},
        ).mappings().all()
    return [dict(r) for r in rows]


def all_user_first_names(exclude_user_id: str | None = None) -> list[tuple[str, str]]:
    """Returns [(full_name, user_id), ...] for cross-referencing a query against other people's names."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, name FROM users")).mappings().all()
    return [(r["name"], str(r["id"])) for r in rows if str(r["id"]) != str(exclude_user_id)]
