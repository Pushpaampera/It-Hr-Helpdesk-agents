"""Phase 3 verification scenarios (a)-(g) from the master build prompt. Requires a migrated +
seeded database. Runs with LLM_MOCK_MODE (set in .env), so no API keys are needed."""
import asyncio

import pytest
from sqlalchemy import text

from app.agents.events import load_events_for_run
from app.agents.graph import resume_after_approval, start_chat
from app.agents.runs_store import get_run
from app.db import check_db_connection, get_engine
from app.mock_apis import approvals as approvals_api


def _db_available() -> bool:
    ok, _ = check_db_connection()
    return ok


pytestmark = pytest.mark.skipif(not _db_available(), reason="requires a seeded database")


def _get_user(email: str) -> dict:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, name, email, role, department FROM users WHERE email = :email"), {"email": email}
        ).mappings().first()
    assert row, f"seed user {email} not found — run poetry run seed first"
    return {k: str(v) for k, v in dict(row).items()}


async def _run_chat(user: dict, message: str) -> tuple[str, list[dict]]:
    from app.agents.events import new_run_id

    run_id = new_run_id()
    queue: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(start_chat(user, message, None, run_id, queue))
    events = []
    while True:
        item = await asyncio.wait_for(queue.get(), timeout=30)
        if item is None:
            break
        events.append(item)
    await task
    return run_id, events


@pytest.mark.asyncio
async def test_a_vpn_error_619_routes_it_with_cited_answer():
    emma = _get_user("emma.employee@acme.test")
    run_id, events = await _run_chat(emma, "My laptop won't connect to the VPN, error 619")

    finals = [e for e in events if e["type"] == "final"]
    assert finals, "no final event emitted"
    assert finals[0]["route"] == "IT"
    assert finals[0]["sources"], "expected cited sources"
    assert "619" in " ".join(s["title"] for s in finals[0]["sources"])

    run = get_run(run_id)
    assert run["route"] == "IT"
    assert run["status"] == "resolved"


@pytest.mark.asyncio
async def test_b_sick_days_routes_hr_with_own_balance():
    emma = _get_user("emma.employee@acme.test")
    run_id, events = await _run_chat(emma, "How many sick days do I have left")

    finals = [e for e in events if e["type"] == "final"]
    assert finals
    assert finals[0]["route"] == "HR"
    assert "sick" in finals[0]["answer"].lower()
    assert "day" in finals[0]["answer"].lower()


@pytest.mark.asyncio
async def test_c_reset_password_runs_action():
    emma = _get_user("emma.employee@acme.test")
    run_id, events = await _run_chat(emma, "Please reset my password")

    tool_calls = [e for e in events if e.get("type") == "agent_event" and e.get("agent") == "action" and e.get("status") == "tool_call"]
    assert tool_calls, "expected an action tool_call event"
    assert tool_calls[0]["action"] == "reset_password"

    finals = [e for e in events if e["type"] == "final"]
    assert finals and finals[0]["resolved"] is True


@pytest.mark.asyncio
async def test_d_access_request_pauses_then_resumes_on_approval():
    from app.agents.events import new_run_id
    from app.agents.graph import start_chat

    emma = _get_user("emma.employee@acme.test")
    run_id = new_run_id()
    queue: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(start_chat(emma, "I need access to the Finance system", None, run_id, queue))

    # The stream intentionally stays open (no sentinel) while awaiting approval — stop
    # collecting as soon as we see the approval_required event rather than waiting for one.
    events = []
    approval_events = []
    while not approval_events:
        item = await asyncio.wait_for(queue.get(), timeout=30)
        assert item is not None, "stream ended before an approval_required event arrived"
        events.append(item)
        approval_events = [e for e in events if e["type"] == "approval_required"]
    await asyncio.wait_for(task, timeout=10)

    approval_id = approval_events[0]["approval_id"]

    run = get_run(run_id)
    assert run["status"] == "awaiting_approval"

    approval = approvals_api.get(approval_id)
    assert approval["status"] == "pending"

    manager = _get_user("mark.manager@acme.test")
    approvals_api.decide(approval_id, "approved", "Approved for project work.", manager["id"])
    await resume_after_approval(run_id, True)

    run_after = get_run(run_id)
    assert run_after["status"] == "resolved"

    replay = load_events_for_run(run_id)
    finals_in_db = [e for e in replay if e.get("status") == "completed" and e.get("agent") == "action"]
    assert finals_in_db


@pytest.mark.asyncio
async def test_e_unanswerable_question_creates_ticket():
    emma = _get_user("emma.employee@acme.test")
    run_id, events = await _run_chat(emma, "I was told my bonus was wrongly calculated")

    finals = [e for e in events if e["type"] == "final"]
    assert finals
    assert finals[0]["ticket_number"] is not None

    run = get_run(run_id)
    assert run["status"] == "escalated"

    engine = get_engine()
    with engine.connect() as conn:
        ticket = conn.execute(
            text("SELECT number, summary FROM tickets WHERE number = :n"), {"n": finals[0]["ticket_number"]}
        ).mappings().first()
    assert ticket is not None
    assert "bonus" in ticket["summary"].lower()


@pytest.mark.asyncio
async def test_f_guard_blocks_cross_user_payslip_and_logs_audit():
    emma = _get_user("emma.employee@acme.test")
    run_id, events = await _run_chat(emma, "Show me Priya's payslip")

    guard_events = [e for e in events if e.get("agent") == "guard" and e.get("status") == "completed"]
    assert guard_events and guard_events[0]["detail"]["blocked"] is True

    finals = [e for e in events if e["type"] == "final"]
    assert finals
    assert "priya" in finals[0]["answer"].lower() or "private data" in finals[0]["answer"].lower()

    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT action FROM audit_log WHERE actor_id = :uid AND action = 'guard_blocked' ORDER BY ts DESC LIMIT 1"),
            {"uid": emma["id"]},
        ).mappings().first()
    assert row is not None


@pytest.mark.asyncio
async def test_g_every_step_has_sequential_agent_events():
    emma = _get_user("emma.employee@acme.test")
    run_id, _ = await _run_chat(emma, "My Wi-Fi keeps dropping every few minutes")

    replay = load_events_for_run(run_id)
    seqs = [e["seq"] for e in replay]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == len(seqs), "sequence numbers must be unique per run"
    agents_seen = {e["agent"] for e in replay}
    assert "guard" in agents_seen and "supervisor" in agents_seen and "it_support" in agents_seen
