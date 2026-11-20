"""Tickets after the AI hands over: who sees what (routers/tickets.py::_visible) and the IT support
workflow — auto-assignment, take it, ask the employee, employee reply, internal notes, asking
an admin for help, resolving with a note, and reopening by replying. IT support only works IT
tickets: no approvals, no assistant, nothing HR.

Uses the seeded demo accounts; every ticket created here is deleted again afterwards."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.agents import ticketing
from app.db import check_db_connection, get_engine
from app.main import app

pytestmark = pytest.mark.skipif(not check_db_connection()[0], reason="requires a seeded database")

client = TestClient(app)
PASSWORD = "Demo@1234"
EMMA, IVAN, HANNAH, ALEX = "emma.employee@acme.test", "ivan.it@acme.test", "hannah.hr@acme.test", "alex.admin@acme.test"
_tokens: dict[str, dict] = {}


def _h(email: str) -> dict:
    if email not in _tokens:
        res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert res.status_code == 200, res.text
        _tokens[email] = {"Authorization": f"Bearer {res.json()['access_token']}"}
    return _tokens[email]


def _user(email: str) -> dict:
    with get_engine().connect() as conn:
        return dict(conn.execute(text("SELECT id, name, role FROM users WHERE email = :e"), {"e": email}).mappings().first())


@pytest.fixture
def make_ticket():
    created: list[str] = []

    def _make(route: str = "IT", query: str = "Test ticket: my docking station is dead") -> dict:
        emma = _user(EMMA)
        t = ticketing.create_ticket(str(emma["id"]), None, route, query, {"original_question": query})
        created.append(t["ticket_id"])
        return t

    yield _make
    with get_engine().begin() as conn:
        for tid in created:
            conn.execute(text("DELETE FROM notifications WHERE link LIKE :l"), {"l": f"%{tid}%"})
            conn.execute(text("DELETE FROM tickets WHERE id = :id"), {"id": tid})


# ---------- visibility ----------

def test_employee_sees_only_own_tickets():
    emma = _user(EMMA)
    tickets = client.get("/api/tickets", headers=_h(EMMA)).json()
    assert all(t["user_id"] == str(emma["id"]) for t in tickets)


def test_it_support_sees_it_and_general_tickets_not_hr():
    ivan = _user(IVAN)
    tickets = client.get("/api/tickets", headers=_h(IVAN)).json()
    assert tickets
    assert all(t["category"] in ("IT", "General") or t["assignee_id"] == str(ivan["id"])
               or t["user_id"] == str(ivan["id"]) for t in tickets)
    own = client.get("/api/tickets?scope=own", headers=_h(IVAN)).json()
    assert all(t["user_id"] == str(ivan["id"]) for t in own)


def test_hr_sees_hr_tickets_and_own():
    hannah = _user(HANNAH)
    tickets = client.get("/api/tickets", headers=_h(HANNAH)).json()
    assert tickets and all(t["category"] == "HR" or t["user_id"] == str(hannah["id"])
                           or t["assignee_id"] == str(hannah["id"]) for t in tickets)


def test_admin_sees_everything():
    tickets = client.get("/api/tickets", headers=_h(ALEX)).json()
    with get_engine().connect() as conn:
        assert len(tickets) == conn.execute(text("SELECT count(*) FROM tickets")).scalar()


def test_no_manager_role_left_and_one_it_support():
    with get_engine().connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users WHERE role = 'manager'")).scalar() == 0
        assert conn.execute(text("SELECT email FROM users WHERE role = 'it_support'")).scalars().all() == [IVAN]
    res = client.post("/api/auth/login", json={"email": "mark.manager@acme.test", "password": PASSWORD})
    assert res.status_code == 401


# ---------- the IT support workflow ----------

def test_new_it_ticket_is_assigned_to_it_support(make_ticket):
    t = make_ticket("IT")
    assert t["assignee_id"] and _user_role(t["assignee_id"]) == "it_support"
    hr_ticket = make_ticket("HR", "Test ticket: my payslip is missing a bonus")
    assert hr_ticket["assignee_id"] and _user_role(hr_ticket["assignee_id"]) == "hr"
    # IT support can't see the HR ticket; HR can't see the IT one.
    assert client.get(f"/api/tickets/{hr_ticket['ticket_id']}", headers=_h(IVAN)).status_code == 404
    assert client.get(f"/api/tickets/{t['ticket_id']}", headers=_h(HANNAH)).status_code == 404


def _user_role(user_id: str) -> str:
    with get_engine().connect() as conn:
        return conn.execute(text("SELECT role FROM users WHERE id = :id"), {"id": user_id}).scalar_one()


def test_take_ask_reply_resolve_reopen(make_ticket):
    t = make_ticket("IT")
    tid = t["ticket_id"]

    # Take it
    res = client.post(f"/api/tickets/{tid}/claim", headers=_h(IVAN))
    assert res.status_code == 200, res.text
    assert res.json()["ticket"]["assignee_name"] == "Ivan IT"
    assert res.json()["ticket"]["status"] == "in_progress"

    # Internal note: staff only
    client.post(f"/api/tickets/{tid}/messages", json={"body": "Probably a firmware issue.", "kind": "internal"}, headers=_h(IVAN))

    # Ask the employee -> waiting on employee
    res = client.post(f"/api/tickets/{tid}/messages", json={"body": "Which dock model is it?", "kind": "question"}, headers=_h(IVAN))
    assert res.json()["ticket"]["status"] == "waiting" and res.json()["ticket"]["waiting_on"] == "employee"

    # Employee sees the question but not the internal note, and can't change the ticket
    emma_view = client.get(f"/api/tickets/{tid}", headers=_h(EMMA)).json()
    notes = [e["note"] for e in emma_view["events"]]
    assert "Which dock model is it?" in notes and "Probably a firmware issue." not in notes
    assert "context" not in emma_view["ticket"]
    assert client.patch(f"/api/tickets/{tid}", json={"status": "closed"}, headers=_h(EMMA)).status_code == 403
    assert emma_view["permissions"] == {**emma_view["permissions"], "can_manage": False, "is_requester": True, "staff_view": False}

    # Employee replies -> back in progress
    res = client.post(f"/api/tickets/{tid}/messages", json={"body": "It's the USB-C dock, model D6000."}, headers=_h(EMMA))
    assert res.json()["ticket"]["status"] == "in_progress" and res.json()["ticket"]["waiting_on"] is None

    # Resolving needs a note of what fixed it
    assert client.patch(f"/api/tickets/{tid}", json={"status": "resolved"}, headers=_h(IVAN)).status_code == 400
    res = client.patch(f"/api/tickets/{tid}", json={"status": "resolved", "resolution": "Updated the dock firmware."}, headers=_h(IVAN))
    assert res.json()["ticket"]["status"] == "resolved" and res.json()["ticket"]["resolution"] == "Updated the dock firmware."

    # Employee was told
    with get_engine().connect() as conn:
        kinds = {r[0] for r in conn.execute(
            text("SELECT kind FROM notifications WHERE link LIKE :l AND user_id = (SELECT id FROM users WHERE email = :e)"),
            {"l": f"%{tid}%", "e": EMMA},
        )}
    assert {"ticket_message", "ticket_resolved"} <= kinds

    # Replying to a resolved ticket reopens it
    res = client.post(f"/api/tickets/{tid}/messages", json={"body": "It stopped working again."}, headers=_h(EMMA))
    assert res.json()["ticket"]["status"] == "in_progress"
    assert any(e["type"] == "reopened" for e in res.json()["events"])


def test_ask_admin_for_help_then_answer(make_ticket):
    t = make_ticket("IT", "Test ticket: I need an Adobe Acrobat Pro licence")
    tid = t["ticket_id"]
    # Nobody but an admin can be asked, and HR never sees IT tickets.
    bad = client.post(f"/api/tickets/{tid}/consult", json={"target_role": "hr", "question": "x?"}, headers=_h(IVAN))
    assert bad.status_code == 400
    assert client.get(f"/api/tickets/{tid}", headers=_h(HANNAH)).status_code == 404

    res = client.post(f"/api/tickets/{tid}/consult", json={"target_role": "admin", "question": "Do we have a spare licence?"}, headers=_h(IVAN))
    assert res.status_code == 200, res.text
    assert res.json()["ticket"]["waiting_on"] == "admin"
    consult_id = res.json()["consults"][0]["id"]

    admin_view = client.get(f"/api/tickets/{tid}", headers=_h(ALEX)).json()
    assert admin_view["permissions"]["can_answer_consult"]
    assert any(c["id"] == consult_id for c in client.get("/api/tickets/consults", headers=_h(ALEX)).json())
    # Employee never sees the question
    emma_view = client.get(f"/api/tickets/{tid}", headers=_h(EMMA)).json()
    assert emma_view["consults"] == [] and all("spare licence" not in (e["note"] or "") for e in emma_view["events"])
    # IT support can't answer its own question
    assert client.post(f"/api/tickets/{tid}/consults/{consult_id}/answer", json={"answer": "x"}, headers=_h(IVAN)).status_code == 403

    res = client.post(f"/api/tickets/{tid}/consults/{consult_id}/answer", json={"answer": "Yes, one spare."}, headers=_h(ALEX))
    assert res.status_code == 200, res.text
    assert res.json()["ticket"]["status"] == "in_progress"
    assert client.post(f"/api/tickets/{tid}/consults/{consult_id}/answer", json={"answer": "again"}, headers=_h(ALEX)).status_code == 409


def test_employee_turn_stays_visible_while_another_team_is_asked(make_ticket):
    tid = make_ticket("IT")["ticket_id"]
    client.post(f"/api/tickets/{tid}/messages", json={"body": "Which monitor model?", "kind": "question"}, headers=_h(IVAN))
    res = client.post(f"/api/tickets/{tid}/consult", json={"target_role": "admin", "question": "Is a new dock in budget?"}, headers=_h(IVAN))
    assert res.json()["ticket"]["waiting_on"] == "employee"  # still the employee's turn
    res = client.post(f"/api/tickets/{tid}/messages", json={"body": "Dell P2422H."}, headers=_h(EMMA))
    assert res.json()["ticket"]["status"] == "waiting" and res.json()["ticket"]["waiting_on"] == "admin"
    consult_id = client.get(f"/api/tickets/{tid}", headers=_h(IVAN)).json()["consults"][0]["id"]
    res = client.post(f"/api/tickets/{tid}/consults/{consult_id}/answer", json={"answer": "Yes."}, headers=_h(ALEX))
    assert res.json()["ticket"]["status"] == "in_progress" and res.json()["ticket"]["waiting_on"] is None


def test_it_support_can_open_only_runs_behind_their_tickets():
    with get_engine().connect() as conn:
        hr_run = conn.execute(text(
            "SELECT run_id FROM tickets WHERE category = 'HR' AND run_id IS NOT NULL LIMIT 1"
        )).scalar()
    if hr_run:
        assert client.get(f"/api/runs/{hr_run}/events", headers=_h(IVAN)).status_code == 403


def test_it_support_has_no_approvals_or_company_dashboards():
    # IT support uses the assistant / Talk to HR like an employee, but approvals are the admin's.
    assert client.get("/api/approvals?status=pending", headers=_h(IVAN)).json() == []
    assert client.get("/api/analytics/kpis", headers=_h(IVAN)).status_code == 403


def test_admin_decides_access_requests():
    pending = client.get("/api/approvals?status=pending", headers=_h(ALEX)).json()
    assert all(_user_role(a["approver_id"]) == "admin" for a in pending)
