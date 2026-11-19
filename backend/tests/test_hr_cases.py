"""Confidential HR cases: only the reporter and HR can see a case — never managers or admins —
anonymous reporters stay anonymous to HR, and private matters typed into the chat are redirected
to HR without being stored in chat history or agent runs. Requires a migrated + seeded database."""
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.agents.hr_confidential import detect
from app.config import get_settings
from app.db import check_db_connection, get_engine
from app.main import app

client = TestClient(app)
PASSWORD = "Demo@1234"


def _db_available() -> bool:
    ok, _ = check_db_connection()
    return ok


pytestmark = pytest.mark.skipif(not _db_available(), reason="requires a seeded database")


TEST_SUBJECT = "My manager shouts at me"


@pytest.fixture(autouse=True, scope="module")
def _remove_test_cases():
    """Keep the demo HR queue clean: delete the cases these tests create."""
    settings = get_settings()
    smtp_host = settings.SMTP_HOST
    settings.SMTP_HOST = ""  # never send real email from tests
    yield
    settings.SMTP_HOST = smtp_host
    with get_engine().begin() as conn:
        conn.execute(
            text("""DELETE FROM notifications n USING hr_cases c
                    WHERE c.subject = :s AND n.link LIKE '%case=' || c.id::text"""),
            {"s": TEST_SUBJECT},
        )
        conn.execute(text("DELETE FROM hr_cases WHERE subject = :s"), {"s": TEST_SUBJECT})


def _h(email: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


EMMA, MARK, HANNAH, ALEX = (
    "emma.employee@acme.test", "mark.manager@acme.test", "hannah.hr@acme.test", "alex.admin@acme.test",
)


def _new_case(anonymous: bool = False, **overrides) -> dict:
    body = {
        "category": "manager_concern", "subject": TEST_SUBJECT,
        "description": "In the last three team meetings my manager shouted at me in front of everyone.",
        "people_involved": "Mark Manager", "urgency": "normal", "anonymous": anonymous, **overrides,
    }
    res = client.post("/api/hr-cases", json=body, headers=_h(EMMA))
    assert res.status_code == 201, res.text
    return res.json()


def test_employee_creates_case_and_sees_it_in_their_list():
    case = _new_case()
    assert case["number"].startswith("HR-")
    assert case["status"] == "received"
    mine = client.get("/api/hr-cases/mine", headers=_h(EMMA)).json()
    assert case["id"] in [c["id"] for c in mine]


def test_hr_sees_case_but_manager_and_admin_cannot():
    case = _new_case()
    # HR: list + detail
    hr_list = client.get("/api/hr-cases", headers=_h(HANNAH))
    assert hr_list.status_code == 200
    assert case["id"] in [c["id"] for c in hr_list.json()]
    assert client.get(f"/api/hr-cases/{case['id']}", headers=_h(HANNAH)).status_code == 200
    # Manager (the very person the complaint is about) and admin: no list, no detail, no reply.
    for who in (MARK, ALEX):
        assert client.get("/api/hr-cases", headers=_h(who)).status_code == 403
        assert client.get(f"/api/hr-cases/{case['id']}", headers=_h(who)).status_code == 404
        assert client.post(f"/api/hr-cases/{case['id']}/messages", json={"body": "hi"}, headers=_h(who)).status_code == 404
        assert client.patch(f"/api/hr-cases/{case['id']}", json={"status": "closed"}, headers=_h(who)).status_code == 403
        assert case["id"] not in [c["id"] for c in client.get("/api/hr-cases/mine", headers=_h(who)).json()]


def test_anonymous_reporter_is_hidden_from_hr_but_not_from_themselves():
    case = _new_case(anonymous=True)
    hr_view = client.get(f"/api/hr-cases/{case['id']}", headers=_h(HANNAH)).json()
    assert hr_view["case"]["reporter_name"] == "Anonymous employee"
    assert hr_view["case"]["reporter_email"] is None
    client.post(f"/api/hr-cases/{case['id']}/messages", json={"body": "One more detail from me."}, headers=_h(EMMA))
    hr_view = client.get(f"/api/hr-cases/{case['id']}", headers=_h(HANNAH)).json()
    assert all(m["author_name"] != "Emma Employee" for m in hr_view["messages"])
    own_view = client.get(f"/api/hr-cases/{case['id']}", headers=_h(EMMA)).json()
    assert own_view["case"]["reporter_name"] == "Emma Employee"


def test_hr_reply_and_status_flow():
    case = _new_case()
    detail = client.post(f"/api/hr-cases/{case['id']}/messages", json={"body": "Thanks Emma, can we meet tomorrow?"},
                         headers=_h(HANNAH)).json()
    assert detail["case"]["status"] == "in_review"  # first HR reply
    detail = client.patch(f"/api/hr-cases/{case['id']}", json={"assign_to_me": True, "status": "waiting_on_employee"},
                          headers=_h(HANNAH)).json()
    assert detail["case"]["assigned_hr_name"] == "Hannah HR"
    detail = client.post(f"/api/hr-cases/{case['id']}/messages", json={"body": "Yes, 10am works."}, headers=_h(EMMA)).json()
    assert detail["case"]["status"] == "in_review"  # employee answered
    detail = client.patch(f"/api/hr-cases/{case['id']}",
                          json={"status": "resolved", "resolution_note": "Spoke with both; agreed a plan."},
                          headers=_h(HANNAH)).json()
    assert detail["case"]["status"] == "resolved" and detail["case"]["resolved_at"]
    detail = client.patch(f"/api/hr-cases/{case['id']}", json={"status": "closed"}, headers=_h(HANNAH)).json()
    assert client.post(f"/api/hr-cases/{case['id']}/messages", json={"body": "?"}, headers=_h(EMMA)).status_code == 409


def test_safety_cases_are_always_urgent():
    case = _new_case(category="safety", urgency="normal")
    assert case["urgency"] == "urgent"


def test_employee_cannot_open_someone_elses_case():
    case = _new_case()
    priya = client.post("/api/auth/login", json={"email": "priya.sharma@acme.test", "password": PASSWORD})
    if priya.status_code != 200:
        pytest.skip("priya demo account not available")
    headers = {"Authorization": f"Bearer {priya.json()['access_token']}"}
    assert client.get(f"/api/hr-cases/{case['id']}", headers=headers).status_code == 404


def _stream(message: str, headers: dict, conversation_id: str) -> list[dict]:
    events = []
    with client.stream("POST", "/api/chat/stream", json={"message": message, "conversation_id": conversation_id},
                       headers=headers) as res:
        for line in res.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))
    return events


def test_private_matter_in_chat_is_redirected_and_never_stored():
    headers = _h(EMMA)
    conv = client.post("/api/conversations", json={}, headers=headers).json()
    secret = "My manager Mark keeps humiliating me in meetings and I want to report him"
    events = _stream(secret, headers, conv["id"])
    final = [e for e in events if e["type"] == "final"][0]
    assert final["hr_redirect"]["category"] in ("manager_concern", "colleague_conflict", "other")
    assert "Only the HR team can read it" in final["answer"]
    assert "Mark" not in final["answer"], "the reply must not repeat names back"
    assert final["run_id"] is None, "no agent run should be created"

    with get_engine().connect() as conn:
        stored = conn.execute(text("SELECT content FROM messages WHERE conversation_id = :c"), {"c": conv["id"]}).scalars().all()
        runs = conn.execute(text("SELECT count(*) FROM agent_runs WHERE query = :q"), {"q": secret}).scalar_one()
    assert secret not in stored and all("humiliating" not in m for m in stored)
    assert runs == 0


def test_ordinary_questions_still_reach_the_agents():
    for message in ["how do I report a phishing email", "what's the bereavement leave policy",
                    "Can I take casual leave for personal reasons?", "my manager hasn't approved my leave"]:
        assert detect(message) is None, message
