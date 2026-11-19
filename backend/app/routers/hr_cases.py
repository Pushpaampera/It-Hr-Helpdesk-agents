"""Confidential HR cases — complaints, colleague conflicts, harassment, discrimination, manager
concerns, personal/wellbeing matters.

Who can see what (enforced here, server-side, never only in the UI):
  * the employee who raised a case — their own cases, and only those;
  * users with the `hr` role — every case (anonymous reporters shown as "Anonymous employee");
  * managers and admins — NOTHING. Not the list, not a single case (404, so a case's existence
    isn't even confirmed), not via the audit log, chat history or agent runs (case content is
    never written to any of those).

Any signed-in user can raise a case, managers and admins included: they can have a complaint too.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.notify import notify, notify_role

router = APIRouter(prefix="/api/hr-cases", tags=["hr-cases"])
settings = get_settings()

Category = Literal[
    "harassment", "discrimination", "colleague_conflict", "manager_concern",
    "misconduct", "personal_wellbeing", "safety", "other",
]
CaseStatus = Literal["received", "in_review", "waiting_on_employee", "resolved", "closed"]

STATUS_LABELS = {
    "received": "Received", "in_review": "Being looked into", "waiting_on_employee": "Waiting for your reply",
    "resolved": "Resolved", "closed": "Closed",
}
ANONYMOUS = "Anonymous employee"


def _is_hr(user: User) -> bool:
    return user.role == "hr"


def _require_hr(user: User = Depends(get_current_user)) -> User:
    if not _is_hr(user):
        # Admins included on purpose: confidential cases are for HR only.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the HR team can view confidential HR cases")
    return user


class CaseCreate(BaseModel):
    category: Category
    subject: str = Field(min_length=3, max_length=140)
    description: str = Field(min_length=10, max_length=5000)
    people_involved: str | None = Field(default=None, max_length=500)
    incident_date: date | None = None
    urgency: Literal["normal", "urgent"] = "normal"
    preferred_contact: Literal["portal", "email", "phone", "in_person"] = "portal"
    anonymous: bool = False


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class CaseUpdate(BaseModel):
    status: CaseStatus | None = None
    assign_to_me: bool | None = None
    resolution_note: str | None = Field(default=None, max_length=2000)


_CASE_SELECT = """
    SELECT c.id, c.number, c.reporter_id, c.anonymous, c.category, c.subject, c.description,
           c.people_involved, c.incident_date, c.urgency, c.preferred_contact, c.status,
           c.assigned_hr_id, h.name AS assigned_hr_name, c.resolution_note,
           c.created_at, c.updated_at, c.resolved_at,
           r.name AS reporter_name, r.email AS reporter_email, r.department AS reporter_department,
           (SELECT max(m.created_at) FROM hr_case_messages m WHERE m.case_id = c.id) AS last_activity_at,
           (SELECT m.author_role FROM hr_case_messages m WHERE m.case_id = c.id AND m.author_role <> 'system'
              ORDER BY m.created_at DESC LIMIT 1) AS last_author_role
    FROM hr_cases c
    JOIN users r ON r.id = c.reporter_id
    LEFT JOIN users h ON h.id = c.assigned_hr_id
"""


def _shape_case(row: dict, viewer: User) -> dict:
    case = dict(row)
    is_reporter = str(case["reporter_id"]) == str(viewer.id)
    if case["anonymous"] and not is_reporter:
        case["reporter_name"] = ANONYMOUS
        case["reporter_email"] = None
        case["reporter_department"] = None
    case.pop("reporter_id")
    case["is_mine"] = is_reporter
    case["status_label"] = STATUS_LABELS[case["status"]]
    return case


def _load_case_row(db: Session, case_id: str) -> dict | None:
    try:
        return db.execute(text(_CASE_SELECT + " WHERE c.id = :id"), {"id": case_id}).mappings().first()
    except Exception:  # noqa: BLE001 — a malformed UUID is just "not found"
        db.rollback()
        return None


def _load_case_for(db: Session, case_id: str, viewer: User) -> dict:
    row = _load_case_row(db, case_id)
    # 404 (not 403) for everyone without access, so managers/admins can't even confirm a case exists.
    if row is None or not (_is_hr(viewer) or str(row["reporter_id"]) == str(viewer.id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return dict(row)


def _add_message(db: Session, case_id: str, author_id: str | None, author_role: str, body: str) -> None:
    db.execute(
        text("""INSERT INTO hr_case_messages (case_id, author_id, author_role, body)
                VALUES (:cid, :aid, :role, :body)"""),
        {"cid": case_id, "aid": author_id, "role": author_role, "body": body},
    )


CATEGORY_LABELS = {
    "harassment": "Harassment", "discrimination": "Discrimination", "colleague_conflict": "Conflict with a colleague",
    "manager_concern": "Concern about a manager", "misconduct": "Wrongdoing or misconduct",
    "personal_wellbeing": "Personal or wellbeing", "safety": "Safety", "other": "Something else",
}
# Notifications about cases never carry what was written or who wrote it (emails leave the site,
# and an anonymous reporter must stay anonymous): only the case number, category and a link.
_EMAIL_PRIVACY = "For your privacy, the details aren't included in this email. Sign in to HelpDesk to read them."


def _hr_case_link(case_id: str) -> str:
    return f"/app/hr-cases?case={case_id}"


def _my_case_link(case_id: str) -> str:
    return f"/app/hr-support?case={case_id}"


def _notify_hr(case: dict, title: str, body: str, exclude_user_id: str | None = None, important: bool = False) -> None:
    """The assigned HR person if there is one, otherwise the whole HR team."""
    link = _hr_case_link(str(case["id"]))
    if case.get("assigned_hr_id") and str(case["assigned_hr_id"]) != exclude_user_id:
        notify(str(case["assigned_hr_id"]), "hr_case", title, body, link=link, important=important,
               email_body=f"{body}\n{_EMAIL_PRIVACY}")
    elif not case.get("assigned_hr_id"):
        notify_role("hr", "hr_case", title, body, link=link, important=important,
                    email_body=f"{body}\n{_EMAIL_PRIVACY}", exclude_user_id=exclude_user_id)


def _notify_reporter(case: dict, title: str, body: str, important: bool = True) -> None:
    notify(str(case["reporter_id"]), "hr_case_update", title, body, link=_my_case_link(str(case["id"])),
           important=important, email_body=f"{body}\n{_EMAIL_PRIVACY}")


@router.get("/contact")
def hr_contact(_: User = Depends(get_current_user)):
    """HR's direct contact details for the "Talk to HR" page and the chat redirect card."""
    return {
        "email": settings.HR_CONTACT_EMAIL or "hr@acme.test",
        "phone": settings.HR_CONTACT_PHONE or None,
        "hours": settings.HR_CONTACT_HOURS or "Monday to Friday, 9:00 to 17:00",
    }


@router.post("", status_code=201)
def create_case(body: CaseCreate, background: BackgroundTasks, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Safety reports are always urgent, whatever was selected.
    urgency = "urgent" if body.category == "safety" else body.urgency
    seq = db.execute(text("SELECT nextval('hr_case_number_seq')")).scalar_one()
    number = f"HR-{seq:04d}"
    case_id = db.execute(
        text("""INSERT INTO hr_cases (number, reporter_id, anonymous, category, subject, description,
                       people_involved, incident_date, urgency, preferred_contact)
                VALUES (:number, :rid, :anon, :cat, :subject, :desc, :people, :idate, :urgency, :contact)
                RETURNING id"""),
        {
            "number": number, "rid": str(current_user.id), "anon": body.anonymous, "cat": body.category,
            "subject": body.subject.strip(), "desc": body.description.strip(),
            "people": (body.people_involved or "").strip() or None, "idate": body.incident_date,
            "urgency": urgency, "contact": body.preferred_contact,
        },
    ).scalar_one()
    _add_message(db, str(case_id), None, "system",
                 f"Case {number} received{' (urgent)' if urgency == 'urgent' else ''}. Only the HR team can see it.")
    db.commit()
    label = CATEGORY_LABELS[body.category]
    background.add_task(
        _notify_hr, {"id": case_id, "assigned_hr_id": None},
        f"New private case {number}{' (urgent)' if urgency == 'urgent' else ''}",
        f"A new {label.lower()} case, {number}, has been raised{' and marked urgent' if urgency == 'urgent' else ''}. "
        "Open it in Private Cases to read it and reply.",
        str(current_user.id),
        urgency == "urgent",  # only urgent new cases are emailed by default
    )
    return _shape_case(_load_case_for(db, str(case_id), current_user), current_user)


@router.get("/mine")
def my_cases(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text(_CASE_SELECT + " WHERE c.reporter_id = :uid ORDER BY c.created_at DESC"), {"uid": str(current_user.id)}
    ).mappings().all()
    return [_shape_case(r, current_user) for r in rows]


@router.get("")
def list_cases(
    status_filter: CaseStatus | None = None,
    current_user: User = Depends(_require_hr),
    db: Session = Depends(get_db),
):
    where = "WHERE c.status = :status" if status_filter else ""
    rows = db.execute(
        text(_CASE_SELECT + f""" {where}
             ORDER BY (c.status IN ('resolved','closed')), (c.urgency = 'urgent') DESC, c.created_at DESC"""),
        {"status": status_filter} if status_filter else {},
    ).mappings().all()
    return [_shape_case(r, current_user) for r in rows]


@router.get("/{case_id}")
def get_case(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    case = _load_case_for(db, case_id, current_user)
    rows = db.execute(
        text("""SELECT m.id, m.author_id, m.author_role, m.body, m.created_at, u.name AS author_name
                FROM hr_case_messages m LEFT JOIN users u ON u.id = m.author_id
                WHERE m.case_id = :cid ORDER BY m.created_at"""),
        {"cid": case_id},
    ).mappings().all()
    messages = []
    for r in rows:
        m = dict(r)
        if m["author_role"] == "employee" and case["anonymous"] and str(case["reporter_id"]) != str(current_user.id):
            m["author_name"] = ANONYMOUS
        elif m["author_role"] == "hr":
            m["author_name"] = f"{m['author_name']} (HR)" if m["author_name"] else "HR team"
        elif m["author_role"] == "system":
            m["author_name"] = "Case update"
        m["is_mine"] = str(m.pop("author_id")) == str(current_user.id)
        messages.append(m)
    return {"case": _shape_case(case, current_user), "messages": messages}


@router.post("/{case_id}/messages", status_code=201)
def add_message(
    case_id: str, body: MessageCreate, background: BackgroundTasks,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    case = _load_case_for(db, case_id, current_user)
    is_reporter = str(case["reporter_id"]) == str(current_user.id)
    if case["status"] == "closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This case is closed. Please open a new case if you need more help.")

    role = "employee" if is_reporter else "hr"
    _add_message(db, case_id, str(current_user.id), role, body.body.strip())

    new_status = case["status"]
    if role == "employee" and case["status"] in ("waiting_on_employee", "resolved"):
        new_status = "in_review"  # the employee answered, or isn't happy with the resolution
    elif role == "hr" and case["status"] == "received":
        new_status = "in_review"  # first HR reply means it's being looked into
    if new_status != case["status"]:
        _add_message(db, case_id, None, "system", f"Status changed to \"{STATUS_LABELS[new_status]}\".")
    db.execute(
        text("UPDATE hr_cases SET status = :s, updated_at = now(), resolved_at = CASE WHEN :s = 'resolved' THEN resolved_at ELSE NULL END WHERE id = :id"),
        {"s": new_status, "id": case_id},
    )
    db.commit()
    if role == "hr":
        background.add_task(
            _notify_reporter, case, f"HR replied to your case {case['number']}",
            f"{current_user.name} from HR sent you a message about your case {case['number']}. Open it to read and reply.",
        )
    else:
        background.add_task(
            _notify_hr, case, f"New message on case {case['number']}",
            f"The employee replied on case {case['number']}. Open it in Private Cases to read it.",
        )
    return get_case(case_id, current_user, db)


@router.patch("/{case_id}")
def update_case(
    case_id: str, body: CaseUpdate, background: BackgroundTasks,
    current_user: User = Depends(_require_hr), db: Session = Depends(get_db),
):
    case = _load_case_for(db, case_id, current_user)
    notes: list[str] = []
    sets: list[str] = ["updated_at = now()"]
    params: dict = {"id": case_id}

    if body.assign_to_me and str(case["assigned_hr_id"] or "") != str(current_user.id):
        sets.append("assigned_hr_id = :hr")
        params["hr"] = str(current_user.id)
        notes.append(f"{current_user.name} (HR) is now handling this case.")
    if body.resolution_note is not None:
        sets.append("resolution_note = :note")
        params["note"] = body.resolution_note.strip() or None
    if body.status and body.status != case["status"]:
        sets.append("status = :status")
        params["status"] = body.status
        sets.append("resolved_at = " + ("now()" if body.status == "resolved" else "resolved_at" if body.status == "closed" else "NULL"))
        note = f"Status changed to \"{STATUS_LABELS[body.status]}\"."
        if body.status == "resolved" and (body.resolution_note or case["resolution_note"]):
            note += f" Outcome: {(body.resolution_note or case['resolution_note']).strip()}"
        notes.append(note)

    db.execute(text(f"UPDATE hr_cases SET {', '.join(sets)} WHERE id = :id"), params)
    for n in notes:
        _add_message(db, case_id, None, "system", n)
    db.commit()
    if body.status and body.status != case["status"]:
        label = STATUS_LABELS[body.status]
        n = case["number"]
        text_by_status = {
            "waiting_on_employee": f"HR needs a reply from you on case {n}. Open it to see their question.",
            "resolved": f"HR has marked case {n} as resolved. Open it to see the outcome. "
                        "If you're not happy with it, reply and HR will look again.",
            "closed": f"Case {n} has been closed. Open it to see the outcome.",
        }
        background.add_task(
            _notify_reporter, case, f"Update on your case {n}: {label}",
            text_by_status.get(body.status, f"Case {n} is now \"{label}\". Open it to see the details."),
        )
    elif body.assign_to_me and str(case["assigned_hr_id"] or "") != str(current_user.id):
        background.add_task(
            _notify_reporter, case, f"Someone from HR is handling case {case['number']}",
            f"{current_user.name} from HR is now looking after your case {case['number']}.",
            False,
        )
    return get_case(case_id, current_user, db)
