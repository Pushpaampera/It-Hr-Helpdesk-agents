"""Tess, the Case Handler. Creates a ticket with a concise context summary when an answer is
unresolved, escalated, or the user asks for a human."""
import json

from sqlalchemy import text

from app.db import get_engine

PRIORITY_KEYWORDS = {
    "urgent": ["urgent", "asap", "immediately", "critical", "right now"],
    "high": ["important", "blocked", "can't work", "cannot work", "escalate"],
}


def _infer_priority(query: str) -> str:
    q = query.lower()
    for level in ("urgent", "high"):
        if any(kw in q for kw in PRIORITY_KEYWORDS[level]):
            return level
    return "medium"


def create_ticket(user_id: str, run_id: str, route: str, query: str, context: dict) -> dict:
    engine = get_engine()
    category = route if route in ("IT", "HR") else "General"
    priority = _infer_priority(query)
    summary = (
        f"User asked: \"{query}\". " + context.get("summary_note", "No confident automated answer was available.")
    )

    with engine.begin() as conn:
        number_row = conn.execute(text("SELECT nextval('ticket_number_seq') AS n")).mappings().first()
        number = f"TCK-{number_row['n']}"
        row = conn.execute(
            text(
                """INSERT INTO tickets (number, user_id, run_id, category, priority, status, summary, context)
                   VALUES (:number, :uid, :run_id, :category, :priority, 'open', :summary, :context)
                   RETURNING id"""
            ),
            {"number": number, "uid": user_id, "run_id": run_id, "category": category, "priority": priority,
             "summary": summary, "context": json.dumps(context)},
        ).mappings().first()
        ticket_id = str(row["id"])
        conn.execute(
            text("INSERT INTO ticket_events (ticket_id, actor, type, note) VALUES (:tid, 'tess', 'created', :note)"),
            {"tid": ticket_id, "note": "Ticket created automatically by Tess with the full conversation context."},
        )

    return {"ticket_id": ticket_id, "number": number, "priority": priority, "category": category}
