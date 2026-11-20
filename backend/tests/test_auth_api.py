"""Phase 4 verification: login for all 4 demo roles, server-side role enforcement (403 on
cross-role access), feedback visibly updating bandit_state, and the simulator producing a
learning curve. Requires a migrated + seeded database."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import check_db_connection, get_engine
from app.main import app

client = TestClient(app)

DEMO_PASSWORD = "Demo@1234"
DEMO_ACCOUNTS = [
    ("emma.employee@acme.test", "employee"),
    ("ivan.it@acme.test", "it_support"),
    ("hannah.hr@acme.test", "hr"),
    ("alex.admin@acme.test", "admin"),
]


def _db_available() -> bool:
    ok, _ = check_db_connection()
    return ok


pytestmark = pytest.mark.skipif(not _db_available(), reason="requires a seeded database")


def _login(email: str) -> str:
    res = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("email,role", DEMO_ACCOUNTS)
def test_login_works_for_every_demo_role(email: str, role: str):
    token = _login(email)
    res = client.get("/api/auth/me", headers=_auth_headers(token))
    assert res.status_code == 200
    assert res.json()["role"] == role
    assert res.json()["email"] == email


def test_login_rejects_wrong_password():
    res = client.post("/api/auth/login", json={"email": "emma.employee@acme.test", "password": "wrong"})
    assert res.status_code == 401


def test_unauthenticated_request_is_rejected():
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_employee_cannot_access_admin_only_analytics():
    token = _login("emma.employee@acme.test")
    res = client.get("/api/analytics/kpis", headers=_auth_headers(token))
    assert res.status_code == 403


def test_employee_cannot_trigger_eval_run():
    token = _login("emma.employee@acme.test")
    res = client.post("/api/eval/run", headers=_auth_headers(token))
    assert res.status_code == 403


def test_hr_can_access_analytics():
    token = _login("hannah.hr@acme.test")
    res = client.get("/api/analytics/kpis", headers=_auth_headers(token))
    assert res.status_code == 200
    assert "total_runs" in res.json()


def test_employee_cannot_see_another_users_run_events():
    token = _login("emma.employee@acme.test")
    engine = get_engine()
    with engine.connect() as conn:
        other_run = conn.execute(
            text(
                """SELECT r.id FROM agent_runs r JOIN users u ON u.id = r.user_id
                   WHERE u.email != 'emma.employee@acme.test' LIMIT 1"""
            )
        ).mappings().first()
    assert other_run, "seed data must contain at least one run belonging to another user"
    res = client.get(f"/api/runs/{other_run['id']}/events", headers=_auth_headers(token))
    assert res.status_code == 403


def test_feedback_updates_bandit_state():
    engine = get_engine()
    token = _login("emma.employee@acme.test")

    with engine.connect() as conn:
        run_row = conn.execute(
            text(
                """SELECT r.id FROM agent_runs r
                   JOIN bandit_decisions d ON d.run_id = r.id
                   JOIN users u ON u.id = r.user_id
                   WHERE u.email = 'emma.employee@acme.test'
                   AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.run_id = r.id)
                   LIMIT 1"""
            )
        ).mappings().first()
    if not run_row:
        pytest.skip("no feedback-free, bandit-decided run for emma.employee in this seed")
    run_id = str(run_row["id"])

    with engine.connect() as conn:
        decision = conn.execute(
            text("SELECT arm_id FROM bandit_decisions WHERE run_id = :rid ORDER BY created_at DESC LIMIT 1"),
            {"rid": run_id},
        ).mappings().first()
        pulls_before = conn.execute(
            text("SELECT pulls FROM bandit_state WHERE arm_id = :aid"), {"aid": decision["arm_id"]}
        ).mappings().first()
    pulls_before_n = (pulls_before["pulls"] if pulls_before else 0) or 0

    res = client.post(
        "/api/feedback", headers=_auth_headers(token),
        json={"run_id": run_id, "rating": 5, "resolved": True},
    )
    assert res.status_code == 200
    assert res.json()["updated_bandit"] is True

    with engine.connect() as conn:
        pulls_after = conn.execute(
            text("SELECT pulls FROM bandit_state WHERE arm_id = :aid"), {"aid": decision["arm_id"]}
        ).mappings().first()
    assert pulls_after["pulls"] == pulls_before_n + 1


def test_simulator_produces_a_learning_curve():
    from app.bandit.simulator import run_simulation

    result = run_simulation(60)
    assert result["n"] == 60
    for name, after in result["after"].items():
        assert after["pulls"] >= result["before"].get(name, {}).get("pulls", 0)
        assert after["avg_reward"] is not None
