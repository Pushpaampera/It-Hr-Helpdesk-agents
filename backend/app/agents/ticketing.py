"""Tess, the Case Handler. Creates a ticket with a concise context summary when an answer is
unresolved, escalated, or the user asks for a human — and hands it to a person straight away:
IT / General tickets go to the IT support person with the fewest unfinished tickets, HR tickets
to the HR person with the fewest. The assignee is notified; the employee is told who has it.

Also home to the small ticket rules the Tickets API shares (which team owns a category, the
response-time target per priority), so the agent and the human side never disagree."""
import json
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.db import get_engine

PRIORITY_KEYWORDS = {
    "urgent": ["urgent", "asap", "immediately", "critical", "right now"],
    "high": ["important", "blocked", "can't work", "cannot work", "escalate"],
}

# Which staff role works each ticket category.
TEAM_FOR_CATEGORY = {"IT": "it_support", "General": "it_support", "HR": "hr"}
TEAM_LABEL = {"it_support": "IT support", "hr": "HR", "admin": "admin"}

# How long a ticket may stay unfinished before it shows as overdue.
SLA_HOURS = {"urgent": 4, "high": 8, "medium": 24, "low": 72}
FINISHED = ("resolved", "closed")


def team_for(category: str) -> str:
    return TEAM_FOR_CATEGORY.get(category, "it_support")


def due_at(created_at: datetime, priority: str) -> datetime:
    return created_at + timedelta(hours=SLA_HOURS.get(priority, 24))


def _infer_priority(query: str) -> str:
    q = query.lower()
    for level in ("urgent", "high"):
        if any(kw in q for kw in PRIORITY_KEYWORDS[level]):
            return level
    return "medium"


def pick_assignee(conn: Connection, category: str) -> dict | None:
    """The active person in the category's team with the fewest unfinished tickets (ties: by
    name, so it's predictable). None if the team has nobody."""
    row = conn.execute(
        text(
            """SELECT u.id, u.name, u.role,
                      (SELECT count(*) FROM tickets t
                        WHERE t.assignee_id = u.id AND t.status NOT IN ('resolved', 'closed')) AS load
                 FROM users u
                WHERE u.role = :role AND u.is_active
                ORDER BY load, u.name
                LIMIT 1"""
        ),
        {"role": team_for(category)},
    ).mappings().first()
    return {"id": str(row["id"]), "name": row["name"], "role": row["role"]} if row else None


def create_ticket(user_id: str, run_id: str, route: str, query: str, context: dict,
                  priority: str | None = None) -> dict:
    engine = get_engine()
    category = route if route in ("IT", "HR") else "General"
    priority = priority or _infer_priority(query)
    summary = (
        f"User asked: \"{query}\". " + context.get("summary_note", "No confident automated answer was available.")
    )

    with engine.begin() as conn:
        assignee = pick_assignee(conn, category)
        number_row = conn.execute(text("SELECT nextval('ticket_number_seq') AS n")).mappings().first()
        number = f"TCK-{number_row['n']}"
        row = conn.execute(
            text(
                """INSERT INTO tickets (number, user_id, run_id, category, priority, status, summary, context, assignee_id)
                   VALUES (:number, :uid, :run_id, :category, :priority, 'open', :summary, :context, :assignee)
                   RETURNING id"""
            ),
            {"number": number, "uid": user_id, "run_id": run_id, "category": category, "priority": priority,
             "summary": summary, "context": json.dumps(context), "assignee": assignee["id"] if assignee else None},
        ).mappings().first()
        ticket_id = str(row["id"])
        conn.execute(
            text("INSERT INTO ticket_events (ticket_id, actor, type, note) VALUES (:tid, 'tess', 'created', :note)"),
            {"tid": ticket_id, "note": "Ticket created automatically by Tess with the full conversation context."},
        )
        if assignee:
            conn.execute(
                text("INSERT INTO ticket_events (ticket_id, actor, type, note) VALUES (:tid, 'tess', 'assigned', :note)"),
                {"tid": ticket_id, "note": f"Assigned to {assignee['name']} ({TEAM_LABEL[assignee['role']]}), "
                                           "who had the fewest open tickets."},
            )

    return {
        "ticket_id": ticket_id, "number": number, "priority": priority, "category": category,
        "assignee_id": assignee["id"] if assignee else None, "assignee_name": assignee["name"] if assignee else None,
    }


def announce_new_ticket(ticket: dict, query: str, body: str | None = None) -> None:
    """Tells the assignee (or, if nobody could be assigned, the whole team) that a ticket is
    waiting. Run off the event loop: it may send email. `body` replaces the default text."""
    from app.notify import notify, notify_role

    title = f"New {ticket['category']} ticket {ticket['number']}"
    body = ((body + " ") if body else f"The AI assistant couldn't solve this one: \"{query[:180]}\". ") + \
        f"Priority: {ticket['priority']}. Please pick it up on the Tickets page."
    link = f"/app/tickets?ticket={ticket['ticket_id']}"
    important = ticket["priority"] in ("urgent", "high")
    if ticket.get("assignee_id"):
        notify(ticket["assignee_id"], "ticket_assigned", title, body, link=link, important=important)
    else:
        notify_role(team_for(ticket["category"]), "ticket_unassigned", title, body, link=link, important=important)
