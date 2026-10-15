# ARCHITECTURE.md — Mstari, the Triage Desk

*(one page, per the track brief)*

## Agent shape

**LangGraph pipeline with a clinician gate**, orchestrated over MCP tools:

![Mstari system architecture — data sources → LangGraph agent → models / MCP tools / human gate → run artifacts](docs/architecture.png)

*(editable source: [`docs/architecture.html`](docs/architecture.html))*

Why an agent and not a script: each node decides its next call from the
previous node's output — the extract node maps whatever complaint text it
actually receives onto the SATS discriminator list (open-weights LLM with a
deterministic keyword fallback, honestly labelled in every card), failures are
caught per node and degrade gracefully, and the graph genuinely stops at the
gate when no named clinician approves.

## Division of labour (the safety core)

1. **The LLM reads** — free-text complaint → SATS discriminator codes. That is
   the open-weights model's one full task (Qwen 2.5 via Ollama by default;
   patient data never leaves the machine).
2. **The scale scores** — `mstari/scale.py` is deterministic, cited code: an
   implementation of the published SATS adult chart. The model never invents a
   priority. Every component carries the source field it came from, so every
   priority level cites the vitals behind it.
3. **The clinician decides** — `confirm_priority` and `raise_recheck_flag`
   block by default; a named clinician's approval is recorded with a
   timestamp in `gate_ledger.json` before a priority reaches the queue
   position. A re-check flag is "a second look, not a verdict".
4. **Guardrails sweep the text** — diagnosis-like vocabulary in any LLM
   narrative is redacted and logged; prescription-like phrasing is hard-blocked.

## MCP servers: built vs borrowed, and why

| Server | Status | Tools | Why |
|---|---|---|---|
| `mstari` (`mstari/mcp_server.py`) | **built by us** | `parse_intake_record` (read), `score_priority` (acts: writes draft cards), `confirm_priority` (acts, **gated**), `rank_queue` (acts: writes board), `raise_recheck_flag` (acts, **gated**), `list_discriminators` (read) | The triage domain needs our own deterministic scale + gate semantics; no existing server can know our SATS implementation or enforce our gate. |
| `fetch` (`python -m mcp_server_fetch`) | **borrowed** (official reference server) | `fetch` | One line: it pulls live SATS/Kenya-Triage-Scale reference pages and facility-directory updates at plan time, and writing our own web crawler would be fragile duplicated work for zero clinical value. Verified callable in evals (T15); declared in `mcp_config.json`. |

The graph talks to our server over real stdio MCP (`mcp_client.py`: a
background-loop MCP client so sync LangGraph nodes can call tools), so every
action is a genuine logged tool call — the same server any external MCP
client (e.g. Claude Desktop) could attach to.

## Data & conduct

- All intake cards are synthetic; no PHI exists in the repo. Default LLM lane
  is local; the frontier lane (ModelScope) is documented synthetic-only.
- Failure posture is conservative: incomplete vitals refuse to score;
  unknown codes are rejected; children ≤12 escalate to the paediatric chart
  and a clinician; the gate blocks by default.
- Known unfixed failure is documented and reproducible: heuristic extraction
  has no negation handling (EVALS.md task F1 — "denies chest pain" over-triages
  to ORANGE, the safe direction). Next attempt: negation-scope pass + second
  LLM adjudicator vote.
