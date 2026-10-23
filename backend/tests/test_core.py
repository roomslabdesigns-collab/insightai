from fastapi.testclient import TestClient

from app import analytics, heuristics, llm, rag
from app.main import app
from pipeline.enrich import _validate

client = TestClient(app)


def test_heuristic_labels():
    lab = heuristics.label("App crashes every time I open it. Uninstalling.", 1)
    assert lab == {**lab, "sentiment": "negative", "theme": "Crashes & Stability", "severity": "high", "churn_risk": True}
    assert heuristics.label("Great app, love it", 5)["theme"] == "General Feedback"
    assert heuristics.label("Please add dark mode", 4)["feedback_type"] == "feature request"


def test_parse_json_handles_fences_and_chatter():
    assert llm.parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert llm.parse_json('Sure! Here it is: {"items": []} hope that helps') == {"items": []}


def test_model_rotation_and_provider_fallback(monkeypatch):
    import time

    primary = [llm.Endpoint("primary", m, None) for m in ("a", "b")]
    backup = [llm.Endpoint("gemini", "g", None)]
    monkeypatch.setattr(llm, "_groups", [primary, backup])
    monkeypatch.setattr(llm, "_next", {})
    # Primary models rotate and a rate-limited one is skipped; the backup is not used while primary works
    monkeypatch.setattr(llm, "_cooldown", {"b": time.time() + 60})
    assert {llm._pick().model for _ in range(4)} == {"a"}
    # All primary models limited -> fall back to Gemini
    monkeypatch.setattr(llm, "_cooldown", {"a": time.time() + 60, "b": time.time() + 60})
    assert llm._pick().provider == "gemini"
    monkeypatch.setattr(llm, "_cooldown", {m: time.time() + 60 for m in "abg"})
    assert llm._pick() is None


def test_validate_falls_back_on_bad_llm_fields():
    row = {"text": "Crashes on start", "star": 1}
    out = _validate({"sentiment": "NEGATIVE", "theme": "Not a theme", "severity": "high", "type": "bug report"}, row)
    assert out["sentiment"] == "negative"
    assert out["theme"] == "Crashes & Stability"  # off-list theme replaced by rule-based label
    assert out["feedback_type"] == "bug report"


def test_review_flags():
    evidence = [
        {"id": "R1", "sentiment": "negative", "customer_id": "C1", "arr": 150_000},
        {"id": "R2", "sentiment": "positive", "customer_id": "C2", "arr": 90_000},
    ]
    reasons = rag._review_flags({"confidence": "low", "severity": "high"}, evidence, relevant=1, cited=["R1", "R2"])
    text = " ".join(reasons)
    assert "Insufficient evidence" in text and "Conflicting" in text and "Low model confidence" in text
    assert "High-impact" in text


def test_overview_counts_each_account_once():
    o = analytics.overview()
    assert o["kpis"]["signals"] == 6
    # CUST-1000 ($120K) appears twice but its ARR must only count once
    crash = next(t for t in o["themes"] if t["theme"] == "Crashes & Stability")
    assert crash["impact"] <= 120_000 + 5_000 + 30_000


def test_api_endpoints():
    assert client.get("/api/overview").json()["kpis"]["signals"] == 6
    opps = client.get("/api/opportunities").json()
    assert opps and opps == sorted(opps, key=lambda o: -o["score"])
    assert {s["segment"] for s in client.get("/api/segments").json()} == {"SMB", "Mid-Market", "Enterprise"}
    page = client.get("/api/feedback", params={"sentiment": "negative", "page_size": 2}).json()
    assert page["total"] == 4 and len(page["items"]) == 2
    assert client.get("/api/feedback", params={"q": "battery"}).json()["total"] == 1


def test_query_without_index_returns_503():
    assert client.post("/api/query", json={"question": "why does it crash?"}).status_code == 503
