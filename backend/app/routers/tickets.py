"""Tickets: where a person takes over from the AI.

Who sees what (see _visible):
  employee   -> their own tickets
  it_support -> IT and General tickets, tickets assigned to them, and their own requests (IT
                support use the assistant for their own leave / pay / policy questions too)
  hr         -> HR tickets, tickets assigned to them, and their own
  admin      -> every ticket

Who can work a ticket (see _can_manage): admin, the team that owns its category (IT support for
IT/General, HR for HR) and its assignee. Working a ticket means: take it, change status /
priority / assignee, reply to the employee or ask them a question, write an internal note, ask an
admin for help (a "consult"), and resolve it with a note of what fixed it. Employees reply on their
own ticket; replying to a resolved one reopens it.

Internal notes and consults are staff-only: the employee's view never includes them.
Everyone involved is notified in the bell (and by email for important things, per their choice).
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents import password_reset
from app.agents.ticketing import FINISHED, TEAM_LABEL, due_at, team_for
from app.db import get_db
from app.deps import get_current_user, require_roles
from app.mock_apis import company_accounts, it_system
from app.models.user import User
from app.notify import notify, notify_role

router = APIRouter(prefix="/api/tickets", tags=["tickets"])

STAFF_ROLES = ("it_support", "hr", "admin")
VALID_STATUSES = ("open", "in_progress", "waiting", "resolved", "closed")
VALID_PRIORITIES = ("low", "medium", "high", "urgent")
# Fixed SQL fragments per team (constants, never user input).
TEAM_CATEGORY_SQL = {"it_support": "t.category IN ('IT', 'General')", "hr": "t.category = 'HR'"}
MAX_TEXT = 4000


# ---------- access rules ----------

def _visible(user: User) -> tuple[str, dict]:
    """SQL condition (on tickets t JOIN users u) for the tickets this user may see."""
    if user.role == "admin":
        return "TRUE", {}
    params = {"uid": str(user.id)}
    if user.role == "it_support":
        return f"({TEAM_CATEGORY_SQL['it_support']} OR t.assignee_id = :uid OR t.user_id = :uid)", params
    if user.role == "hr":
        return f"({TEAM_CATEGORY_SQL['hr']} OR t.assignee_id = :uid OR t.user_id = :uid)", params
    return "t.user_id = :uid", params


def _can_manage(ticket: dict, user: User) -> bool:
    if user.role == "admin":
        return True
    if user.role not in STAFF_ROLES:
        return False
    return team_for(ticket["category"]) == user.role or str(ticket.get("assignee_id")) == str(user.id)


def _staff_view(ticket: dict, user: User) -> bool:
    """True when this person sees the ticket as staff (internal notes, consults), not as the
    employee who raised it."""
    return _can_manage(ticket, user)


def _load_ticket(db: Session, ticket_id: str, user: User) -> dict:
    visible, params = _visible(user)
    row = db.execute(
        text(
            f"""SELECT t.*, u.name AS user_name, u.department AS user_department, a.name AS assignee_name
                  FROM tickets t JOIN users u ON u.id = t.user_id
                  LEFT JOIN users a ON a.id = t.assignee_id
                 WHERE t.id = :id AND {visible}"""
        ),
        {"id": ticket_id, **params},
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Ticket not found")
    return dict(row)


def can_view_run(db: Session, run_id: str, user: User) -> bool:
    """IT support may open an agent run only when it belongs to a ticket they can see."""
    visible, params = _visible(user)
    return db.execute(
        text(f"SELECT 1 FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.run_id = :rid AND {visible} LIMIT 1"),
        {"rid": run_id, **params},
    ).first() is not None


# ---------- helpers ----------

def _sla(row: dict) -> dict:
    due = due_at(row["created_at"], row["priority"])
    overdue = row["status"] not in FINISHED and datetime.now(timezone.utc) > due
    return {"due_at": due, "overdue": overdue}


def _event(db: Session, ticket_id: str, actor: User | str, type_: str, note: str | None, internal: bool = False) -> None:
    name = actor if isinstance(actor, str) else actor.name
    author_id = None if isinstance(actor, str) else str(actor.id)
    db.execute(
        text(
            """INSERT INTO ticket_events (ticket_id, actor, type, note, author_id, visibility)
               VALUES (:id, :actor, :type, :note, :author, :vis)"""
        ),
        {"id": ticket_id, "actor": name, "type": type_, "note": note, "author": author_id,
         "vis": "internal" if internal else "public"},
    )


def _clean(body: str | None, what: str) -> str:
    value = (body or "").strip()
    if not value:
        raise HTTPException(400, f"Please write {what}.")
    if len(value) > MAX_TEXT:
        raise HTTPException(400, f"Please keep it under {MAX_TEXT} characters.")
    return value


def _link(ticket_id: str) -> str:
    return f"/app/tickets?ticket={ticket_id}"


def _detail(db: Session, ticket_id: str, user: User) -> dict:
    ticket = _load_ticket(db, ticket_id, user)
    staff_view = _staff_view(ticket, user)
    events = db.execute(
        text(
            f"""SELECT id, actor, type, note, author_id, visibility, created_at FROM ticket_events
                 WHERE ticket_id = :id {'' if staff_view else "AND visibility = 'public'"}
                 ORDER BY created_at"""
        ),
        {"id": ticket_id},
    ).mappings().all()
    consults = []
    if staff_view:
        consults = [dict(c) for c in db.execute(
            text(
                """SELECT c.id, c.target_role, c.question, c.answer, c.status, c.created_at, c.answered_at,
                          c.requested_by, r.name AS requested_by_name, a.name AS answered_by_name
                     FROM ticket_consults c JOIN users r ON r.id = c.requested_by
                     LEFT JOIN users a ON a.id = c.answered_by
                    WHERE c.ticket_id = :id ORDER BY c.created_at"""
            ),
            {"id": ticket_id},
        ).mappings().all()]
    if not staff_view:
        ticket.pop("context", None)  # the AI's internal working notes are for staff
    return {
        "ticket": {**ticket, **_sla(ticket)},
        "events": [dict(e) for e in events],
        "consults": consults,
        "permissions": {
            "can_manage": _can_manage(ticket, user),
            "is_requester": str(ticket["user_id"]) == str(user.id),
            "staff_view": staff_view,
            "can_answer_consult": user.role == "admin" and any(c["status"] == "open" for c in consults),
        },
    }


# ---------- list ----------

@router.get("")
def list_tickets(
    status: str | None = None,
    category: str | None = None,
    scope: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """`scope` (staff): 'mine' = assigned to me, 'own' = ones I raised myself, 'unassigned',
    'asked' = (admin) IT support / HR asked an admin for help on it, 'overdue'. Anything else =
    everything I can see."""
    visible, params = _visible(current_user)
    where = [visible]
    if status:
        where.append("t.status = :status")
        params["status"] = status
    if category:
        where.append("t.category = :category")
        params["category"] = category
    if scope == "mine":
        where.append("t.assignee_id = :me")
        params["me"] = str(current_user.id)
    elif scope == "own":
        where.append("t.user_id = :me")
        params["me"] = str(current_user.id)
    elif scope == "unassigned":
        where.append("t.assignee_id IS NULL AND t.status NOT IN ('resolved', 'closed')")
    elif scope == "asked":
        where.append("EXISTS (SELECT 1 FROM ticket_consults c WHERE c.ticket_id = t.id AND c.status = 'open')")
    rows = db.execute(
        text(
            f"""SELECT t.id, t.number, t.user_id, u.name AS user_name, u.department AS user_department,
                   t.category, t.priority, t.status, t.summary, t.assignee_id, a.name AS assignee_name,
                   t.waiting_on, t.resolved_at, t.created_at,
                   (SELECT count(*) FROM ticket_consults c WHERE c.ticket_id = t.id AND c.status = 'open') AS open_consults
               FROM tickets t JOIN users u ON u.id = t.user_id
               LEFT JOIN users a ON a.id = t.assignee_id
               WHERE {' AND '.join(where)} ORDER BY t.created_at DESC"""
        ),
        params,
    ).mappings().all()
    result = [{**dict(r), **_sla(r)} for r in rows]
    if scope == "overdue":
        result = [r for r in result if r["overdue"]]
    return result


@router.get("/staff", dependencies=[Depends(require_roles(*STAFF_ROLES))])
def list_staff(db: Session = Depends(get_db)):
    """People a ticket can be assigned to, with how many unfinished tickets each one has."""
    rows = db.execute(
        text(
            """SELECT u.id, u.name, u.role, u.title,
                      (SELECT count(*) FROM tickets t WHERE t.assignee_id = u.id
                          AND t.status NOT IN ('resolved', 'closed')) AS open_tickets
                 FROM users u WHERE u.is_active AND u.role IN ('it_support', 'hr', 'admin')
                ORDER BY u.role, u.name"""
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/consults", dependencies=[Depends(require_roles(*STAFF_ROLES))])
def list_consults(
    status: str | None = "open", current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Admins: every question asked of an admin. Others: the questions they asked. Newest first."""
    where = ["TRUE" if current_user.role == "admin" else "c.requested_by = :uid"]
    params: dict = {"uid": str(current_user.id)}
    if status:
        where.append("c.status = :status")
        params["status"] = status
    rows = db.execute(
        text(
            f"""SELECT c.id, c.ticket_id, t.number AS ticket_number, t.summary AS ticket_summary, t.priority,
                       c.target_role, c.question, c.answer, c.status, c.created_at, c.answered_at,
                       c.requested_by, r.name AS requested_by_name, r.role AS requested_by_role
                  FROM ticket_consults c JOIN tickets t ON t.id = c.ticket_id
                  JOIN users r ON r.id = c.requested_by
                 WHERE {' AND '.join(where)} ORDER BY c.created_at DESC"""
        ),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, ticket_id, current_user)


# ---------- update (status / priority / assignee) ----------

class UpdateTicketRequest(BaseModel):
    status: str | None = None
    priority: str | None = None
    assignee_id: str | None = None
    note: str | None = None
    resolution: str | None = None


@router.patch("/{ticket_id}")
def update_ticket(
    ticket_id: str, req: UpdateTicketRequest, background: BackgroundTasks,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(403, "Only IT support, HR or an admin can update tickets")
    ticket = _load_ticket(db, ticket_id, current_user)
    if not _can_manage(ticket, current_user):
        raise HTTPException(403, "This ticket belongs to another team. You can answer their question, but not change it.")
    if req.status is not None and req.status not in VALID_STATUSES:
        raise HTTPException(400, f"status must be one of {VALID_STATUSES}")
    if req.priority is not None and req.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {VALID_PRIORITIES}")

    sets: list[str] = []
    params: dict = {"id": ticket_id}
    requester = str(ticket["user_id"])
    number = ticket["number"]

    if req.status is not None and req.status != ticket["status"]:
        sets.append("status = :status")
        params["status"] = req.status
        if req.status != "waiting":
            sets.append("waiting_on = NULL")
        if req.status == "resolved":
            resolution = _clean(req.resolution or req.note, "what fixed the problem, so the employee knows")
            sets += ["resolved_at = now()", "resolution = :resolution"]
            params["resolution"] = resolution
            _event(db, ticket_id, current_user, "resolved", resolution)
            background.add_task(
                notify, requester, "ticket_resolved", f"Your ticket {number} is resolved",
                f"{current_user.name} resolved it: {resolution}\nNot fixed? Reply on the ticket and it will reopen.",
                _link(ticket_id), True,
            )
        elif req.status == "closed":
            sets.append("resolved_at = COALESCE(resolved_at, now())")
            _event(db, ticket_id, current_user, "status_change", req.note or "Ticket closed.")
        else:
            if ticket["status"] in FINISHED:
                sets += ["resolved_at = NULL"]
            _event(db, ticket_id, current_user, "status_change", req.note or f"Status changed to {req.status.replace('_', ' ')}.")
            if req.status == "in_progress":
                background.add_task(
                    notify, requester, "ticket_update", f"{current_user.name} is working on {number}",
                    f"{current_user.name} from {TEAM_LABEL.get(current_user.role, 'support')} has started on your ticket.",
                    _link(ticket_id), False, False,
                )
    elif req.note:
        _event(db, ticket_id, current_user, "note", _clean(req.note, "a note"), internal=True)

    if req.priority is not None and req.priority != ticket["priority"]:
        sets.append("priority = :priority")
        params["priority"] = req.priority
        _event(db, ticket_id, current_user, "priority_change",
               f"Priority changed from {ticket['priority']} to {req.priority}.", internal=True)

    if req.assignee_id is not None and req.assignee_id != str(ticket.get("assignee_id")):
        assignee = db.execute(
            text("SELECT id, name, role FROM users WHERE id = :id AND is_active"), {"id": req.assignee_id}
        ).mappings().first()
        if not assignee or assignee["role"] not in (team_for(ticket["category"]), "admin"):
            raise HTTPException(400, f"Assign it to someone in {TEAM_LABEL[team_for(ticket['category'])]} (or an admin).")
        sets.append("assignee_id = :assignee_id")
        params["assignee_id"] = req.assignee_id
        _event(db, ticket_id, current_user, "assigned", f"Assigned to {assignee['name']}.")
        if str(assignee["id"]) != str(current_user.id):
            background.add_task(
                notify, str(assignee["id"]), "ticket_assigned", f"{current_user.name} gave you ticket {number}",
                ticket["summary"][:240], _link(ticket_id), ticket["priority"] in ("urgent", "high"),
            )

    if sets:
        db.execute(text(f"UPDATE tickets SET {', '.join(sets)} WHERE id = :id"), params)
    db.commit()
    return _detail(db, ticket_id, current_user)


@router.post("/{ticket_id}/claim")
def claim_ticket(
    ticket_id: str, background: BackgroundTasks,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """'Take it': assign the ticket to me and start working on it."""
    ticket = _load_ticket(db, ticket_id, current_user)
    if current_user.role not in STAFF_ROLES or not _can_manage(ticket, current_user):
        raise HTTPException(403, "Only the team that owns this ticket can take it")
    if ticket["status"] in FINISHED:
        raise HTTPException(409, "This ticket is already finished")
    db.execute(
        text("""UPDATE tickets SET assignee_id = :me,
                   status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
                 WHERE id = :id"""),
        {"me": str(current_user.id), "id": ticket_id},
    )
    _event(db, ticket_id, current_user, "assigned", f"{current_user.name} took this ticket.")
    db.commit()
    background.add_task(
        notify, str(ticket["user_id"]), "ticket_update", f"{current_user.name} is working on {ticket['number']}",
        f"{current_user.name} from {TEAM_LABEL.get(current_user.role, 'support')} has picked up your ticket.",
        _link(ticket_id), False, False,
    )
    return _detail(db, ticket_id, current_user)


# ---------- blocked password reset: IT support issues a temporary password ----------

def _context(ticket: dict) -> dict:
    ctx = ticket.get("context") or {}
    if isinstance(ctx, str):
        try:
            ctx = json.loads(ctx)
        except ValueError:
            ctx = {}
    return ctx if isinstance(ctx, dict) else {}


class TemporaryPasswordRequest(BaseModel):
    # Which company account (see app/mock_apis/company_accounts.py); defaults to the one the
    # ticket is about.
    system: str | None = None


@router.post("/{ticket_id}/temporary-password")
def issue_temporary_password(
    ticket_id: str, background: BackgroundTasks, req: TemporaryPasswordRequest | None = None,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """For a password ticket Tess opened (a blocked reset after 3 wrong codes, or one the assistant
    couldn't verify): once IT support has confirmed it's really the person, this gives them a new
    temporary password for one of their company accounts (valid 15 minutes, must be changed at
    sign-in). It's returned ONCE, here, for IT support to pass on; it's never stored or written on
    the ticket. Also lifts any block on self-service reset."""
    if current_user.role not in ("it_support", "admin"):
        raise HTTPException(403, "Only IT support or an admin can reset a password")
    ticket = _load_ticket(db, ticket_id, current_user)
    if not _can_manage(ticket, current_user):
        raise HTTPException(403, "Only the team that owns this ticket can reset the password")
    context = _context(ticket)
    if context.get("kind") not in ("password_reset", "password_reset_blocked"):
        raise HTTPException(400, "This ticket isn't about a password")
    if ticket["status"] in FINISHED:
        raise HTTPException(409, "This ticket is already finished")
    system = (req.system if req else None) or context.get("account") or "windows"
    if system not in company_accounts.SYSTEMS:
        raise HTTPException(400, f"Unknown account. Choose one of: {', '.join(company_accounts.SYSTEMS)}")
    account = company_accounts.label(system)

    requester = str(ticket["user_id"])
    issued = it_system.issue_temporary_password(requester, str(current_user.id), "it_support",
                                                {"ticket": ticket["number"]}, system=system)
    password_reset.lift_blocks_for_user(requester)
    _event(db, ticket_id, current_user, "internal_note",
           f"{current_user.name} confirmed the employee's identity and issued a temporary {account} password "
           "(valid 15 minutes, must be changed at sign-in). The password itself is not recorded.", internal=True)
    _event(db, ticket_id, current_user, "message",
           f"{current_user.name} has reset your {account} password and will give you a temporary password directly. "
           "It works for 15 minutes, and you'll choose your own new password when you sign in.")
    db.execute(text("UPDATE tickets SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, "
                    "assignee_id = COALESCE(assignee_id, :me) WHERE id = :id"),
               {"me": str(current_user.id), "id": ticket_id})
    db.commit()
    background.add_task(
        notify, requester, "password_reset", f"Your {account} password was reset by IT support",
        f"{current_user.name} from IT support reset your {account} password and will give you a temporary "
        "password directly. It works for 15 minutes and must be changed when you sign in. If you didn't ask "
        "for this, tell IT support right away.",
        _link(ticket_id), True,
    )
    return {
        "temporary_password": issued["temporary_password"],
        "expires_at": issued["expires_at"].isoformat(),
        "system": system, "account": account,
        "ticket": _detail(db, ticket_id, current_user),
    }


# ---------- messages: staff <-> employee ----------

class MessageRequest(BaseModel):
    body: str
    # 'reply' (employee sees it), 'question' (employee sees it and the ticket waits for their
    # answer), 'internal' (staff only). Employees can only 'reply'.
    kind: str = "reply"


@router.post("/{ticket_id}/messages")
def post_message(
    ticket_id: str, req: MessageRequest, background: BackgroundTasks,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    ticket = _load_ticket(db, ticket_id, current_user)
    body = _clean(req.body, "a message")
    number, requester = ticket["number"], str(ticket["user_id"])
    is_requester = requester == str(current_user.id)

    if _can_manage(ticket, current_user):
        if req.kind not in ("reply", "question", "internal"):
            raise HTTPException(400, "kind must be reply, question or internal")
        if req.kind == "internal":
            _event(db, ticket_id, current_user, "internal_note", body, internal=True)
        else:
            if ticket["status"] in FINISHED:
                raise HTTPException(409, "This ticket is finished. Change its status first to keep working on it.")
            sets = ["assignee_id = COALESCE(assignee_id, :me)"]
            if req.kind == "question":
                sets += ["status = 'waiting'", "waiting_on = 'employee'"]
            elif ticket["status"] == "open":
                sets.append("status = 'in_progress'")
            db.execute(text(f"UPDATE tickets SET {', '.join(sets)} WHERE id = :id"), {"id": ticket_id, "me": str(current_user.id)})
            _event(db, ticket_id, current_user, "question" if req.kind == "question" else "message", body)
            if not is_requester:
                title = (f"{current_user.name} needs more information on {number}" if req.kind == "question"
                         else f"{current_user.name} replied on {number}")
                background.add_task(notify, requester, "ticket_message", title, body[:600], _link(ticket_id), True)
        db.commit()
        return _detail(db, ticket_id, current_user)

    if not is_requester:
        raise HTTPException(403, "Only the person who raised this ticket or the team working on it can post here")

    # The employee replying on their own ticket.
    reopened = ticket["status"] in FINISHED
    if reopened:
        db.execute(
            text("""UPDATE tickets SET status = CASE WHEN assignee_id IS NULL THEN 'open' ELSE 'in_progress' END,
                       waiting_on = NULL, resolved_at = NULL WHERE id = :id"""),
            {"id": ticket_id},
        )
        _event(db, ticket_id, current_user, "reopened", "The employee says it isn't fixed, so the ticket reopened.")
    elif ticket.get("waiting_on") == "employee":
        # Their answer is in. If staff also asked another team, the ticket now waits on that team.
        other = db.execute(
            text("""SELECT target_role FROM ticket_consults WHERE ticket_id = :id AND status = 'open'
                    ORDER BY created_at DESC LIMIT 1"""),
            {"id": ticket_id},
        ).scalar()
        db.execute(
            text("UPDATE tickets SET status = :status, waiting_on = :on WHERE id = :id"),
            {"id": ticket_id, "status": "waiting" if other else "in_progress", "on": other},
        )
    _event(db, ticket_id, current_user, "employee_reply", body)
    db.commit()

    title = (f"{current_user.name} reopened {number}" if reopened else f"{current_user.name} replied on {number}")
    if ticket.get("assignee_id"):
        background.add_task(notify, str(ticket["assignee_id"]), "ticket_message", title, body[:600], _link(ticket_id), reopened)
    else:
        background.add_task(notify_role, team_for(ticket["category"]), "ticket_message", title, body[:600], _link(ticket_id), reopened)
    return _detail(db, ticket_id, current_user)


# ---------- consults: asking another team for help ----------

class ConsultRequest(BaseModel):
    target_role: str
    question: str


@router.post("/{ticket_id}/consult")
def ask_team(
    ticket_id: str, req: ConsultRequest, background: BackgroundTasks,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Ask an admin a question about this ticket (e.g. a licence purchase, an exception). The
    employee doesn't see the question."""
    ticket = _load_ticket(db, ticket_id, current_user)
    if not _can_manage(ticket, current_user):
        raise HTTPException(403, "Only the team working on this ticket can ask for help on it")
    if req.target_role != "admin" or current_user.role == "admin":
        raise HTTPException(400, "IT support and HR can ask an admin for help")
    question = _clean(req.question, "your question")
    if ticket["status"] in FINISHED:
        raise HTTPException(409, "This ticket is finished")

    db.execute(
        text("""INSERT INTO ticket_consults (ticket_id, requested_by, target_role, question)
                VALUES (:id, :me, :role, :q)"""),
        {"id": ticket_id, "me": str(current_user.id), "role": req.target_role, "q": question},
    )
    team = TEAM_LABEL[req.target_role]
    _event(db, ticket_id, current_user, "consult_asked", f"Asked {team}: {question}", internal=True)
    # A question to the employee stays the visible "waiting on" (it's their turn to act); the
    # ticket moves to waiting on this team once they answer (see post_message).
    if ticket.get("waiting_on") == "employee":
        db.execute(text("UPDATE tickets SET assignee_id = COALESCE(assignee_id, :me) WHERE id = :id"),
                   {"id": ticket_id, "me": str(current_user.id)})
    else:
        db.execute(
            text("UPDATE tickets SET status = 'waiting', waiting_on = :role, assignee_id = COALESCE(assignee_id, :me) WHERE id = :id"),
            {"id": ticket_id, "role": req.target_role, "me": str(current_user.id)},
        )
        _event(db, ticket_id, "System", "status_change", f"Waiting on {team}.")
    db.commit()
    background.add_task(
        notify_role, req.target_role, "ticket_consult",
        f"{current_user.name} ({TEAM_LABEL.get(current_user.role, current_user.role)}) needs your help on {ticket['number']}",
        question[:600], _link(ticket_id), ticket["priority"] in ("urgent", "high"), None, str(current_user.id),
    )
    return _detail(db, ticket_id, current_user)


class AnswerRequest(BaseModel):
    answer: str


@router.post("/{ticket_id}/consults/{consult_id}/answer")
def answer_team(
    ticket_id: str, consult_id: str, req: AnswerRequest, background: BackgroundTasks,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    ticket = _load_ticket(db, ticket_id, current_user)
    consult = db.execute(
        text("SELECT id, target_role, requested_by, status, question FROM ticket_consults WHERE id = :cid AND ticket_id = :tid"),
        {"cid": consult_id, "tid": ticket_id},
    ).mappings().first()
    if not consult:
        raise HTTPException(404, "Question not found")
    if current_user.role != "admin":
        raise HTTPException(403, "Only an admin can answer this question")
    if consult["status"] != "open":
        raise HTTPException(409, "Someone has already answered this question")
    answer = _clean(req.answer, "your answer")

    db.execute(
        text("""UPDATE ticket_consults SET answer = :a, answered_by = :me, status = 'answered', answered_at = now()
                WHERE id = :cid"""),
        {"a": answer, "me": str(current_user.id), "cid": consult_id},
    )
    _event(db, ticket_id, current_user, "consult_answered",
           f"{TEAM_LABEL.get(current_user.role, current_user.role)} answered: {answer}", internal=True)
    still_open = db.execute(
        text("SELECT count(*) FROM ticket_consults WHERE ticket_id = :tid AND status = 'open'"), {"tid": ticket_id}
    ).scalar_one()
    if not still_open and ticket["status"] == "waiting" and ticket.get("waiting_on") == "admin":
        db.execute(text("UPDATE tickets SET status = 'in_progress', waiting_on = NULL WHERE id = :id"), {"id": ticket_id})
        _event(db, ticket_id, "System", "status_change", "Back in progress.")
    db.commit()
    background.add_task(
        notify, str(consult["requested_by"]), "ticket_consult_answered",
        f"{current_user.name} answered your question on {ticket['number']}", answer[:600], _link(ticket_id), False,
    )
    return _detail(db, ticket_id, current_user)
