"""Mock company IT directory: the accounts each person has and their passwords.

  windows    Windows / VPN login. The company sign-in, which is also the HelpDesk sign-in, so its
             password is users.password_hash (and resetting it changes how they sign in here).
  email      Email (Outlook)
  payroll    Payroll portal
  hr_portal  HR portal

Rows for the last three are created on first use with a random password nobody knows (the person
"already has" the account), so nothing needs seeding. Only it_system.issue_temporary_password
changes a password; this module only describes and looks up accounts.
"""
import re
import secrets

from sqlalchemy import text

from app.db import get_engine
from app.security import hash_password

SYSTEMS: dict[str, dict] = {
    "windows": {
        "label": "Windows / VPN login",
        "button": "Windows / VPN login",
        "sign_in_where": "your laptop, the VPN and this HelpDesk",
        "words": re.compile(
            r"\b(?:windows|laptop|computer|pc|desktop|vpn|sso|single sign-?on|network|domain|company (?:login|account)|"
            r"work (?:login|account)|help\s?desk|this (?:site|app|portal|website)|log-?in|sign-?in|system)\b",
            re.IGNORECASE,
        ),
    },
    "email": {
        "label": "Email (Outlook)",
        "button": "Email (Outlook)",
        "sign_in_where": "Outlook (the app or outlook.office.com)",
        "words": re.compile(
            r"\b(?:e-?mails?|mails?|outlook|mailbox|inbox|webmail|office\s?365|o365|m365)\b", re.IGNORECASE
        ),
    },
    "payroll": {
        "label": "Payroll portal",
        "button": "Payroll portal",
        "sign_in_where": "the Payroll portal",
        "words": re.compile(r"\b(?:payroll|payslips?|pay\s?slips?|salary|pay portal)\b", re.IGNORECASE),
    },
    "hr_portal": {
        "label": "HR portal",
        "button": "HR portal",
        "sign_in_where": "the HR portal",
        "words": re.compile(r"\b(?:hr portal|hrms|hr system|hr site|hr app|leave portal|workday)\b", re.IGNORECASE),
    },
}
# Checked in this order: "HR portal" before the generic "system"/"login" words of windows.
_DETECT_ORDER = ("email", "payroll", "hr_portal", "windows")
STORED_SYSTEMS = ("email", "payroll", "hr_portal")


def label(system: str) -> str:
    return SYSTEMS[system]["label"]


def detect_system(message: str) -> str | None:
    """Which account a message is about, or None when it doesn't say (or names several)."""
    found = [key for key in _DETECT_ORDER if SYSTEMS[key]["words"].search(message)]
    # "my HR portal login": the specific account wins over windows's generic "login" word.
    specific = [k for k in found if k != "windows"]
    if len(specific) == 1:
        return specific[0]
    if not specific and found == ["windows"]:
        return "windows"
    return None


def system_from_button(message: str) -> str | None:
    """A reply to "which password?": a button label, or a message naming one account."""
    clean = message.strip().lower()
    for key, info in SYSTEMS.items():
        if clean == info["button"].lower() or clean == key:
            return key
    return detect_system(message)


def username_for(user: dict, system: str) -> str:
    return user["email"]


def ensure_accounts(user_id: str) -> None:
    """Creates the person's Email / Payroll / HR portal accounts if they don't exist yet."""
    with get_engine().begin() as conn:
        email = conn.execute(text("SELECT email FROM users WHERE id = :id"), {"id": user_id}).scalar()
        if not email:
            return
        for system in STORED_SYSTEMS:
            conn.execute(
                text("""INSERT INTO company_accounts (user_id, system, username, password_hash)
                        VALUES (:u, :s, :name, :h) ON CONFLICT (user_id, system) DO NOTHING"""),
                {"u": user_id, "s": system, "name": email, "h": hash_password(secrets.token_urlsafe(24))},
            )


def accounts_for(user_id: str) -> list[dict]:
    """Every account the person has, with its password state (never the password)."""
    ensure_accounts(user_id)
    with get_engine().connect() as conn:
        user = conn.execute(
            text("SELECT email, must_change_password, temp_password_expires_at FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
        rows = {r["system"]: dict(r) for r in conn.execute(
            text("""SELECT system, username, must_change_password, temp_password_expires_at, password_changed_at
                    FROM company_accounts WHERE user_id = :u"""), {"u": user_id},
        ).mappings()}
    out = [{"system": "windows", "label": label("windows"), "username": user["email"] if user else None,
            "must_change_password": bool(user and user["must_change_password"]),
            "temp_password_expires_at": user["temp_password_expires_at"] if user else None}]
    for system in STORED_SYSTEMS:
        r = rows.get(system, {})
        out.append({"system": system, "label": label(system), "username": r.get("username"),
                    "must_change_password": bool(r.get("must_change_password")),
                    "temp_password_expires_at": r.get("temp_password_expires_at")})
    return out
