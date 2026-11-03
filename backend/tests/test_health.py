from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_responds():
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert "status" in body
    assert "database" in body
    assert "pgvector" in body
    assert "connected" in body["database"]
    assert "enabled" in body["pgvector"]
