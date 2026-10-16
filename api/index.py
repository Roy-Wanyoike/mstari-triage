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
<title>Mstari core service — the Triage Desk</title>
<style>
  :root {{
    --ink:#0f172a; --teal:#0f766e; --teal-ink:#115e59; --amber:#b45309;
    --line:#e2e8f0; --soft:#64748b; --chip:#eef2f7;
  }}
  * {{ box-sizing:border-box; }}
  body {{
    margin:0; font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    color:var(--ink); background:#f7fafa;
    background-image:radial-gradient(1200px 500px at 50% -10%, #dceef0, transparent);
    background-repeat:no-repeat;
  }}
  .ribbon {{ height:5px; display:flex; }}
  .ribbon span {{ flex:1; }}
  .ribbon .r {{ background:#dc2626; }} .ribbon .o {{ background:#f97316; }} .ribbon .y {{ background:#eab308; }} .ribbon .g {{ background:#059669; }}
  header {{ background:rgba(255,255,255,.88); border-bottom:1px solid var(--line);
            box-shadow:0 1px 2px rgba(15,23,42,.05); }}
  .head-in {{ max-width:860px; margin:0 auto; padding:18px 24px; display:flex;
              flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px; }}
  .brand {{ display:flex; align-items:center; gap:14px; }}
  .mark {{ width:44px; height:44px; border-radius:12px; background:#0d1a26;
           display:flex; align-items:center; justify-content:center;
           box-shadow:0 4px 10px rgba(15,23,42,.25); border:1px solid rgba(255,255,255,.14); }}
  h1 {{ font-size:1.3rem; margin:0; letter-spacing:-.01em; }}
  h1 .thin {{ font-weight:300; color:#94a3b8; }} h1 .teal {{ color:var(--teal-ink); }}
  .sub {{ margin:2px 0 0; color:var(--soft); font-size:.85rem; }}
  .pills {{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; }}
  .pill {{ border:1px solid #cbd5e1; background:#fff; border-radius:99px; padding:4px 12px;
           font-size:.75rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--soft); }}
  .pill b {{ color:var(--ink); font-weight:600; }}
  a.desk {{ border:1px solid #cbd5e1; background:#fff; border-radius:99px; padding:5px 14px;
            font-size:.8rem; font-weight:600; color:var(--teal-ink); text-decoration:none; }}
  a.desk:hover {{ border-color:var(--teal); }}
  main {{ max-width:860px; margin:0 auto; padding:28px 24px 64px; }}
  .banner {{ display:flex; gap:10px; align-items:flex-start; border:1px solid rgba(217,119,6,.35);
             background:#fffbeb; border-radius:12px; padding:12px 16px; margin-bottom:26px;
             font-size:.85rem; line-height:1.55; color:#78350f; }}
  .banner svg {{ flex-shrink:0; margin-top:2px; }}
  h2 {{ font-size:.95rem; margin:30px 0 12px; color:#1e293b; }}
  .card {{ background:#fff; border:1px solid var(--line); border-radius:14px;
           box-shadow:0 1px 2px rgba(15,23,42,.06); overflow:hidden; }}
  table {{ width:100%; border-collapse:collapse; font-size:.88rem; }}
  th {{ text-align:left; background:#f8fafc; color:var(--soft); font-size:.68rem;
        text-transform:uppercase; letter-spacing:.08em; padding:9px 16px;
        border-bottom:1px solid var(--line); }}
  td {{ padding:11px 16px; border-bottom:1px solid var(--line); vertical-align:top; }}
  tr:last-child td {{ border-bottom:0; }}
  tr:hover td {{ background:#f8fafc; }}
  code {{ background:var(--chip); padding:2px 7px; border-radius:6px; font-size:.82em; }}
  a {{ color:var(--teal-ink); font-weight:600; text-decoration:none; }}
  a:hover {{ text-decoration:underline; }}
  .muted {{ color:var(--soft); }}
  .chip-red {{ display:inline-block; background:#dc2626; color:#fff; font-weight:700;
               font-size:.66rem; letter-spacing:.05em; padding:2px 9px; border-radius:99px; }}
  .chip-green {{ display:inline-block; background:#059669; color:#fff; font-weight:700;
                 font-size:.66rem; letter-spacing:.05em; padding:2px 9px; border-radius:99px; }}
  footer {{ border-top:1px solid var(--line); background:rgba(255,255,255,.7); }}
  .foot-in {{ max-width:860px; margin:0 auto; padding:18px 24px; font-size:.8rem;
              color:var(--soft); line-height:1.6; }}
  .foot-in b {{ color:#334155; }}
</style>
</head>
<body>
<div class="ribbon"><span class="r"></span><span class="o"></span><span class="y"></span><span class="g"></span></div>
<header>
  <div class="head-in">
    <div class="brand">
      <div class="mark">
        <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
          <defs><linearGradient id="satsline" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#ef4444"/><stop offset="0.38" stop-color="#f97316"/>
            <stop offset="0.66" stop-color="#facc15"/><stop offset="1" stop-color="#10b981"/>
          </linearGradient></defs>
          <path d="M7 36H18L23 36L28 22L34.5 48L39 29L42 36H57" fill="none" stroke="url(#satsline)" stroke-width="4.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <h1>Mstari <span class="thin">—</span> <span class="teal">the Triage Desk</span> <span class="thin">·</span> core service</h1>
        <p class="sub">Deterministic SATS/TEWS scoring core of the agentic triage queue, served read-only (v{VERSION})</p>
      </div>
    </div>
    <div class="pills">
      <a class="desk" href="/">Open the Triage Desk &rarr;</a>
      <span class="pill">core · <b>v{VERSION}</b></span>
    </div>
  </div>
</header>
<main>
  <div class="banner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
    <span><b>Scope — enforced in code, not in prose.</b> {SCOPE} The irreversible, human-gated tools (confirm_priority, raise_recheck_flag) are never exposed over HTTP.</span>
  </div>

  <h2>Try the pipeline</h2>
  <div class="card">
    <table>
      <tr><th style="width:38%">Endpoint</th><th>What it returns</th></tr>
      <tr>
        <td><a href="/api/health"><code>GET /api/health</code></a></td>
        <td>Service, lanes, and what is (deliberately) not exposed.</td>
      </tr>
      <tr>
        <td><a href="/api/discriminators"><code>GET /api/discriminators</code></a></td>
        <td>The SATS adult-chart discriminator vocabulary with colours.</td>
      </tr>
      <tr>
        <td><a href="/api/triage?patient=P-001"><code>GET /api/triage?patient=P-001</code></a></td>
        <td><span class="chip-green">ROUTINE</span> One synthetic patient through the real pipeline: intake &rarr; extraction (labelled lane) &rarr; cited TEWS &rarr; <em>draft</em> card. Publishing still requires a named clinician.</td>
      </tr>
      <tr>
        <td><a href="/api/triage?patient=P-008"><code>GET /api/triage?patient=P-008</code></a></td>
        <td><span class="chip-red">ESCALATION</span> The same pipeline on a case that overrides to <b>RED (immediate)</b> on a cited discriminator.</td>
      </tr>
    </table>
  </div>

  <h2>Where the rest lives</h2>
  <div class="card">
    <table>
      <tr><th style="width:38%">Part</th><th>Runs</th></tr>
      <tr>
        <td>Interactive Triage Desk <span class="muted">(queue board, human gate, audit trail)</span></td>
        <td>sibling <code>web</code> service on this deployment &mdash; <a href="/">open the desk</a></td>
      </tr>
      <tr>
        <td>Full agentic core <span class="muted">(LangGraph orchestration, own MCP server with 6 tools — 2 clinician-gated, local open-weights Qwen lane)</span></td>
        <td>locally, from the repo root: <code>./run_demo.sh</code></td>
      </tr>
    </table>
  </div>
</main>
<footer>
  <div class="foot-in">
    Synthetic data only &mdash; no PHI exists, is stored, or is transmitted. Every response labels its extraction lane honestly.<br>
    <b>github.com/Roy-Wanyoike/mstari-triage</b> · MIT · Agentic AI for Africa Innovation Challenge &mdash; Healthcare: The Triage Desk
  </div>
</footer>
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
        path = scope["path"].rstrip("/") or "/"
        # Prefix tolerance: when the services rewrite routes /core/* here, the
        # platform may hand us the original path or the stripped one. Accept both.
        if path == "/core":
            path = "/"
        elif path.startswith("/core/"):
            path = path[len("/core"):]
        status, content_type, payload = _route(scope["method"], path, query, body)
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
