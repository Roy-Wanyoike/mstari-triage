"""Tests for the serverless core service (api/index.py) - pure ASGI.

Runnable both ways:
  pytest tests/test_api_asgi.py
  python3 tests/test_api_asgi.py
"""
import asyncio
import json
from pathlib import Path

import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from api.index import app  # noqa: E402


def _call(method: str, path: str, query: bytes = b"", body: bytes = b"") -> dict:
    """Drive the ASGI app in-process; returns {status, headers, body}."""
    sent = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(msg):
        sent.append(msg)

    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "query_string": query,
        "headers": [],
    }
    asyncio.run(app(scope, receive, send))
    start = next(m for m in sent if m["type"] == "http.response.start")
    chunks = [m.get("body", b"") for m in sent if m["type"] == "http.response.body"]
    headers = {k.decode(): v.decode() for k, v in start.get("headers", [])}
    return {"status": start["status"], "headers": headers, "body": b"".join(chunks)}


def _json_of(res: dict) -> dict:
    return json.loads(res["body"].decode("utf-8"))


def test_status_page():
    res = _call("GET", "/")
    assert res["status"] == 200
    assert res["headers"]["content-type"].startswith("text/html")
    assert "Mstari" in res["body"].decode("utf-8")


def test_health_reports_gated_tools_as_not_exposed():
    res = _call("GET", "/api/health")
    payload = _json_of(res)
    assert res["status"] == 200
    assert payload["service"] == "mstari-core"
    assert "confirm_priority" in payload["tools_gated_and_not_exposed"]
    assert "raise_recheck_flag" in payload["tools_gated_and_not_exposed"]


def test_discriminators_vocabulary():
    res = _call("GET", "/api/discriminators")
    payload = _json_of(res)
    assert res["status"] == 200
    assert payload["discriminators"], "expected the SATS vocabulary"


def test_triage_adult_green_case():
    res = _call("GET", "/api/triage", query=b"patient=P-001")
    payload = _json_of(res)
    assert res["status"] == 200
    r = payload["result"]
    assert r["status"] == "DRAFT_WRITTEN"
    assert r["tews"] == 0
    assert r["citations"]["vitals"] >= 6
    assert "named clinician" in r["note"]


def test_triage_red_case():
    res = _call("GET", "/api/triage", query=b"patient=P-008")
    payload = _json_of(res)
    r = payload["result"]
    assert res["status"] == 200
    assert r["status"] == "DRAFT_WRITTEN"
    assert r["colour"] == "RED"


def test_triage_child_escalated_never_scored():
    res = _call("GET", "/api/triage", query=b"patient=P-004")
    payload = _json_of(res)
    r = payload["result"]
    assert res["status"] == 200
    assert r["status"] == "OUT_OF_SCOPE_ADULT_CHART"
    assert "tews" not in r


def test_triage_unknown_patient_honest_404_style():
    res = _call("GET", "/api/triage", query=b"patient=P-999")
    payload = _json_of(res)
    assert res["status"] == 200  # the tool ran; it reports NOT_FOUND itself
    assert payload["result"]["status"] == "NOT_FOUND"


def test_triage_missing_arg():
    res = _call("GET", "/api/triage")
    assert res["status"] == 400


def test_unknown_route_404():
    res = _call("GET", "/api/nope")
    assert res["status"] == 404


def test_core_prefix_routed_paths():
    # services rewrite may hand us /core/api/health (original path) — accept it
    res = _call("GET", "/core/api/health")
    assert res["status"] == 200
    assert _json_of(res)["service"] == "mstari-core"


def test_core_prefix_root():
    res = _call("GET", "/core")
    assert res["status"] == 200
    assert "Mstari" in res["body"].decode("utf-8")


def test_post_triage_body():
    res = _call("POST", "/api/triage", body=json.dumps({"patient_ref": "P-002"}).encode())
    payload = _json_of(res)
    assert res["status"] == 200
    assert payload["result"]["status"] in ("DRAFT_WRITTEN", "OUT_OF_SCOPE_ADULT_CHART")


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
    raise SystemExit(1 if failures else 0)
