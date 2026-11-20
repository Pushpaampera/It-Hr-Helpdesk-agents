"""Mock IT system API: password reset, account unlock, access requests (which create a pending
approval addressed to an admin, see app/routers/approvals.py).

A password reset is real: it replaces the person's password with a temporary one that works for
TEMP_PASSWORD_MINUTES and must be changed at the next sign-in (app/routers/auth.py enforces both).
It is only ever called after the person proved it's them (the emailed code, see
app/agents/password_reset.py) or by IT support working a ticket."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db import get_engine
from app.mock_apis import log_action
from app.mock_apis.directory import pick_access_approver
from app.security import hash_password

TEMP_PASSWORD_MINUTES = 15
# No look-alike characters (0/O, 1/l/I), so it can be read out or typed without mistakes.
_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_LOWER = "abcdefghijkmnopqrstuvwxyz"
_DIGITS = "23456789"


def generate_temporary_password() -> str:
    """Like 'Kx7m-Q4tp-R9wz': 12 random characters in 3 groups, always with an upper-case
    letter, a lower-case letter and a digit."""
    alphabet = _UPPER + _LOWER + _DIGITS
    while True:
        chars = [secrets.choice(alphabet) for _ in range(12)]
        if any(c in _UPPER for c in chars) and any(c in _LOWER for c in chars) and any(c in _DIGITS for c in chars):
            return "-".join("".join(chars[i:i + 4]) for i in range(0, 12, 4))


def issue_temporary_password(user_id: str, actor_id: str, via: str, detail: dict | None = None,
                             system: str = "windows") -> dict:
    """Replaces the password of one of the person's company accounts (see
    app/mock_apis/company_accounts.py) with a new temporary one. Returns the plain password (to be
    shown once, never stored) and when it stops working. `via` is 'email_code' (the person
    verified themselves in the assistant) or 'it_support' (IT support, from a ticket or the
    Password Resets page). 'windows' is the company sign-in, which is also the HelpDesk sign-in."""
    from app.mock_apis import company_accounts

    if system not in company_accounts.SYSTEMS:
        raise ValueError(f"Unknown account: {system}")
    password = generate_temporary_password()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=TEMP_PASSWORD_MINUTES)
    params = {"h": hash_password(password), "exp": expires_at, "id": user_id}
    if system == "windows":
        sql = """UPDATE users SET password_hash = :h, must_change_password = true,
                 temp_password_expires_at = :exp WHERE id = :id"""
    else:
        company_accounts.ensure_accounts(user_id)
        sql = """UPDATE company_accounts SET password_hash = :h, must_change_password = true,
                 temp_password_expires_at = :exp, password_changed_at = now()
                 WHERE user_id = :id AND system = :system"""
        params["system"] = system
    with get_engine().begin() as conn:
        conn.execute(text(sql), params)
    log_action(actor_id, "reset_password", "user", user_id,
               {"via": via, "account": company_accounts.label(system),
                "temporary_password_expires_at": expires_at.isoformat(),
                "must_change_at_next_login": True, **(detail or {})})
    return {"success": True, "temporary_password": password, "expires_at": expires_at, "system": system}


def unlock_account(user_id: str) -> dict:
    log_action(user_id, "unlock_account", "user", user_id, {})
    return {"success": True, "message": "Account unlocked."}


def request_access(user_id: str, system: str, access_level: str, justification: str, run_id: str | None = None) -> dict:
    approver = pick_access_approver()
    if not approver:
        return {"success": False, "message": "There's no admin to approve this request right now."}

    approval_id = str(uuid.uuid4())
    engine = get_engine()
    with engine.begin() as conn:
        import json

        conn.execute(
            text(
                """INSERT INTO approvals (id, run_id, requester_id, approver_id, type, payload, status)
                   VALUES (:id, :run_id, :requester_id, :approver_id, 'access_request', :payload, 'pending')"""
            ),
            {"id": approval_id, "run_id": run_id, "requester_id": user_id, "approver_id": approver["id"],
             "payload": json.dumps({"system": system, "access_level": access_level, "justification": justification})},
        )
        conn.execute(
            text(
                """INSERT INTO access_requests (user_id, system, access_level, justification, status, approval_id)
                   VALUES (:uid, :system, :level, :justification, 'pending', :approval_id)"""
            ),
            {"uid": user_id, "system": system, "level": access_level, "justification": justification,
             "approval_id": approval_id},
        )
    log_action(user_id, "request_access", "approval", approval_id, {"system": system, "access_level": access_level})
    return {"success": True, "approval_id": approval_id, "approver_id": str(approver["id"]), "approver_name": approver["name"]}
