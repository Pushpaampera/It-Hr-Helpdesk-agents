"""Mock directory API: users and manager lookups."""
from sqlalchemy import text

from app.db import get_engine


def get_user(user_id: str) -> dict | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, name, email, role, department, title, manager_id FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
    return dict(row) if row else None


def get_manager(user_id: str) -> dict | None:
    user = get_user(user_id)
    if not user or not user.get("manager_id"):
        return None
    return get_user(str(user["manager_id"]))


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
