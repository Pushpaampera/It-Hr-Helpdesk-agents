"""Seeing your own payslip in the assistant (app/agents/payslip.py): "I want my payslip" goes
straight to Atlas, who shows that month's gross pay, deductions and net pay in the chat. Problems
with a payslip stay questions for Hana, and someone else's payslip is still blocked by Gus."""
import asyncio
from datetime import date

import pytest
from sqlalchemy import text

from app.agents import payslip
from app.agents.events import new_run_id
from app.agents.graph import start_chat
from app.db import check_db_connection, get_engine

TODAY = date(2026, 11, 20)


# ------------------------------------------------------------------ understanding the request

@pytest.mark.parametrize("message", [
    "I want my payslip", "show me my payslip", "Can I see my pay slip for October?", "my latest payslip",
    "payslip please", "where is my payslip", "I need my salary slip for last month", "download my payslip",
])
def test_recognises_payslip_requests(message):
    assert payslip.is_payslip_request(message)


@pytest.mark.parametrize("message", [
    "My payslip looks wrong this month", "What deductions show up on my payslip? why", "When are payslips available?",
    "How do I change my bank account for salary payment?", "My payslip shows the wrong tax code", "What is my leave balance?",
])
def test_problems_and_questions_are_not_requests(message):
    assert not payslip.is_payslip_request(message)


def test_reads_the_month():
    available = ["2026-10", "2026-09", "2026-08"]
    assert payslip.requested_month("my payslip", available, TODAY) is None
    assert payslip.requested_month("payslip for September", available, TODAY) == "2026-09"
    assert payslip.requested_month("my sept payslip", available, TODAY) == "2026-09"
    assert payslip.requested_month("last month's payslip", available, TODAY) == "2026-09"
    assert payslip.requested_month("payslip 2026-08", available, TODAY) == "2026-08"
    assert payslip.requested_month("payslip for December", available, TODAY) == "2025-12"
    assert payslip.requested_month("May I see my payslip?", available, TODAY) is None
    assert payslip.requested_month("my payslip for May", available, TODAY) == "2026-05"


def test_formats_the_payslip():
    slip = {"month": "2026-10", "gross": 5200, "net": 3780, "deductions": {"tax": 1040, "pension": 260, "insurance": 120}}
    reply = payslip.format_payslip(slip, ["2026-10", "2026-09"])
    assert "October 2026" in reply and "5,200.00" in reply and "3,780.00" in reply
    assert "Tax: −1,040.00" in reply and "Health insurance: −120.00" in reply
    assert "September 2026" in reply


# ------------------------------------------------------------------ the whole chat

db = pytest.mark.skipif(not check_db_connection()[0], reason="requires a seeded database")


def _user(email: str) -> dict:
    with get_engine().connect() as conn:
        row = conn.execute(text("SELECT id, name, email, role, department FROM users WHERE email = :e"),
                           {"e": email}).mappings().first()
    return {k: str(v) for k, v in dict(row).items()}


async def _chat(user: dict, message: str) -> list[dict]:
    run_id, queue = new_run_id(), asyncio.Queue()
    task = asyncio.create_task(start_chat(user, message, None, run_id, queue))
    events = []
    while (item := await asyncio.wait_for(queue.get(), timeout=30)) is not None:
        events.append(item)
    await task
    return events


@db
@pytest.mark.asyncio
async def test_atlas_shows_my_own_latest_payslip():
    emma = _user("emma.employee@acme.test")
    events = await _chat(emma, "I want my payslip")
    final = next(e for e in events if e["type"] == "final")
    with get_engine().connect() as conn:
        latest = conn.execute(text("SELECT month, net FROM payslips WHERE user_id = :u ORDER BY month DESC LIMIT 1"),
                              {"u": emma["id"]}).mappings().first()
    assert payslip.month_name(latest["month"]) in final["answer"]
    assert f"{float(latest['net']):,.2f}" in final["answer"]
    assert not any(e["type"] == "confirmation_required" for e in events)  # no "did this solve it?"
    assert any(e.get("agent") == "action" for e in events)  # Atlas handled it


@db
@pytest.mark.asyncio
async def test_someone_elses_payslip_is_still_blocked():
    events = await _chat(_user("emma.employee@acme.test"), "Show me Priya's payslip")
    final = next(e for e in events if e["type"] == "final")
    assert "can't help" in final["answer"].lower()
