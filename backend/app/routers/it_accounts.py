"""Password Resets page for IT support (and admins): find a person, see their company accounts
(Email, Windows / VPN login, Payroll portal, HR portal — app/mock_apis/company_accounts.py), and
reset one after confirming who they are. This is how someone who can't sign in at all (forgot the
Windows / HelpDesk password) gets help: they contact IT support, who resets it here.

Rules:
  * IT support / admin only, enforced here.
  * The person must be confirmed first (`identity_confirmed: true`, the checkbox on the page).
  * Nobody resets their own accounts here: they use the assistant like everyone else.
  * The temporary password is returned once, never stored; every reset is in the audit log and
    the person gets a security notification (bell + email).
  * IT support can also record a personal email, used for the code when someone forgets their
    work email password.
"""
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents import password_reset
from app.db import get_db
from app.deps import require_roles
from app.mock_apis import company_accounts, it_system, log_action
from app.models.user import User
from app.notify import notify

router = APIRouter(prefix="/api/it/accounts", tags=["it-accounts"])
STAFF = require_roles("it_support", "admin")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _person(db: Session, user_id: str) -> dict:
    row = db.execute(
        text("SELECT id, name, email, personal_email, role, department, is_active FROM users WHERE id = :id"),
        {"id": user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Person not found")
    return dict(row)


def _summary(person: dict) -> dict:
    block = password_reset.active_block(str(person["id"]))
    return {
        "id": str(person["id"]), "name": person["name"], "email": person["email"], "role": person["role"],
        "department": person["department"], "is_active": person["is_active"],
        "personal_email": password_reset.mask_email(person["personal_email"]) if person.get("personal_email") else None,
        "reset_blocked": bool(block),
        "blocked_ticket": block.get("ticket_number") if block else None,
        "accounts": company_accounts.accounts_for(str(person["id"])),
    }


@router.get("")
def search_people(q: str = "", current_user: User = Depends(STAFF), db: Session = Depends(get_db)):
    """People matching a name or email (everyone, A–Z, when the search is empty), with the state of
    each of their accounts. Never returns a password."""
    term = q.strip()
    rows = db.execute(
        text("""SELECT id, name, email, personal_email, role, department, is_active FROM users
                WHERE (:q = '' OR name ILIKE :like OR email ILIKE :like)
                ORDER BY name LIMIT 25"""),
        {"q": term, "like": f"%{term}%"},
    ).mappings().all()
    return {"people": [_summary(dict(r)) for r in rows], "systems": [
        {"system": key, "label": company_accounts.label(key)} for key in ("windows", "email", "payroll", "hr_portal")
    ]}


class ResetRequest(BaseModel):
    system: str
    identity_confirmed: bool = False
    note: str | None = None


@router.post("/{user_id}/temporary-password")
def reset_password(user_id: str, req: ResetRequest, background: BackgroundTasks,
                   current_user: User = Depends(STAFF), db: Session = Depends(get_db)):
    if user_id == str(current_user.id):
        raise HTTPException(400, "You can't reset your own password here. Ask the assistant, like everyone else.")
    if req.system not in company_accounts.SYSTEMS:
        raise HTTPException(400, f"Unknown account. Choose one of: {', '.join(company_accounts.SYSTEMS)}")
    if not req.identity_confirmed:
        raise HTTPException(400, "First confirm it's really them (for example on a video call).")
    person = _person(db, user_id)
    if not person["is_active"]:
        raise HTTPException(409, "This account is deactivated")
    account = company_accounts.label(req.system)

    issued = it_system.issue_temporary_password(
        user_id, str(current_user.id), "it_support",
        {"page": "Password Resets", "identity_confirmed": True, "note": (req.note or "").strip()[:300] or None},
        system=req.system,
    )
    password_reset.lift_blocks_for_user(user_id)
    background.add_task(
        notify, user_id, "password_reset", f"Your {account} password was reset by IT support",
        f"{current_user.name} from IT support reset your {account} password and will give you a temporary "
        "password directly. It works for 15 minutes and must be changed when you sign in. If you didn't ask "
        "for this, tell IT support right away.",
        "/app/overview", True,
    )
    return {
        "temporary_password": issued["temporary_password"], "expires_at": issued["expires_at"].isoformat(),
        "system": req.system, "account": account, "person": _summary(_person(db, user_id)),
    }


class PersonalEmailRequest(BaseModel):
    personal_email: str | None = None


@router.put("/{user_id}/personal-email")
def set_personal_email(user_id: str, req: PersonalEmailRequest,
                       current_user: User = Depends(STAFF), db: Session = Depends(get_db)):
    """Records (or clears) the personal email a reset code goes to when the work email password is
    the forgotten one."""
    person = _person(db, user_id)
    value = (req.personal_email or "").strip() or None
    if value and not _EMAIL.match(value):
        raise HTTPException(400, "That doesn't look like an email address.")
    if value and value.lower() == person["email"].lower():
        raise HTTPException(400, "Use a personal address, not their work email.")
    db.execute(text("UPDATE users SET personal_email = :v WHERE id = :id"), {"v": value, "id": user_id})
    db.commit()
    log_action(str(current_user.id), "set_personal_email", "user", user_id, {"set": bool(value)})
    return {"person": _summary(_person(db, user_id))}
