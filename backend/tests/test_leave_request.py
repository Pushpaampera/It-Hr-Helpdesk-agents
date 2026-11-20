"""Leave requests in the assistant (app/agents/leave_request.py) and forgiving spelling
(app/agents/spelling.py): Atlas understands typos, reads the type / dates / reason from the
message, asks for what's missing, shows a summary and only sends the request to HR after a "yes";
HR then approves or rejects it on the HR Dashboard and the employee is told.

Everything created here is removed again afterwards."""
import asyncio
import json
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.agents import leave_request as leave
from app.agents.events import new_run_id
from app.agents.graph import resume_after_user_reply, start_chat
from app.agents.spelling import correct
from app.db import check_db_connection, get_engine
from app.main import app

THU = date(2026, 11, 19)  # a fixed "today" for the parsing tests
EMMA, HANNAH = "emma.employee@acme.test", "hannah.hr@acme.test"
client = TestClient(app)


# ------------------------------------------------------------------ spelling (no database)

@pytest.mark.parametrize("typed,meant", [
    ("i want to put a sicck leave", "i want to put a sick leave"),
    ("I want a leav tomorow", "I want a leave tomorrow"),
    ("i forgt my pasword", "i forgot my password"),
    ("casul leave on monady", "casual leave on monday"),
    ("anual leave next wek", "annual leave next week"),
    ("sick leave tmrw", "sick leave tomorrow"),
    ("My keybord is not working", "My keyboard is not working"),
])
def test_fixes_silly_spelling_mistakes(typed, meant):
    assert correct(typed) == meant


@pytest.mark.parametrize("message", [
    "I need to lease a car", "How do I reset my password?", "VPN error 691", "Please check my payslip for March",
])
def test_leaves_correct_words_alone(message):
    assert correct(message) == message


# ------------------------------------------------------------------ understanding the request

@pytest.mark.parametrize("message", [
    "i want to put a sick leave", "I want a leave", "need casual leave on monday", "sick leave tomorrow",
    "I am not feeling well, I cant come to office today", "can i take leave next week for 3 days", "I need 2 days off",
    "apply leave on 25/11 due to doctor appointment",
])
def test_recognises_leave_requests(message):
    assert leave.is_leave_request(message)


@pytest.mark.parametrize("message", [
    "how many sick days do I get?", "what is my leave balance", "cancel my leave", "What is the leave policy",
])
def test_questions_about_leave_are_not_requests(message):
    assert not leave.is_leave_request(message)


@pytest.mark.parametrize("message,leave_type,start,end,reason", [
    ("need casual leave on monday for 2 days because of family function", "casual", "2026-11-23", "2026-11-24",
     "Family function"),
    ("sick leave tomorrow, i have fever", "sick", "2026-11-20", "2026-11-20", "Fever"),
    ("i want annual leave from 1 dec to 5 dec for my sisters wedding", "annual", "2026-12-01", "2026-12-05",
     "My sisters wedding"),
    ("apply leave on 25/11 due to doctor appointment", "sick", "2026-11-25", "2026-11-25", "Doctor appointment"),
    ("I want leave on 25th november", None, "2026-11-25", "2026-11-25", None),
    ("I want a leave", None, None, None, None),
])
def test_reads_type_dates_and_reason(message, leave_type, start, end, reason):
    found = leave.extract_dates(message, THU)
    assert leave.extract_type(message) == leave_type
    assert (str(found["start"]) if found["start"] else None) == start
    assert (str(found["end"]) if found["end"] else None) == end
    assert leave.extract_reason(message) == reason


def test_date_rules():
    assert leave.date_problem("annual", THU - timedelta(days=1), THU, THU)  # in the past
    assert leave.date_problem("sick", THU - timedelta(days=2), THU, THU) is None  # sick can go back a week
    assert leave.date_problem("casual", THU, THU + timedelta(days=9), THU)  # casual is at most 7 days
    assert leave.extract_duration("I need 2 days off") == 2
    assert leave.extract_dates("next week", THU)["start"] == date(2026, 11, 23)


# ------------------------------------------------------------------ the conversation (database)

db = pytest.mark.skipif(not check_db_connection()[0], reason="requires a seeded database")


def _user(email: str) -> dict:
    with get_engine().connect() as conn:
        row = conn.execute(text("SELECT id, name, email, role, department FROM users WHERE email = :e"),
                           {"e": email}).mappings().first()
    return {k: str(v) for k, v in dict(row).items()}


@pytest.fixture
def cleanup():
    yield
    with get_engine().begin() as conn:
        conn.execute(text("""DELETE FROM leave_requests WHERE created_at > now() - interval '10 minutes'
                             AND user_id IN (SELECT id FROM users WHERE email = ANY(:e))"""), {"e": [EMMA, HANNAH]})
        conn.execute(text("""DELETE FROM leave_drafts WHERE user_id IN (SELECT id FROM users WHERE email = ANY(:e))"""),
                     {"e": [EMMA, HANNAH]})
        conn.execute(text("""DELETE FROM notifications WHERE kind IN ('leave_pending', 'leave_submitted')
                             AND created_at > now() - interval '10 minutes'"""))


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


def _pending(user_id: str) -> list[dict]:
    with get_engine().connect() as conn:
        return [dict(r) for r in conn.execute(
            text("""SELECT * FROM leave_requests WHERE user_id = :u AND status = 'pending'
                    AND created_at > now() - interval '5 minutes'"""), {"u": user_id}).mappings()]


@db
@pytest.mark.asyncio
async def test_typo_request_is_understood_and_atlas_asks_only_what_is_missing(cleanup):
    emma = _user(EMMA)
    run_id, events = await _start(emma, "i want to put a sicck leave tomorow")
    assert not [e for e in events if e.get("agent") == "hr_policy"], "a request, not a guide search"
    gate = _gate(events)
    assert gate["gate"] == leave.REASON_GATE and gate["agent"] == "action", "type and date were understood"

    gate = _gate(await _reply(run_id, "i have fevr"))
    assert gate["gate"] == leave.CONFIRM_GATE
    tomorrow = date.today() + timedelta(days=1)
    assert "Sick leave" in gate["prompt"] and leave.fmt_day(tomorrow) in gate["prompt"]
    assert "Fever" in gate["prompt"] and "Shall I send it to HR for approval?" in gate["prompt"]
    assert gate["options"] == leave.CONFIRM_OPTIONS
    assert not _pending(emma["id"]), "nothing goes to HR before the yes"

    final = _final(await _reply(run_id, "Yes, send to HR"))
    assert final and "sent to HR for approval" in final["answer"] and final["agent"] == "action"
    sent = _pending(emma["id"])
    assert len(sent) == 1 and sent[0]["leave_type"] == "sick" and sent[0]["start_date"] == tomorrow
    assert sent[0]["reason"] == "Fever"


@db
@pytest.mark.asyncio
async def test_asks_type_then_dates_then_reason_and_hr_can_decide(cleanup):
    emma = _user(EMMA)
    run_id, events = await _start(emma, "I want a leave")
    gate = _gate(events)
    assert gate["gate"] == leave.TYPE_GATE and gate["options"] == leave.TYPE_OPTIONS
    assert "Days you have left" in gate["prompt"]

    gate = _gate(await _reply(run_id, "Casual leave"))
    assert gate["gate"] == leave.DATES_GATE

    gate = _gate(await _reply(run_id, "yesterday"))
    assert gate["gate"] == leave.DATES_GATE and "already passed" in gate["prompt"]

    monday = date.today() + timedelta(days=(7 - date.today().weekday()) or 7)
    gate = _gate(await _reply(run_id, "monday for 2 days"))
    assert gate["gate"] == leave.REASON_GATE

    gate = _gate(await _reply(run_id, "Family function"))
    assert gate["gate"] == leave.CONFIRM_GATE and "2 days" in gate["prompt"]

    # Change the reason before sending.
    assert _gate(await _reply(run_id, "Change reason"))["gate"] == leave.REASON_GATE
    gate = _gate(await _reply(run_id, "my cousin's wedding"))
    assert "My cousin's wedding" in gate["prompt"]
    await _reply(run_id, "yes")

    sent = _pending(emma["id"])
    assert len(sent) == 1 and sent[0]["start_date"] == monday and sent[0]["days"] == 2

    # HR sees it, with the reason, and approves it.
    hr = client.post("/api/auth/login", json={"email": HANNAH, "password": "Demo@1234"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {hr}"}
    queue = client.get("/api/hr/leave-requests?status=pending", headers=headers).json()
    mine = next(r for r in queue if r["id"] == str(sent[0]["id"]))
    assert mine["reason"] == "My cousin's wedding"
    decided = client.patch(f"/api/hr/leave-requests/{mine['id']}/decide", json={"decision": "approved"}, headers=headers)
    assert decided.status_code == 200, decided.text


@db
@pytest.mark.asyncio
async def test_cancel_sends_nothing(cleanup):
    emma = _user(EMMA)
    run_id, _ = await _start(emma, "need casual leave on monday because of personal work")
    final = _final(await _reply(run_id, "Cancel"))
    assert final["answer"] == leave.CANCELLED_REPLY and not _pending(emma["id"])


@db
def test_a_new_question_part_way_cancels_the_leave_request(cleanup):
    from sse_starlette.sse import AppStatus

    AppStatus.should_exit_event = None
    token = client.post("/api/auth/login", json={"email": EMMA, "password": "Demo@1234"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    conv = client.post("/api/conversations", json={}, headers=headers).json()["id"]

    def stream(tc, message):
        events = []
        with tc.stream("POST", "/api/chat/stream", json={"message": message, "conversation_id": conv},
                       headers=headers) as res:
            for line in res.iter_lines():
                if line.startswith("data:"):
                    events.append(json.loads(line[5:].strip()))
        return events

    with TestClient(app) as tc:
        assert _gate(stream(tc, "i want a leav"))["gate"] == leave.TYPE_GATE
        assert _gate(stream(tc, "sick"))["gate"] == leave.DATES_GATE
        stream(tc, "How do I connect to the VPN?")
    AppStatus.should_exit_event = None
    with get_engine().connect() as conn:
        status = conn.execute(text("""SELECT status FROM leave_drafts d JOIN users u ON u.id = d.user_id
                                      WHERE u.email = :e ORDER BY d.created_at DESC LIMIT 1"""), {"e": EMMA}).scalar_one()
    assert status == "cancelled"


@db
def test_hr_dashboard_shows_who_is_on_leave_today(cleanup):
    emma = _user(EMMA)
    today = date.today()
    with get_engine().begin() as conn:
        conn.execute(text("""INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, days, reason, status)
                             VALUES (:u, 'sick', :s, :e, 3, 'Private medical reason', 'approved')"""),
                     {"u": emma["id"], "s": today - timedelta(days=1), "e": today + timedelta(days=1)})
    hr = client.post("/api/auth/login", json={"email": HANNAH, "password": "Demo@1234"}).json()["access_token"]
    overview = client.get("/api/hr/overview", headers={"Authorization": f"Bearer {hr}"}).json()
    away = [p for p in overview["on_leave_today"] if p["user_id"] == emma["id"]]
    assert overview["today"] == today.isoformat()
    assert away and away[0]["end_date"] == (today + timedelta(days=1)).isoformat()
    assert "Private medical reason" not in json.dumps(overview["on_leave_today"]), "no reasons on the reminder"
