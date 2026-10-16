"""Mstari core service - serverless entrypoint for the Vercel python runtime.

This file is the "core" service declared in the repo-root vercel.json. It
exposes the deterministic half of the agentic core (the same code the local
MCP server runs) as read-only HTTP endpoints, so the whole project can live
behind one deployment:

  GET  /                        status page (HTML)
  GET  /api/health              service + lane report (JSON)
  GET  /api/discriminators      SATS discriminator vocabulary (JSON)
  GET  /api/triage?patient=P-001   one-patient cited triage trace (JSON)
  POST /api/triage {"patient_ref": "P-001"}   same, JSON body

What is deliberately NOT here: the irreversible, human-gated tools
(confirm_priority, raise_recheck_flag) are never exposed over HTTP. They
stay behind the named-clinician gate in the local/MCP core and in the web
desk's server routes, exactly as SUBMISSION.md and ARCHITECTURE.md describe.

Extraction runs the documented deterministic keyword fallback lane in this
serverless context (no local Ollama here); every response labels its lane
honestly. Scoring is always deterministic scale code (mstari/scale.py, SATS
adult chart) - never a model. All data is synthetic; run artifacts go to the
ephemeral tmp filesystem.
"""
import json
import os
import tempfile
import traceback
from pathlib import Path
from urllib.parse import parse_qs

# ---------------------------------------------------------------------------
# Bootstrap BEFORE importing mstari modules: redirect run artifacts to the
# ephemeral tmp filesystem (serverless filesystems are read-only elsewhere)
# and label this run.
os.environ.setdefault("MSTARI_RUN_ID", "cloud-core-api")
import mstari.config as _cfg  # noqa: E402

TMP_RUNS = Path(tempfile.gettempdir()) / "mstari-runs"
_cfg.RUNS_DIR = TMP_RUNS

from mstari import audit as _audit  # noqa: E402  (binds config.RUNS_DIR)

_audit.RUNS_DIR = TMP_RUNS

from mstari import __version__, guardrails  # noqa: E402
from mstari import mcp_server as _srv  # noqa: E402

# FastMCP's @mcp.tool() normally returns the plain function; take .fn if an
# SDK version ever returns a tool object instead.
_score_priority = getattr(_srv.score_priority, "fn", _srv.score_priority)
_list_discriminators = getattr(_srv.list_discriminators, "fn", _srv.list_discriminators)

SCOPE = guardrails.SCOPE_BANNER

# ----------------------------------------------------------------- responses


def _json(status: int, payload: dict) -> tuple[int, str, str]:
    return status, "application/json; charset=utf-8", json.dumps(payload, ensure_ascii=False, default=str)


def _html(status: int, markup: str) -> tuple[int, str, str]:
    return status, "text/html; charset=utf-8", markup


def _health() -> dict:
    return {
        "service": "mstari-core",
        "version": __version__,
        "status": "ok",
        "role": "deterministic scoring core of the Mstari agent, exposed read-only",
        "lanes": {
            "extraction": "deterministic keyword fallback (serverless context; no Ollama here, labelled honestly)",
            "scoring": "deterministic SATS/TEWS scale code (mstari/scale.py) - never a model",
            "irreversible_actions": "NOT exposed over HTTP - named-clinician gate stays in the local/MCP core",
        },
        "tools_available": ["score_priority (acting, draft-only)", "list_discriminators (read-only)"],
        "tools_gated_and_not_exposed": ["confirm_priority", "raise_recheck_flag"],
        "data": "synthetic intake cards only (data/synthetic/patients/, each marked synthetic:true) - no PHI",
        "artifacts": f"ephemeral: {TMP_RUNS}",
        "interactive_desk": "the sibling 'web' service (Next.js) serves the hosted Triage Desk",
        "full_agent_locally": "./run_demo.sh",
    }


_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mstari core service - the Triage Desk</title>
<style>
  :root {{ --ink:#0f172a; --teal:#0f766e; --amber:#b45309; --line:#e2e8f0; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
         color:var(--ink); background:#f8fafc; }}
  main {{ max-width:820px; margin:0 auto; padding:48px 24px 64px; }}
  h1 {{ font-size:1.6rem; margin:0 0 4px; }}
  h1 span {{ color:var(--teal); }}
  p.sub {{ margin:0 0 28px; color:#475569; }}
  .banner {{ border-left:4px solid var(--amber); background:#fffbeb; padding:12px 16px;
             border-radius:6px; font-size:.95rem; margin-bottom:28px; }}
  h2 {{ font-size:1.05rem; margin:28px 0 10px; }}
  table {{ width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line);
           border-radius:8px; overflow:hidden; }}
  td, th {{ text-align:left; padding:10px 14px; border-top:1px solid var(--line); font-size:.93rem; }}
  th {{ background:#f1f5f9; font-weight:600; }}
  code {{ background:#eef2f7; padding:2px 6px; border-radius:4px; font-size:.88em; }}
  a {{ color:var(--teal); }}
  footer {{ margin-top:32px; color:#64748b; font-size:.85rem; }}
</style>
</head>
<body>
<main>
  <h1>Mstari <span>&mdash; the Triage Desk</span> &middot; core service</h1>
  <p class="sub">Deterministic SATS/TEWS scoring core of the agentic triage queue,
     served read-only (v{VERSION}).</p>
  <div class="banner">{SCOPE}</div>

  <h2>Endpoints</h2>
  <table>
    <tr><th>Endpoint</th><th>What it returns</th></tr>
    <tr><td><a href="/api/health"><code>GET /api/health</code></a></td>
        <td>Service, lanes, and what is (deliberately) not exposed.</td></tr>
    <tr><td><a href="/api/discriminators"><code>GET /api/discriminators</code></a></td>
        <td>The SATS adult-chart discriminator vocabulary with colours.</td></tr>
    <tr><td><a href="/api/triage?patient=P-001"><code>GET /api/triage?patient=P-001</code></a></td>
        <td>One synthetic patient run through the real pipeline:
            intake &rarr; extraction (labelled lane) &rarr; cited TEWS &rarr;
            <em>draft</em> card. Publishing still requires a named clinician.</td></tr>
  </table>

  <h2>Where the rest lives</h2>
  <table>
    <tr><th>Part</th><th>Runs</th></tr>
    <tr><td>Interactive Triage Desk (queue board, gate, audit)</td>
        <td>sibling <code>web</code> service on this deployment</td></tr>
    <tr><td>Full agentic core: LangGraph orchestration, own MCP server
            (6 tools, 2 clinician-gated), local open-weights Qwen lane</td>
        <td>locally, from the repo root: <code>./run_demo.sh</code></td></tr>
  </table>

  <footer>Synthetic data only &mdash; no PHI exists, is stored, or is transmitted.
  Agentic AI for Africa Innovation Challenge &middot; healthcare track.</footer>
</main>
</body>
</html>
"""


def _page() -> str:
    return _PAGE.format(VERSION=__version__, SCOPE=SCOPE)


async def _read_body(receive) -> bytes:
    body = b""
    while True:
        msg = await receive()
        body += msg.get("body", b"")
        if not msg.get("more_body"):
            return body


def _route(method: str, path: str, query: dict, body: bytes) -> tuple[int, str, str]:
    if path in ("/", ""):
        if method != "GET":
            return _json(405, {"error": "method not allowed"})
        return _html(200, _page())

    if path == "/api/health":
        return _json(200, _health())

    if path == "/api/discriminators":
        return _json(200, _list_discriminators())

    if path == "/api/triage":
        if method == "GET":
            patient = (query.get("patient") or [""])[0].strip()
        elif method == "POST":
            try:
                payload = json.loads(body.decode("utf-8") or "{}")
            except json.JSONDecodeError as e:
                return _json(400, {"error": f"invalid JSON body: {e}"})
            patient = str(payload.get("patient_ref", "")).strip()
        else:
            return _json(405, {"error": "method not allowed"})

        if not patient:
            return _json(400, {
                "error": "missing patient reference",
                "usage": "GET /api/triage?patient=P-001  (12 synthetic cards: P-001..P-012)"})

        result = _score_priority(patient_ref=patient, discriminators="[]",
                                 extraction_source="keyword_fallback")
        return _json(200, {
            "endpoint": "triage (one-patient cited trace)",
            "request": {"patient_ref": patient, "lane": "keyword_fallback (deterministic)"},
            "result": result,
            "scope": SCOPE,
            "next_step": ("This is a DRAFT. It reaches the live queue only after a named "
                          "clinician approves the gated confirm_priority - in the web desk "
                          "or the local agent (./run_demo.sh). Never over HTTP.")})

    return _json(404, {"error": f"no route for {method} {path}",
                       "routes": ["/", "/api/health", "/api/discriminators", "/api/triage"]})


async def app(scope, receive, send):
    """Pure-ASGI application (no framework dependency)."""
    if scope["type"] == "lifespan":
        while True:
            msg = await receive()
            if msg["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif msg["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return
    if scope["type"] != "http":
        return

    try:
        query = parse_qs(scope.get("query_string", b"").decode("utf-8"))
        body = await _read_body(receive)
        status, content_type, payload = _route(scope["method"], scope["path"].rstrip("/") or "/", query, body)
    except Exception as exc:  # honest failure, never a silent one
        status, content_type = 500, "application/json; charset=utf-8"
        payload = json.dumps({
            "error": f"{type(exc).__name__}: {exc}",
            "hint": "the core service failed; see the deployment logs",
        }, ensure_ascii=False)
        traceback.print_exc()

    data = payload.encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            [b"content-type", content_type.encode("utf-8")],
            [b"content-length", str(len(data)).encode("ascii")],
        ],
    })
    await send({"type": "http.response.body", "body": data})
