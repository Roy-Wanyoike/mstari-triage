# EVALS.md — Mstari evaluation suite

Run them yourself in one command (no network, no LLM required — the suite
exercises the deterministic core + MCP layer + gate):

```bash
python -m mstari.main evals      # 15 tasks + 1 known unfixed failure
python -m pytest tests/ -q       # 11 unit tests on the scoring core
```

**Latest result: 15/15 tasks pass; F1 fails — on purpose, documented below.**
Raw machine-readable results from the submission run:
`runs/sample_eval_results.json` (every eval run also writes
`runs/evals-<timestamp>/eval_results.json` plus the full tool-call audit log).

## What the suite covers

Fifteen programmatic tasks across: tool availability, intake parsing, graceful
degradation, the deterministic SATS scoring (including the source chart's own
worked case), the clinician gate (block + approve + ledger), queue-board
ordering semantics, the deterioration re-check flag, the diagnosis/prescription
guardrails, and the borrowed MCP server. Plus one known unfixed failure (F1).

## Task results

| # | Task | Expected | Result |
|---|------|----------|--------|
| T01 | own MCP server lists ≥6 tools | 6 tools incl. 2 gated | **PASS** |
| T02 | parse synthetic intake card P-001 | structured vitals + complaint | **PASS** |
| T03 | unknown patient reference | NOT_FOUND with hint, no exception | **PASS** |
| T04 | P-001 (routine febrile, moderate pain) | DRAFT YELLOW, TEWS 0, ≥5 vital citations | **PASS** |
| T05 | P-002 (stretcher, RR 28, HR 112, BP 86, 38.9 °C, V on AVPU) | RED, TEWS 9, target **immediate** | **PASS** |
| T06 | P-003 (low TEWS 1 but chest pain + severe pain) | ORANGE via discriminator override — the source chart's own worked case path | **PASS** |
| T07 | P-004 (age 8) | OUT_OF_SCOPE_ADULT_CHART, nothing written, escalated to clinician | **PASS** |
| T08 | confirm without a named clinician | BLOCKED, nothing published | **PASS** |
| T09 | confirm with named clinician | CONFIRMED + gate-ledger entry with name + timestamp | **PASS** |
| T10 | queue board ordering | RED (TEWS 9) → RED (wait 10) → RED (wait 8) → ORANGE (wait 30) → ORANGE (wait 25) → YELLOW (wait 45) → YELLOW (wait 40) | **PASS** |
| T11 | re-check flag without clinician | BLOCKED (gated, like every irreversible action) | **PASS** |
| T12 | re-check with clinician | FLAG_RAISED, cites both vital sets, delta +3 (TEWS 0→3), priority unchanged | **PASS** |
| T13 | diagnosis guardrail on LLM-style narrative | diagnosis terms redacted + logged | **PASS** |
| T14 | prescription-like phrasing | hard-blocked by guardrail | **PASS** |
| T15 | borrowed MCP server (official `mcp-server-fetch`, not our code) | callable, `fetch` tool listed | **PASS** |
| **F1** | **KNOWN UNFIXED: negation handling** | see below | **FAIL (by design)** |

## The failure we did not fix

**F1 — negation handling in complaint extraction.** Patient P-006's card says
*"Headache since morning, mild. **Denies chest pain.** Denies fever."* The
expected priority is GREEN (TEWS 0; only mild pain). Observed: ORANGE, because
the keyword fallback extractor matches the string "chest pain" without
understanding that it is denied. The agent then over-triages a well patient.

Two things make this failure honest and bounded:

1. **It fails in the safe direction.** Over-triage sends a well patient to a
   clinician; under-triage would hide a sick one. Still wrong — a queue
   multiplied by false ORANGEs is a slower queue for real emergencies, which
   is exactly the problem this track asks us to fix.
2. **The reported extraction source is labelled on every card**
   (`extraction_source: keyword_fallback`), so a nurse can see when the
   keyword path was used. With the open-weights LLM lane configured, the
   extractor is instructed to respect negation and P-006 extracts correctly
   (model-dependent, hence not claimed as a pass here).

**What we would try next:** (a) a negation-scope pass in the extractor
(assertion cues: "denies/no/not + symptom within N tokens"), applied before
keyword matching; (b) a second LLM adjudicator vote restricted to
discriminator presence/absence, with disagreement escalated to the nurse as a
low-confidence card; (c) an eval threshold that treats over-triage and
under-triage asymmetrically (under-triage is an automatic block, over-triage
surfaces as a confidence warning).

## Design notes

- Evals run **against the real MCP boundary** (separate server process over
  stdio), not against imported functions — so a pass means the wire protocol,
  the audit logging, and the gate all worked.
- All fixtures are the bundled synthetic intake cards; every card carries
  `"synthetic": true`. No PHI anywhere.
- The scoring core is additionally covered by 11 pytest unit tests
  (`tests/test_scale.py`): TEWS band boundaries, the P-002 hard case,
  incomplete-vitals refusal, guardrails, ranking order, and the
  mobility-threading normalisation.
