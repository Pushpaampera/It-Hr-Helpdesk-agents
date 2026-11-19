"""Notifications: one call writes the in-app notification (the bell in the top bar) and, when the
person's email preference allows it, sends the same message by email. By default only important
notifications are emailed (decisions on your own requests, HR replies to your case, urgent new
HR cases); routine ones (a new request waiting in someone's queue) stay in the bell.

Email is optional. With no SMTP_HOST in .env, nothing is sent and the notification records
email_status = 'not_configured', so the site keeps working on stage with or without a mail server.
Nothing here ever raises: a failed email must never undo or break the action that triggered it.

Decisions that have a 5-second Undo (leave and access approvals) are announced through
`notify_after_undo_window`, which waits for the window to close and then only notifies if the
decision still stands, so an undone decision never reaches the employee's inbox."""
import logging
import smtplib
import ssl
import time
from email.message import EmailMessage
from html import escape
from typing import Callable

from sqlalchemy import text

from app.config import get_settings
from app.db import get_engine

log = logging.getLogger(__name__)

UNDO_WINDOW_SECONDS = 5
_WAIT_SECONDS = UNDO_WINDOW_SECONDS + 1.5


def email_configured() -> bool:
    s = get_settings()
    return bool(s.SMTP_HOST and (s.SMTP_FROM or s.SMTP_USERNAME))


def _render_html(name: str, title: str, body: str, link_url: str | None) -> str:
    paragraphs = "".join(
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#050505">{escape(p)}</p>'
        for p in body.split("\n") if p.strip()
    )
    button = (
        f'<p style="margin:20px 0 0"><a href="{escape(link_url)}" style="display:inline-block;background:#9c369a;'
        f'color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Open HelpDesk</a></p>'
        if link_url else ""
    )
    return f"""<!doctype html><html><body style="margin:0;background:#fcfcfc;font-family:Montserrat,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fcfcfc;padding:24px 12px">
<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6ec;border-radius:14px">
<tr><td style="background:#0f1d66;color:#ffffff;padding:16px 24px;border-radius:14px 14px 0 0;font-weight:700;font-size:16px">Ampera HelpDesk</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:15px;color:#050505">Hi {escape(name)},</p>
<h1 style="margin:0 0 16px;font-size:19px;color:#050505">{escape(title)}</h1>
{paragraphs}{button}
<p style="margin:24px 0 0;font-size:12px;color:#5b5b5b">This is an automatic message from Ampera HelpDesk. Please don't reply to it.</p>
</td></tr></table></td></tr></table></body></html>"""


def send_email(to_address: str, to_name: str, subject: str, body: str, link: str | None = None) -> tuple[str, str | None]:
    """Sends one email. Returns (status, error) where status is 'sent', 'failed' or 'not_configured'."""
    s = get_settings()
    if not email_configured():
        return "not_configured", None
    recipient = s.EMAIL_REDIRECT_ALL_TO.strip() or to_address
    link_url = f"{s.APP_PUBLIC_URL.rstrip('/')}{link}" if link else None

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"Ampera HelpDesk <{s.SMTP_FROM or s.SMTP_USERNAME}>"
    msg["To"] = recipient
    plain = f"Hi {to_name},\n\n{subject}\n\n{body}\n"
    if link_url:
        plain += f"\nOpen HelpDesk: {link_url}\n"
    if recipient != to_address:
        plain += f"\n(Demo redirect: originally addressed to {to_address}.)\n"
    msg.set_content(plain)
    msg.add_alternative(_render_html(to_name, subject, body, link_url), subtype="html")

    try:
        security = s.SMTP_SECURITY.strip().lower()
        if security == "ssl":
            server: smtplib.SMTP = smtplib.SMTP_SSL(s.SMTP_HOST, s.SMTP_PORT, timeout=15, context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=15)
        with server:
            if security == "starttls":
                server.starttls(context=ssl.create_default_context())
            if s.SMTP_USERNAME:
                server.login(s.SMTP_USERNAME, s.SMTP_PASSWORD)
            server.send_message(msg)
        return "sent", None
    except Exception as exc:  # noqa: BLE001 — never let mail problems break the app
        log.warning("Email to %s failed: %s", recipient, exc)
        return "failed", str(exc)[:500]


EMAIL_PREFERENCES = ("important", "all", "off")


def notify(user_id: str, kind: str, title: str, body: str, link: str | None = None,
           important: bool = False, email: bool = True, email_body: str | None = None) -> None:
    """Creates an in-app notification for one user (always) and emails it when their email
    preference allows: 'all' -> every notification, 'important' (default) -> only when
    `important` is true, 'off' -> never. `email=False` means this one is never emailed.
    `email_body` replaces `body` in the email when the in-app text shouldn't leave the site
    (confidential HR cases)."""
    try:
        engine = get_engine()
        with engine.begin() as conn:
            user = conn.execute(
                text("SELECT name, email, email_notifications FROM users WHERE id = :id"), {"id": user_id}
            ).mappings().first()
            if not user:
                return
            notification_id = conn.execute(
                text("""INSERT INTO notifications (user_id, kind, title, body, link)
                        VALUES (:uid, :kind, :title, :body, :link) RETURNING id"""),
                {"uid": user_id, "kind": kind, "title": title, "body": body, "link": link},
            ).scalar_one()

        if not email:
            return
        preference = user["email_notifications"] or "important"
        if preference == "off" or (preference == "important" and not important):
            status, error = "skipped", None
        else:
            status, error = send_email(user["email"], user["name"].split(" ")[0], title, email_body or body, link or "/app/overview")
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE notifications SET email_status = :s, email_error = :e WHERE id = :id"),
                {"s": status, "e": error, "id": notification_id},
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("Notification for user %s failed: %s", user_id, exc)


def notify_role(role: str, kind: str, title: str, body: str, link: str | None = None,
                important: bool = False, email_body: str | None = None, exclude_user_id: str | None = None) -> None:
    """Notifies every active user with this role (e.g. all HR when a new leave request arrives)."""
    try:
        with get_engine().connect() as conn:
            ids = [str(r[0]) for r in conn.execute(
                text("SELECT id FROM users WHERE role = :role AND is_active"), {"role": role}
            ).all()]
    except Exception as exc:  # noqa: BLE001
        log.warning("Couldn't list %s users to notify: %s", role, exc)
        return
    for uid in ids:
        if uid != exclude_user_id:
            notify(uid, kind, title, body, link, important=important, email_body=email_body)


def notify_after_undo_window(still_decided: Callable[[], bool], send: Callable[[], None]) -> None:
    """Background task: waits out the 5-second Undo window, then sends only if the decision
    still stands (`still_decided` re-reads the record). Runs in FastAPI's thread pool."""
    time.sleep(_WAIT_SECONDS)
    try:
        if still_decided():
            send()
    except Exception as exc:  # noqa: BLE001
        log.warning("Deferred notification failed: %s", exc)
