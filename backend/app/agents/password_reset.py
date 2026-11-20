"""Atlas's self-service password reset for the person's COMPANY accounts (Email, Windows / VPN login
— also the HelpDesk sign-in — Payroll portal, HR portal; see app/mock_apis/company_accounts.py).

The flow, one chat turn per step (each pause is a LangGraph NodeInterrupt, resumed by the person's
next message, exactly like the "did this solve your problem?" gate):

  1. "I forgot my mail password" -> Sage sends it straight to Atlas (IT, an action), for every role.
  2. Which account?              -> read from the message; if it doesn't say, Atlas asks (buttons).
  3. Atlas explains the steps    -> nothing happens until the person says yes.
  4. Yes                         -> a 6-digit code is emailed (valid CODE_MINUTES): to the WORK email,
                                    or to the PERSONAL email on file when the forgotten password is
                                    the work email's own (that mailbox can't be opened). No personal
                                    email on file -> IT support has to help (ticket offer).
  5. Right code                  -> a real temporary password for that account
                                    (it_system.issue_temporary_password), shown once, valid 15 min,
                                    must be changed at its next sign-in.
     Wrong code MAX_ATTEMPTS x   -> reset blocked; Tess opens an IT ticket with the full story;
                                    self-service stays blocked until IT support deals with it.
  6. Notification + audit log, then the usual rating.

Only a keyed hash of the code is stored (password_resets.code_hash); the temporary password is
never stored in plain text and never written to chat history or traces.

Recognising a reset request is a plain word check (no LLM), so it behaves the same in
LLM_MOCK_MODE and never depends on a model guessing "needs_action" right.
"""
import asyncio
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.config import get_settings
from app.db import get_engine
from app.mock_apis import company_accounts

CODE_MINUTES = 10
MAX_ATTEMPTS = 3
MAX_RESENDS = 3

# Gate names carried on the confirmation_required event (the chat shows different buttons).
SYSTEM_GATE = "password_reset_system"
CONSENT_GATE = "password_reset_consent"
CODE_GATE = "password_reset_code"

# ---------------------------------------------------------------- recognising a reset request

_PW = r"pass\s?words?"
_REQUEST_PATTERNS = (
    re.compile(rf"\b(?:forgot|forgotten|forget|forgetting|can'?t remember|cannot remember|can not remember|"
               rf"don'?t remember|do not remember|lost)\b[^.?!]{{0,40}}\b{_PW}\b", re.IGNORECASE),
    re.compile(rf"\b{_PW}\b[^.?!]{{0,30}}\b(?:forgot|forgotten)\b", re.IGNORECASE),
    re.compile(rf"\b(?:reset|recover|retrieve|change)\b[^.?!]{{0,30}}\b{_PW}\b", re.IGNORECASE),
    re.compile(rf"\b{_PW}\s+(?:reset|recovery|change)\b", re.IGNORECASE),
    re.compile(rf"\b{_PW}\b[^.?!]{{0,30}}\bexpired\b", re.IGNORECASE),
)
# Passwords that aren't one of the person's company accounts (Wi-Fi, a protected file).
_NOT_AN_ACCOUNT = re.compile(
    r"\b(?:wi-?fi|wireless|guest network|router|hotspot|bios|zip|pdf|excel|word file|voicemail)\b", re.IGNORECASE
)
# A reset that already happened: "VPN error 691 even after I reset my password".
_ALREADY_DONE = re.compile(
    r"\b(?:after|since|already|just)\s+(?:i\s+|i've\s+|i have\s+)?(?:reset|changed|recovered)\b"
    r"|\b(?:i|i've|i have)\s+(?:already\s+)?(?:reset|changed)\s+my\s+(?:\w+\s+)?pass\s?words?\s+"
    r"(?:and|but|yesterday|today|last)\b",
    re.IGNORECASE,
)
# Somebody else's password: never reset the asker's own account for that.
_SOMEONE_ELSE = re.compile(
    r"\b(?!my\b|your\b)[a-z]+'s\s+(?:\w+\s+)?pass\s?words?\b|\b(?:his|her|their)\s+(?:\w+\s+)?pass\s?words?\b"
    r"|\bpass\s?words?\s+(?:of|for)\s+(?:my\s+)?(?:colleague|teammate|manager|boss|team|him|her|them|someone|somebody)\b",
    re.IGNORECASE,
)


def _norm(message: str) -> str:
    return message.replace("’", "'")


def is_reset_request(message: str) -> bool:
    """True for "I forgot my password", "forgot my mail password", "reset my VPN password", "how do
    I change my payroll password?", "my password expired" — about the person's OWN accounts."""
    t = _norm(message)
    if _NOT_AN_ACCOUNT.search(t) or _ALREADY_DONE.search(t) or _SOMEONE_ELSE.search(t):
        return False
    return any(p.search(t) for p in _REQUEST_PATTERNS)


def system_in(message: str) -> str | None:
    """Which account the request names ('email', 'windows', ...), or None if it doesn't say."""
    return company_accounts.detect_system(_norm(message))


# ---------------------------------------------------------------- reading replies

_RESEND = re.compile(
    r"\b(?:resend|re-send|send (?:it |the code |a code )?again|new code|another code|"
    r"didn'?t (?:get|receive)|not (?:received|got)|no code|haven'?t (?:got|received))\b",
    re.IGNORECASE,
)
_CANCEL = re.compile(
    r"^\s*no\s*\.?\s*$|\b(?:cancel|stop|never\s?mind|forget it|abort|quit|don'?t reset|do not reset)\b", re.IGNORECASE
)


def read_code_reply(message: str) -> tuple[str, str | None]:
    """What a message at the code step means: ("code", "123456"), ("bad_code", None) for digits
    that aren't a 6-digit code, ("resend", None), ("cancel", None), or ("other", None) when it's
    really a new question."""
    t = _norm(message)
    digits = re.sub(r"\D", "", t)
    if digits:
        if len(digits) == 6:
            return "code", digits
        return "bad_code", None
    if _CANCEL.search(t):
        return "cancel", None
    if _RESEND.search(t):
        return "resend", None
    return "other", None


def read_system_reply(message: str) -> str | None:
    """A reply to "which password?": an account key, "cancel", or None (a new question)."""
    t = _norm(message)
    if _CANCEL.search(t):
        return "cancel"
    return company_accounts.system_from_button(t)


def is_code_step_reply(message: str) -> bool:
    return read_code_reply(message)[0] != "other"


def answers_open_step(step: str, message: str, is_yes_no) -> bool:
    """Does this message answer the step the reset is paused on (else it's a new question)?"""
    if step == "code":
        return is_code_step_reply(message)
    if step == "system":
        return read_system_reply(message) is not None
    return is_yes_no(message)


# ---------------------------------------------------------------- database

def _row(conn, sql: str, params: dict) -> dict | None:
    row = conn.execute(text(sql), params).mappings().first()
    return dict(row) if row else None


def create(user_id: str, run_id: str, system: str | None) -> dict:
    status = "awaiting_consent" if system else "awaiting_system"
    with get_engine().begin() as conn:
        return _row(conn, """INSERT INTO password_resets (user_id, run_id, system, status)
                             VALUES (:u, :r, :s, :st) RETURNING *""",
                    {"u": user_id, "r": run_id, "s": system or "windows", "st": status})


def get_for_run(run_id: str) -> dict | None:
    with get_engine().connect() as conn:
        return _row(conn, "SELECT * FROM password_resets WHERE run_id = :r ORDER BY created_at DESC LIMIT 1",
                    {"r": run_id})


def update(reset_id: str, **fields) -> None:
    allowed = {"status", "system", "code_hash", "code_sent_at", "code_expires_at", "code_sent_to",
               "attempts", "resends", "ticket_id"}
    sets = [f"{k} = :{k}" for k in fields if k in allowed]
    if not sets:
        return
    params = {k: v for k, v in fields.items() if k in allowed}
    with get_engine().begin() as conn:
        conn.execute(text(f"UPDATE password_resets SET {', '.join(sets)}, updated_at = now() WHERE id = :id"),
                     {**params, "id": reset_id})


def active_block(user_id: str) -> dict | None:
    """The person's blocked reset (3 wrong codes) whose IT ticket is still being worked, if any.
    Self-service stays off (for every account) until IT support finishes that ticket or issues a
    password for it."""
    with get_engine().connect() as conn:
        return _row(
            conn,
            """SELECT pr.*, t.number AS ticket_number, a.name AS assignee_name
                 FROM password_resets pr
                 LEFT JOIN tickets t ON t.id = pr.ticket_id
                 LEFT JOIN users a ON a.id = t.assignee_id
                WHERE pr.user_id = :u AND pr.status = 'blocked'
                  AND (t.id IS NULL OR t.status NOT IN ('resolved', 'closed'))
                ORDER BY pr.created_at DESC LIMIT 1""",
            {"u": user_id},
        )


def lift_blocks_for_user(user_id: str) -> None:
    """IT support reset a password for this person after checking who they are: self-service is
    allowed again."""
    with get_engine().begin() as conn:
        conn.execute(text("""UPDATE password_resets SET status = 'unblocked', updated_at = now()
                             WHERE user_id = :u AND status = 'blocked'"""), {"u": user_id})


def cancel_open_for_run(run_id: str) -> None:
    """The person moved on to another question part-way through: stop the reset (an emailed
    code stops working too)."""
    with get_engine().begin() as conn:
        conn.execute(text("""UPDATE password_resets SET status = 'cancelled', code_hash = NULL, updated_at = now()
                             WHERE run_id = :r AND status IN ('awaiting_system', 'awaiting_consent', 'awaiting_code')"""),
                     {"r": run_id})


def open_step_for_run(run_id: str) -> str | None:
    """'system', 'consent' or 'code' when this run is paused inside a password reset, else None."""
    reset = get_for_run(run_id)
    if not reset:
        return None
    return {"awaiting_system": "system", "awaiting_consent": "consent", "awaiting_code": "code"}.get(reset["status"])


# ---------------------------------------------------------------- where the code goes

def code_destination(system: str, person: dict) -> tuple[str | None, str]:
    """(address, 'work' | 'personal'). The work email's own password can't be reset with a code
    sent to that mailbox, so that one goes to the personal email on file (None if there isn't one)."""
    if system == "email":
        return (person.get("personal_email") or None), "personal"
    return person.get("email"), "work"


# ---------------------------------------------------------------- the code

def _hash(reset_id: str, code: str) -> str:
    key = get_settings().JWT_SECRET.encode()
    return hmac.new(key, f"{reset_id}:{code}".encode(), hashlib.sha256).hexdigest()


def send_code_email(email: str, name: str, code: str, account_label: str = "your account") -> str:
    """Emails the code. Returns the send status: 'sent', 'failed' or 'not_configured'. Patched
    in tests (they never send real email)."""
    from app.notify import send_email

    body = (
        f"Your code to reset your {account_label} password is: {code}\n"
        f"Type it into the HelpDesk assistant to continue. It works for {CODE_MINUTES} minutes and can only be used once.\n"
        "Never share this code with anyone, including IT support.\n"
        "If you didn't ask to reset a password, ignore this email and tell IT support."
    )
    status, _ = send_email(email, name, f"Your {account_label} password reset code", body, link="/app/assistant")
    return status


async def send_code(reset: dict, person: dict, resend: bool = False) -> bool:
    """Makes a fresh code (any earlier one stops working), stores only its hash, and emails it to
    the right address. Returns whether the email went out."""
    address, kind = code_destination(reset["system"], person)
    code = f"{secrets.randbelow(10 ** 6):06d}"
    now = datetime.now(timezone.utc)
    first_name = (person.get("name") or "there").split(" ")[0]
    status = await asyncio.get_running_loop().run_in_executor(
        None, send_code_email, address, first_name, code, company_accounts.label(reset["system"])
    )
    if status != "sent":
        update(str(reset["id"]), status="email_failed", code_hash=None)
        return False
    update(str(reset["id"]), status="awaiting_code", code_hash=_hash(str(reset["id"]), code), code_sent_at=now,
           code_expires_at=now + timedelta(minutes=CODE_MINUTES), code_sent_to=kind,
           resends=reset["resends"] + (1 if resend else 0))
    return True


def check_code(reset: dict, code: str) -> tuple[str, int]:
    """('ok' | 'expired' | 'wrong', tries left). A wrong code counts against MAX_ATTEMPTS; an
    expired one doesn't (a new code is needed either way)."""
    if not reset.get("code_hash"):
        return "expired", MAX_ATTEMPTS - reset["attempts"]
    if reset["code_expires_at"] and datetime.now(timezone.utc) > reset["code_expires_at"]:
        return "expired", MAX_ATTEMPTS - reset["attempts"]
    if hmac.compare_digest(reset["code_hash"], _hash(str(reset["id"]), code)):
        update(str(reset["id"]), status="completed", code_hash=None)
        return "ok", MAX_ATTEMPTS - reset["attempts"]
    attempts = reset["attempts"] + 1
    if attempts >= MAX_ATTEMPTS:
        update(str(reset["id"]), attempts=attempts, status="blocked", code_hash=None)
    else:
        update(str(reset["id"]), attempts=attempts)
    return "wrong", MAX_ATTEMPTS - attempts


# ---------------------------------------------------------------- what Atlas says

def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    shown = local[:2] if len(local) > 2 else local[:1]
    return f"{shown}{'•' * max(3, len(local) - len(shown))}@{domain}"


def local_time(moment: datetime) -> str:
    return moment.astimezone().strftime("%H:%M")


def system_options() -> list[str]:
    return [company_accounts.SYSTEMS[k]["button"] for k in ("email", "windows", "payroll", "hr_portal")]


SYSTEM_PROMPT = (
    "I can help you reset it. **Which password did you forget?** Choose one below, or type it in your own words."
)
SYSTEM_REASK_PROMPT = "Sorry, I didn't catch which one. Please choose the account below, or choose **Cancel**."


def _account_line(system: str, person: dict) -> str:
    name = company_accounts.label(system)
    extra = " This is also the password you use to sign in to this HelpDesk." if system == "windows" else ""
    return f"your **{name}** password (account **{person.get('email', '')}**).{extra}"


def consent_prompt(system: str, person: dict) -> str:
    address, kind = code_destination(system, person)
    where = (f"to your **personal email** on file ({mask_email(address)}), because your work mailbox is the "
             "one you can't open" if kind == "personal" else "to your work email")
    return (
        f"I can reset {_account_line(system, person)}\n\n"
        "Here's how it works:\n\n"
        f"1. **I email you a 6-digit code** {where}. It works for {CODE_MINUTES} minutes.\n"
        f"2. **You type the code here** in the chat. You get {MAX_ATTEMPTS} tries.\n"
        f"3. **I give you a temporary {company_accounts.label(system)} password**, shown only once. It works for "
        "15 minutes, and you'll choose your own new password the next time you sign in.\n\n"
        f"If the code is wrong {MAX_ATTEMPTS} times, I'll stop the reset to keep your account safe, and Tess will open "
        "a ticket so IT support can help you instead.\n\n"
        "Nothing changes until you say yes. **Shall I start?**"
    )


def no_recovery_email_intro(person: dict) -> str:
    return (
        "To reset your **Email (Outlook)** password I'd send a code to your personal email, because your work "
        "mailbox is the one you can't open. There's no personal email on file for you, so I can't check it's "
        "you here, and I haven't changed anything. IT support can confirm it's you and reset it for you "
        "(they can also add a personal email for next time)."
    )


def code_sent_prompt(system: str, person: dict, resent: bool = False) -> str:
    address, kind = code_destination(system, person)
    first = "I've sent a new 6-digit code" if resent else "I've sent a 6-digit code"
    to = "your personal email" if kind == "personal" else "your work email"
    extra = " The earlier code no longer works." if resent else ""
    return (
        f"{first} to {to}, **{mask_email(address or '')}**.{extra} Please type it here. "
        f"It works for {CODE_MINUTES} minutes.\n\n"
        "Can't find it? Check your spam or junk folder, or choose **Resend code**. To stop, choose **Cancel**."
    )


def wrong_code_prompt(tries_left: int) -> str:
    tries = "1 try" if tries_left == 1 else f"{tries_left} tries"
    return f"That code isn't right. Please check the email and try again. You have **{tries}** left."


EXPIRED_CODE_PROMPT = (
    f"That code has expired (codes work for {CODE_MINUTES} minutes). Choose **Resend code** and I'll email you a new one."
)
BAD_CODE_PROMPT = (
    "That doesn't look like the code. It's 6 digits, for example 482913. Please type the code from the email, "
    "or choose **Resend code** or **Cancel**."
)
RESEND_LIMIT_PROMPT = (
    f"I've already sent {MAX_RESENDS} new codes, so I can't send another one. Please use the code in the most "
    "recent email, or choose **Cancel**."
)
CONSENT_REASK_PROMPT = "Sorry, I didn't catch that. Shall I start the password reset? (yes/no)"
DECLINED_REPLY = (
    "No problem, I haven't changed anything and your password is the same as before. "
    "If you need a reset later, just ask me."
)
CANCELLED_REPLY = (
    "Okay, I've stopped the reset. Your password hasn't changed, and any code I emailed no longer works. "
    "If you need it later, just ask me again."
)
EMAIL_FAILED_INTRO = (
    "I'm sorry, I couldn't send the verification email just now, so I can't confirm it's you. "
    "I haven't changed your password."
)


def blocked_already_reply(block: dict) -> str:
    who = f"**{block['assignee_name']}** from IT support" if block.get("assignee_name") else "IT support"
    ticket = f" in ticket **{block['ticket_number']}**" if block.get("ticket_number") else ""
    return (
        f"Self-service password reset is paused for your accounts because a code was typed wrong {MAX_ATTEMPTS} times. "
        f"That's to keep your accounts safe. {who} is already helping you{ticket}: they'll confirm it's really you "
        "and then reset your password. You can follow it on the Tickets page."
    )


def success_reply(system: str, person: dict, temporary_password: str, expires_at: datetime) -> str:
    name = company_accounts.label(system)
    where = company_accounts.SYSTEMS[system]["sign_in_where"]
    if system == "windows":
        steps = (
            "1. Sign out of this HelpDesk (or open the sign-in page in a new window), and use it on your laptop or VPN too.\n"
            f"2. Sign in with **{person.get('email', '')}** and the temporary password.\n"
            "3. You'll be asked to choose a new password straight away. Use at least 8 characters with an upper-case "
            "letter, a lower-case letter and a number.\n\n"
            "You can stay signed in here for now."
        )
    else:
        steps = (
            f"1. Open {where}.\n"
            f"2. Sign in with **{person.get('email', '')}** and the temporary password.\n"
            "3. You'll be asked to choose a new password straight away. Use at least 8 characters with an upper-case "
            "letter, a lower-case letter and a number."
        )
    return (
        f"Code confirmed, thanks. Your **{name}** password has been reset.\n\n"
        f"**Your temporary {name} password:** `{temporary_password}`\n\n"
        "This is the only time it's shown, so copy it now. It works for **15 minutes** "
        f"(until {local_time(expires_at)}).\n\n"
        f"**To sign in with it:**\n{steps}\n\n"
        "You'll also get a notification about this reset."
    )


def success_reply_for_trace(system: str) -> str:
    """The success reply without the password, for traces and logs."""
    return f"Code confirmed; a temporary {company_accounts.label(system)} password was issued (not logged)."
