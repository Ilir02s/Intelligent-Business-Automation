import json
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai import ollama
from app.core.database import create_database
from app.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(ollama, "ENABLED", False)
    engine, sessions = create_database(tmp_path / "test.db")
    with TestClient(create_app(engine, sessions, seed_demo=False)) as test_client:
        yield test_client
    engine.dispose()


@pytest.mark.parametrize(("text", "category", "priority"), [
    ("Please refund invoice INV-2048 for $180", "Billing", "Normal"),
    ("Critical VPN outage on 2026-04-07", "IT support", "Critical"),
    ("Package damaged during delivery", "Customer support", "Normal"),
    ("A quote and demo are needed today", "Sales", "High"),
    ("What are your office hours? No rush", "General inquiries", "Low"),
])
def test_rule_classification(client, text, category, priority):
    response = client.post("/api/requests/analyze", json={"text": text})
    assert response.status_code == 201
    analysis = response.json()["analysis"]
    assert (analysis["category"], analysis["priority"], analysis["processing_method"]) == (category, priority, "rules")


def test_approval_and_audit(client):
    item = client.post("/api/requests/analyze", json={
        "text": "Refund invoice INV-42 for CHF 140.00. Contact test@example.com on 2026-04-07."
    }).json()
    path = f"/api/workflows/{item['id']}"
    assert item["status"] == "pending_approval"
    assert [entity["type"] for entity in item["analysis"]["entities"]] == ["Email", "Reference", "Amount", "Date"]
    assert client.get("/api/dashboard").json()["pending"] == 1
    response = client.post(path + "/decision", json={"decision": "approve"})
    assert response.status_code == 200
    assert [step["status"] for step in response.json()["steps"]] == ["completed", "approved", "ready"]
    assert client.get(path).json()["status"] == "completed"
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["completed"] == 1
    assert dashboard["activity"][-1]["count"] == 1
    assert dashboard["activity"][-1]["completed"] == 1
    assert client.get("/api/requests").json()[0]["text"].startswith("Refund")
    assert [row["event"] for row in client.get("/api/activity").json()] == ["workflow_approved", "approval_requested"]


def test_concurrent_decisions(client):
    item = client.post("/api/requests/analyze", json={"text": "Please review this refund"}).json()
    path = f"/api/workflows/{item['id']}/decision"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post(path, json={"decision": "reject"}), range(2)))
    assert sorted(response.status_code for response in results) == [200, 409]
    accepted = next(response.json() for response in results if response.status_code == 200)
    assert accepted["status"] == "rejected"
    assert accepted["steps"][-1]["status"] == "cancelled"
    assert len(client.get("/api/activity").json()) == 2


def test_validation(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/ai/status").json()["ollama"] == "disabled"
    assert client.post("/api/requests/analyze", json={"text": "   "}).status_code == 422
    assert client.post("/api/requests/analyze", json={"text": "x" * 8001}).status_code == 422
    assert client.get("/api/workflows/999").status_code == 404
    assert client.get("/api/dashboard?days=0").status_code == 422


def test_unavailable_ollama_falls_back(client, monkeypatch):
    monkeypatch.setattr(ollama, "ENABLED", True)

    def unavailable(request):
        raise httpx.ConnectError("Test connection failure", request=request)

    monkeypatch.setattr(ollama, "Client", lambda **kwargs: httpx.Client(
        transport=httpx.MockTransport(unavailable), **kwargs
    ))
    assert client.get("/api/ai/status").json()["ollama"] == "unavailable"
    item = client.post("/api/requests/analyze", json={"text": "Please review my invoice"}).json()
    assert item["analysis"]["processing_method"] == "rules"


def test_ollama_result_validation_and_safeguard(client, monkeypatch):
    monkeypatch.setattr(ollama, "ENABLED", True)
    payload = {"category": "IT support", "priority": "Low", "summary": "VPN outage", "entities": []}

    def local_reply(request):
        assert request.url.path == "/api/chat"
        return httpx.Response(200, json={"message": {"content": json.dumps(payload)}})

    monkeypatch.setattr(ollama, "Client", lambda **kwargs: httpx.Client(
        transport=httpx.MockTransport(local_reply), **kwargs
    ))
    item = client.post("/api/requests/analyze", json={"text": "Critical VPN outage"}).json()
    assert item["analysis"]["processing_method"] == "ollama"
    assert item["analysis"]["priority"] == "Critical"
    assert item["status"] == "pending_approval"
    payload["entities"] = [{"type": "Email", "value": "invented@example.com"}]
    item = client.post("/api/requests/analyze", json={"text": "Critical VPN outage"}).json()
    assert item["analysis"]["processing_method"] == "rules"


def test_seed_is_persistent_and_idempotent(tmp_path):
    engine, sessions = create_database(tmp_path / "demo.db")
    for _ in range(2):
        with TestClient(create_app(engine, sessions, seed_demo=True)) as client:
            data = client.get("/api/dashboard").json()
            assert data["total"] == 8
            assert data["pending"] == 3
            assert all(entry["demo"] for entry in data["recent"])
    engine.dispose()
