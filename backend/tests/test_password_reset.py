"""Password help for the person's company accounts (app/agents/password_reset.py,
app/mock_apis/company_accounts.py): Atlas finds out which account (Email, Windows / VPN login — also
the HelpDesk sign-in — Payroll portal, HR portal), explains the steps and asks first, emails a
6-digit code (to the PERSONAL email when the work email's own password is forgotten), and only a
right code issues a real temporary password (15 minutes, must be changed at sign-in). 3 wrong codes
block the reset and Tess opens an IT ticket; IT support resets from the ticket or from the
Password Resets page (app/routers/it_accounts.py).

Emails are never really sent: send_code_email is replaced so the test can read the code. Every
password changed here is put back afterwards."""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.agents import password_reset as pw_reset
from app.agents.events import new_run_id
from app.agents.graph import resume_after_user_reply, start_chat
from app.agents.runs_store import get_run
from app.db import check_db_connection, get_engine
from app.main import app
from app.mock_apis import company_accounts
from app.security import hash_password, verify_password

DEMO_PASSWORD = "Demo@1234"
HANNAH, ALEX, IVAN, EMMA = "hannah.hr@acme.test", "alex.admin@acme.test", "ivan.it@acme.test", "emma.employee@acme.test"
CHANGED = [HANNAH, ALEX, EMMA]
client = TestClient(app)


# ------------------------------------------------------------------ no database needed

@pytest.mark.parametrize("message", [
    "I forgot my password", "forgot password", "Please reset my password", "How do I reset my password?",
    "I can't remember my password", "My password expired", "password reset please",
    "I forgot my mail password", "reset my VPN password", "how do I change my payroll password?",
    "My account or login: I need to reset my password",
])
def test_recognises_reset_requests(message):
    assert pw_reset.is_reset_request(message)


@pytest.mark.parametrize("message", [
    "VPN error 691 even after I reset my password", "Forgot the Wi-Fi password",
    "Can you reset Ivan's password?", "How many sick days do I get?", "my laptop is slow",
    "I reset my password and now Outlook keeps asking", "reset the password for my colleague",
    "I changed my email password yesterday and now my phone can't sync",
])
def test_ignores_other_messages(message):
    assert not pw_reset.is_reset_request(message)


@pytest.mark.parametrize("message,system", [
    ("I forgot my mail password", "email"), ("forgot my Outlook password", "email"),
    ("I forgot my email password", "email"), ("reset my VPN password", "windows"),
    ("I forgot my laptop password", "windows"), ("forgot my Windows login password", "windows"),
    ("I can't remember my payroll password", "payroll"), ("forgot my HR portal login password", "hr_portal"),
    ("I forgot my password", None), ("forgot the password for email and payroll", None),
])
def test_knows_which_account(message, system):
    assert pw_reset.system_in(message) == system


@pytest.mark.parametrize("message,expected", [
    ("482913", ("code", "482913")), ("my code is 482 913", ("code", "482913")), ("12345", ("bad_code", None)),
    ("resend", ("resend", None)), ("I didn't get the email", ("resend", None)), ("cancel", ("cancel", None)),
    ("no", ("cancel", None)), ("how do I connect to VPN", ("other", None)),
])
def test_reads_replies_at_the_code_step(message, expected):
    assert pw_reset.read_code_reply(message) == expected


@pytest.mark.parametrize("message,expected", [
    ("Email (Outlook)", "email"), ("Windows / VPN login", "windows"), ("Payroll portal", "payroll"),
    ("HR portal", "hr_portal"), ("my outlook one", "email"), ("cancel", "cancel"), ("what's the leave policy", None),
])
def test_reads_which_account_reply(message, expected):
    assert pw_reset.read_system_reply(message) == expected


def test_masks_email():
    assert pw_reset.mask_email("hannah.hr@acme.test") == "ha•••••••@acme.test"


def test_work_email_password_code_goes_to_personal_email():
    person = {"email": "a@acme.test", "personal_email": "a.home@example.com"}
    assert pw_reset.code_destination("email", person) == ("a.home@example.com", "personal")
    assert pw_reset.code_destination("windows", person) == ("a@acme.test", "work")
    assert pw_reset.code_destination("email", {"email": "a@acme.test"}) == (None, "personal")


# ------------------------------------------------------------------ against the database

db = pytest.mark.skipif(not check_db_connection()[0], reason="requires a seeded database")


def _user(email: str) -> dict:
    with get_engine().connect() as conn:
        row = conn.execute(text("SELECT id, name, email, role, department FROM users WHERE email = :e"),
                           {"e": email}).mappings().first()
    assert row, f"seed user {email} not found"
    return {k: str(v) for k, v in dict(row).items()}


def _password_hash(email: str) -> str:
    with get_engine().connect() as conn:
        return conn.execute(text("SELECT password_hash FROM users WHERE email = :e"), {"e": email}).scalar_one()


def _account_hash(email: str, system: str) -> str | None:
    with get_engine().connect() as conn:
        return conn.execute(text("""SELECT a.password_hash FROM company_accounts a JOIN users u ON u.id = a.user_id
                                    WHERE u.email = :e AND a.system = :s"""), {"e": email, "s": system}).scalar()


def _login(email: str, password: str = DEMO_PASSWORD) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def sent_codes(monkeypatch):
    """Captures emailed codes (and where they went) instead of sending them; puts every password,
    personal email and reset row back afterwards."""
    codes: list[str] = []
    sent_to: list[str] = []
    status = {"value": "sent"}

    def fake_send(email, name, code, account_label="your account"):
        codes.append(code)
        sent_to.append(email)
        return status["value"]

    monkeypatch.setattr(pw_reset, "send_code_email", fake_send)
    yield SimpleNamespace(codes=codes, sent_to=sent_to, status=status)
    with get_engine().begin() as conn:
        conn.execute(text("""UPDATE users SET password_hash = :h, must_change_password = false,
                             temp_password_expires_at = NULL,
                             personal_email = split_part(email, '@', 1) || '.home@example.com'
                             WHERE email = ANY(:emails)"""),
                     {"h": hash_password(DEMO_PASSWORD), "emails": CHANGED})
        for table in ("password_resets", "company_accounts"):
            conn.execute(text(f"DELETE FROM {table} WHERE user_id IN (SELECT id FROM users WHERE email = ANY(:e))"),
                         {"e": CHANGED})


async def _drain(queue: asyncio.Queue) -> list[dict]:
    events = []
    while True:
        item = await asyncio.wait_for(queue.get(), timeout=30)
        if item is None:
            return events
        events.append(item)


async def _start(user: dict, message: str) -> tuple[str, list[dict]]:
    run_id, queue = new_run_id(), asyncio.Queue()
    task = asyncio.create_task(start_chat(user, message, None, run_id, queue))
    events = await _drain(queue)
    await task
    return run_id, events


async def _reply(run_id: str, message: str) -> list[dict]:
    queue: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(resume_after_user_reply(run_id, message, queue=queue))
    events = await _drain(queue)
    await task
    return events


def _gate(events: list[dict]) -> dict | None:
    gates = [e for e in events if e["type"] == "confirmation_required"]
    return gates[-1] if gates else None


def _final(events: list[dict]) -> dict | None:
    finals = [e for e in events if e["type"] == "final"]
    return finals[-1] if finals else None


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


@db
@pytest.mark.asyncio
async def test_windows_password_reset_also_changes_the_helpdesk_sign_in(sent_codes):
    hannah = _user(HANNAH)  # HR uses the same IT reset as everyone else
    before = _password_hash(HANNAH)

    run_id, events = await _start(hannah, "I forgot my VPN password")
    gate = _gate(events)
    assert gate["gate"] == pw_reset.CONSENT_GATE and gate["agent"] == "action"
    assert "Windows / VPN login" in gate["prompt"] and "sign in to this HelpDesk" in gate["prompt"]
    assert "Shall I start?" in gate["prompt"]
    assert not sent_codes.codes, "nothing happens before the person says yes"

    gate = _gate(await _reply(run_id, "Yes"))
    assert gate["gate"] == pw_reset.CODE_GATE and "work email" in gate["prompt"]
    assert sent_codes.sent_to == [HANNAH]
    with get_engine().connect() as conn:
        stored = conn.execute(text("SELECT code_hash FROM password_resets WHERE run_id = :r"), {"r": run_id}).scalar_one()
    assert sent_codes.codes[0] not in stored, "only a hash of the code is stored"

    assert "2 tries" in _gate(await _reply(run_id, _wrong(sent_codes.codes[0])))["prompt"]

    final = _final(await _reply(run_id, sent_codes.codes[0]))
    assert final and final["resolved"] is True and final["agent"] == "action"
    assert "Your temporary Windows / VPN login password:" in final["answer"]
    temp = final["answer"].split("`")[1]
    assert get_run(run_id)["status"] == "resolved" and _password_hash(HANNAH) != before

    with get_engine().connect() as conn:
        audit = conn.execute(text("""SELECT action FROM audit_log WHERE target_id = :u
                                     AND created_at > now() - interval '2 minutes'"""), {"u": hannah["id"]}).scalars().all()
        notes = conn.execute(text("""SELECT body FROM notifications WHERE user_id = :u AND kind = 'password_reset'
                                     AND created_at > now() - interval '2 minutes'"""), {"u": hannah["id"]}).scalars().all()
    assert {"password_reset_code_sent", "password_reset_wrong_code", "reset_password"} <= set(audit)
    assert notes and temp not in notes[0], "the notification never contains the password"

    # The old password stops working; the temporary one only allows choosing a new password.
    assert client.post("/api/auth/login", json={"email": HANNAH, "password": DEMO_PASSWORD}).status_code == 401
    res = client.post("/api/auth/login", json={"email": HANNAH, "password": temp})
    assert res.status_code == 200 and res.json()["user"]["must_change_password"] is True
    limited = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert client.get("/api/tickets", headers=limited).status_code == 403
    assert client.post("/api/auth/change-password", headers=limited,
                       json={"current_password": temp, "new_password": "short"}).status_code == 400
    ok = client.post("/api/auth/change-password", headers=limited,
                     json={"current_password": temp, "new_password": "BrandNew2026"})
    assert ok.status_code == 200 and ok.json()["user"]["must_change_password"] is False
    assert client.get("/api/tickets", headers={"Authorization": f"Bearer {ok.json()['access_token']}"}).status_code == 200
    assert verify_password("BrandNew2026", _password_hash(HANNAH))


@db
@pytest.mark.asyncio
async def test_forgotten_mail_password_sends_the_code_to_the_personal_email(sent_codes):
    emma = _user(EMMA)
    helpdesk_before = _password_hash(EMMA)

    run_id, events = await _start(emma, "I forgot my mail password")
    gate = _gate(events)
    assert "Email (Outlook)" in gate["prompt"] and "personal email" in gate["prompt"]

    gate = _gate(await _reply(run_id, "yes"))
    assert sent_codes.sent_to == ["emma.employee.home@example.com"], "never to the locked work mailbox"
    assert "personal email" in gate["prompt"]

    final = _final(await _reply(run_id, sent_codes.codes[0]))
    temp = final["answer"].split("`")[1]
    assert "Your temporary Email (Outlook) password:" in final["answer"] and "Outlook" in final["answer"]
    assert verify_password(temp, _account_hash(EMMA, "email")), "the email account's password changed"
    assert _password_hash(EMMA) == helpdesk_before, "the Windows / HelpDesk sign-in is untouched"
    assert client.post("/api/auth/login", json={"email": EMMA, "password": DEMO_PASSWORD}).status_code == 200


@db
@pytest.mark.asyncio
async def test_asks_which_account_when_the_message_does_not_say(sent_codes):
    hannah = _user(HANNAH)
    run_id, events = await _start(hannah, "I forgot my password")
    gate = _gate(events)
    assert gate["gate"] == pw_reset.SYSTEM_GATE
    assert gate["options"] == ["Email (Outlook)", "Windows / VPN login", "Payroll portal", "HR portal"]

    gate = _gate(await _reply(run_id, "Payroll portal"))
    assert gate["gate"] == pw_reset.CONSENT_GATE and "Payroll portal" in gate["prompt"]
    await _reply(run_id, "yes")
    final = _final(await _reply(run_id, sent_codes.codes[0]))
    assert verify_password(final["answer"].split("`")[1], _account_hash(HANNAH, "payroll"))


@db
@pytest.mark.asyncio
async def test_no_personal_email_means_it_support_helps(sent_codes):
    emma = _user(EMMA)
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE users SET personal_email = NULL WHERE email = :e"), {"e": EMMA})
    run_id, events = await _start(emma, "forgot my outlook password")
    gate = _gate(events)  # nowhere to send a code: offered IT support straight away
    assert gate["gate"] == "ticket_offer" and "no personal email on file" in gate["prompt"]
    assert not sent_codes.codes

    final = _final(await _reply(run_id, "yes"))
    with get_engine().connect() as conn:
        ticket = conn.execute(text("SELECT * FROM tickets WHERE number = :n"), {"n": final["ticket_number"]}).mappings().first()
    assert ticket["context"]["kind"] == "password_reset" and ticket["context"]["account"] == "email"

    res = client.post(f"/api/tickets/{ticket['id']}/temporary-password", headers=_login(IVAN), json={})
    assert res.status_code == 200 and res.json()["account"] == "Email (Outlook)"
    assert verify_password(res.json()["temporary_password"], _account_hash(EMMA, "email"))
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM tickets WHERE id = :id"), {"id": ticket["id"]})


@db
@pytest.mark.asyncio
async def test_three_wrong_codes_block_the_reset_and_open_an_it_ticket(sent_codes):
    alex = _user(ALEX)
    before = _password_hash(ALEX)
    run_id, _ = await _start(alex, "I can't remember my laptop password")
    await _reply(run_id, "yes")
    wrong = _wrong(sent_codes.codes[0])
    await _reply(run_id, wrong)
    await _reply(run_id, wrong)
    final = _final(await _reply(run_id, wrong))

    assert final and final["ticket_number"] and final["agent"] == "ticketing"
    assert "stopped the reset" in final["answer"]
    assert _password_hash(ALEX) == before, "a blocked reset changes nothing"
    with get_engine().connect() as conn:
        ticket = conn.execute(text("SELECT * FROM tickets WHERE number = :n"), {"n": final["ticket_number"]}).mappings().first()
        assignee_role = conn.execute(text("SELECT role FROM users WHERE id = :id"), {"id": ticket["assignee_id"]}).scalar_one()
    assert ticket["category"] == "IT" and ticket["priority"] == "high" and assignee_role == "it_support"
    assert ticket["context"]["kind"] == "password_reset_blocked" and ticket["context"]["account"] == "windows"

    # Asking again (any account) while IT support has the ticket: no new code is sent.
    sent_before = len(sent_codes.codes)
    _, events = await _start(alex, "please reset my payroll password")
    assert final["ticket_number"] in _final(events)["answer"] and len(sent_codes.codes) == sent_before

    # IT support confirms it's really Alex and issues a temporary password from the ticket.
    res = client.post(f"/api/tickets/{ticket['id']}/temporary-password", headers=_login(IVAN))
    assert res.status_code == 200, res.text
    login = client.post("/api/auth/login", json={"email": ALEX, "password": res.json()["temporary_password"]})
    assert login.status_code == 200 and login.json()["user"]["must_change_password"] is True
    assert pw_reset.active_block(alex["id"]) is None, "the block is lifted"

    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM tickets WHERE id = :id"), {"id": ticket["id"]})


@db
@pytest.mark.asyncio
async def test_saying_no_changes_nothing(sent_codes):
    hannah = _user(HANNAH)
    before = _password_hash(HANNAH)
    run_id, _ = await _start(hannah, "I forgot my windows password")
    final = _final(await _reply(run_id, "No"))
    assert final["answer"] == pw_reset.DECLINED_REPLY and not sent_codes.codes
    assert _password_hash(HANNAH) == before


@db
@pytest.mark.asyncio
async def test_code_email_failure_offers_a_ticket_instead(sent_codes):
    sent_codes.status["value"] = "failed"
    hannah = _user(HANNAH)
    run_id, _ = await _start(hannah, "I forgot my VPN password")
    gate = _gate(await _reply(run_id, "yes"))
    assert gate["gate"] == "ticket_offer" and "couldn't send the verification email" in gate["prompt"]
    final = _final(await _reply(run_id, "no"))
    assert final and not final.get("ticket_number")


@db
def test_expired_temporary_password_is_refused(sent_codes):
    with get_engine().begin() as conn:
        conn.execute(text("""UPDATE users SET password_hash = :h, must_change_password = true,
                             temp_password_expires_at = :exp WHERE email = :e"""),
                     {"h": hash_password("Temp-Pass-2345"), "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
                      "e": HANNAH})
    res = client.post("/api/auth/login", json={"email": HANNAH, "password": "Temp-Pass-2345"})
    assert res.status_code == 401 and "expired" in res.json()["detail"]


# ------------------------------------------------------------------ IT support's Password Resets page

@db
def test_it_support_resets_any_account_after_confirming_identity(sent_codes):
    ivan = _login(IVAN)
    emma = _user(EMMA)

    people = client.get("/api/it/accounts", params={"q": "emma"}, headers=ivan).json()["people"]
    person = next(p for p in people if p["email"] == EMMA)
    assert [a["system"] for a in person["accounts"]] == ["windows", "email", "payroll", "hr_portal"]
    assert person["personal_email"].endswith("@example.com") and "emma.employee.home" not in person["personal_email"]
    assert "password_hash" not in json.dumps(people)

    url = f"/api/it/accounts/{emma['id']}/temporary-password"
    assert client.post(url, json={"system": "hr_portal"}, headers=ivan).status_code == 400, "identity first"
    res = client.post(url, json={"system": "hr_portal", "identity_confirmed": True}, headers=ivan)
    assert res.status_code == 200
    assert verify_password(res.json()["temporary_password"], _account_hash(EMMA, "hr_portal"))
    hr = next(a for a in res.json()["person"]["accounts"] if a["system"] == "hr_portal")
    assert hr["must_change_password"] is True

    # Windows / VPN = the HelpDesk sign-in: the person signs in with the new temporary password.
    res = client.post(url, json={"system": "windows", "identity_confirmed": True}, headers=ivan)
    login = client.post("/api/auth/login", json={"email": EMMA, "password": res.json()["temporary_password"]})
    assert login.status_code == 200 and login.json()["user"]["must_change_password"] is True

    # Nobody resets their own accounts here, and employees can't use the page at all.
    ivan_id = _user(IVAN)["id"]
    own = client.post(f"/api/it/accounts/{ivan_id}/temporary-password",
                      json={"system": "email", "identity_confirmed": True}, headers=ivan)
    assert own.status_code == 400
    assert client.get("/api/it/accounts", headers=_login(HANNAH)).status_code == 403

    # IT support records a personal email (used when someone forgets their work email password).
    res = client.put(f"/api/it/accounts/{emma['id']}/personal-email", json={"personal_email": EMMA}, headers=ivan)
    assert res.status_code == 400
    res = client.put(f"/api/it/accounts/{emma['id']}/personal-email",
                     json={"personal_email": "emma.new@example.org"}, headers=ivan)
    assert res.status_code == 200 and res.json()["person"]["personal_email"].endswith("@example.org")


# ------------------------------------------------------------------ through the real chat endpoint

@pytest.fixture
def chat_client():
    """A `with TestClient(app)` session for one multi-turn chat. sse_starlette keeps a global
    shutdown event bound to the first event loop it saw, so it is cleared for each session."""
    from sse_starlette.sse import AppStatus

    AppStatus.should_exit_event = None
    with TestClient(app) as tc:
        yield tc
    AppStatus.should_exit_event = None


def _stream(tc: TestClient, message: str, headers: dict, conversation_id: str) -> list[dict]:
    events = []
    with tc.stream("POST", "/api/chat/stream", json={"message": message, "conversation_id": conversation_id},
                   headers=headers) as res:
        for line in res.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))
    return events


@db
def test_through_the_chat_endpoint_each_step_continues_and_the_code_is_never_stored(sent_codes, chat_client):
    headers = _login(HANNAH)
    conv = client.post("/api/conversations", json={}, headers=headers).json()["id"]

    assert _gate(_stream(chat_client, "I forgot my password", headers, conv))["gate"] == pw_reset.SYSTEM_GATE
    assert _gate(_stream(chat_client, "HR portal", headers, conv))["gate"] == pw_reset.CONSENT_GATE
    assert _gate(_stream(chat_client, "Yes", headers, conv))["gate"] == pw_reset.CODE_GATE
    final = _final(_stream(chat_client, sent_codes.codes[0], headers, conv))
    assert final and "Your temporary HR portal password:" in final["answer"]

    with get_engine().connect() as conn:
        stored = conn.execute(text("SELECT content FROM messages WHERE conversation_id = :c ORDER BY created_at"),
                              {"c": conv}).scalars().all()
    assert sent_codes.codes[0] not in " ".join(stored) and "[Verification code entered]" in stored
    assert final["answer"].split("`")[1] not in " ".join(stored), "the temporary password is never stored"
    assert client.get("/api/auth/me", headers=headers).json()["must_change_password"] is False


@db
def test_a_new_question_part_way_cancels_the_reset(sent_codes, chat_client):
    headers = _login(HANNAH)
    conv = client.post("/api/conversations", json={}, headers=headers).json()["id"]
    _stream(chat_client, "I forgot my VPN password", headers, conv)
    _stream(chat_client, "yes", headers, conv)
    events = _stream(chat_client, "How many sick days do I get?", headers, conv)
    assert not [e for e in events if e.get("gate") == pw_reset.CODE_GATE]
    with get_engine().connect() as conn:
        status = conn.execute(text("""SELECT status FROM password_resets pr JOIN users u ON u.id = pr.user_id
                                      WHERE u.email = :e ORDER BY pr.created_at DESC LIMIT 1"""), {"e": HANNAH}).scalar_one()
    assert status == "cancelled"
    assert client.post("/api/auth/login", json={"email": HANNAH, "password": DEMO_PASSWORD}).status_code == 200
