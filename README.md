# Mstari — the Triage Desk

**Mstari** (Swahili: *the queue*) is an agentic triage desk for busy public
outpatient departments. It reads each patient's intake card, turns vitals +
the presenting complaint into a **cited South African Triage Scale (adult
chart)** priority, and sequences the queue for the triage nurse — with every
priority carrying the exact vitals behind it.

**It scores and sequences the queue. It never diagnoses, never prescribes,
never decides who gets seen.** A named clinician confirms every priority
before it reaches the queue — that gate is enforced in code, not in prose.

Built for the **Healthcare: The Triage Desk** track of the *Agentic AI for
Africa Innovation Challenge*. Sub-theme: **symptom-based priority scoring**
(grounded in the SATS adult chart, the scale behind Kenya's Kenya Triage
Scale), with a **deterioration-watch** second-look flag. Serves the OPD triage
desk of a Level 2–4 public facility; workflow: registration → vitals card →
Mstari scores & sequences → nurse confirms → bay.

> This repository is **new work built during the submission period**. It is a
> ground-up rebuild of the author's earlier "Health-advisor" prototype, which
> was retired because it violated the track's non-negotiable rule (it produced
> diagnosis-style advice). Mstari keeps the original idea — intake in, help
> out — and rebuilds it inside the track's guardrails.

## Run it — one command

```bash
./run_demo.sh
```

That single command creates a virtualenv, installs dependencies, generates the
bundled **synthetic** intake cards, runs the evaluation suite, and runs the
full agent over a 12-patient OPD queue — stopping at the clinician gate, then
completing the publish with the named clinician you pass in:

```bash
./run_demo.sh "Sr. A. Wanjiru (Triage Nurse)"
```

Artifacts land in `runs/<run_id>/`: `queue_board.md` (the cited queue), plus
`audit_log.jsonl` (every tool call: inputs, outputs, timestamps) and
`gate_ledger.json` (every gate decision, block or approve).

**LLM modes (honest by design).** With [Ollama](https://ollama.com) running,
`run_demo.sh` auto-selects the **open-weights lane** (`qwen2.5:7b` by default —
override with `MSTARI_LLM_MODEL`). The open-weights model performs the full
task of reading each free-text complaint and mapping it to SATS discriminator
codes; the score itself is always deterministic cited code (`mstari/scale.py`).
No endpoint configured → deterministic heuristic mode, clearly labelled in the
summary. Either way the repo runs end-to-end.

## What the agent actually does

| Step | Tool (MCP) | Kind |
|---|---|---|
| Load synthetic intake card | `parse_intake_record` | read |
| Complaint → SATS discriminator codes (open-weights model; keyword fallback) | *agent node* (LLM task) | — |
| Compute cited TEWS priority → **DRAFT** card | `score_priority` | acting |
| Publish priority to the live queue | `confirm_priority` | acting, **GATED** — named clinician required |
| Write the cited queue board | `rank_queue` | acting |
| Deterioration second-look flag (re-checked vitals vs confirmed card) | `raise_recheck_flag` | acting, **GATED** — named clinician required |

The score is never the model's opinion: `mstari/scale.py` is a deterministic
implementation of the published SATS adult chart, and every component carries
a `source_field` citation. Children ≤12 years are escalated to a clinician,
never scored by the adult chart. Unsourced or incomplete inputs refuse to
score ("refuse to guess").

## Track compliance map

| Requirement | Where |
|---|---|
| Own MCP server, 3+ tools, ≥1 acting | `mstari/mcp_server.py` — 6 tools, 4 acting, 2 gated |
| One MCP server we did not write + why | official `mcp-server-fetch`, wired in `mcp_config.json` (one-line justification inline; verified callable in evals T15) |
| OSS orchestration | LangGraph (`mstari/graph.py`): plan → intake → extract → score → gate → publish → rank → summarize |
| One full task on open-weights model | complaint → discriminator extraction on Ollama Qwen (`mstari/llm.py`); patient data never leaves the machine |
| Logged tool call for every action | `runs/<run_id>/audit_log.jsonl` — inputs, outputs, timestamps |
| Gate on every irreversible action | `mstari/gates.py` + `confirm_priority` / `raise_recheck_flag` — named clinician, timestamped, blocked-by-default |
| Never diagnose / prescribe / decide | `mstari/guardrails.py` (lexicon scrub + hard block), deterministic score, clinician gate, citations everywhere |
| Grounded in an existing scale | SATS adult chart; sources + interpretation notes in `data/ATTRIBUTION.md` |
| OSI licence | MIT (`LICENSE`) |
| 8+ eval tasks incl. one unfixed failure | `EVALS.md`, `python -m mstari.main evals` — 15 pass, F1 intentionally unfixed |
| Architecture doc | `ARCHITECTURE.md` |
| Demo video (unedited, tool calls on screen) | shot list in `VIDEO_SCRIPT.md` |

## Repository layout

```
mstari/            the agent: mcp_server, mcp_client, graph (LangGraph),
                   scale (SATS TEWS), llm, guardrails, gates, queue, evals
data/synthetic/    fabricated intake cards (no real patient data, ever)
data/references/   verbatim SATS chart source extract + ATTRIBUTION.md
runs/              per-run artifacts: queue boards, audit log, gate ledger
tests/             deterministic unit tests for the scoring core
run_demo.sh        the one command
```

## Notes on safety & data

- **All patient data in this repo is synthetic** (`"synthetic": true` on every
  card). No PHI exists, is stored, or is transmitted. Default LLM lane is
  local (Ollama); the optional frontier lane is documented as synthetic-only.
- The agent's failure posture is conservative: missing vitals → refuse to
  score; unknown discriminator codes → reject; child → escalate; gate → block
  by default.
- Known limitations are documented, not hidden: see `EVALS.md` (negation
  handling, F1) and `data/ATTRIBUTION.md` (two interpreted chart cells).

## Licence

MIT — see `LICENSE`.
