# SUBMISSION — text description (~300 words)

**What it does.** Mstari (Swahili: *the queue*) is an agentic triage desk for
busy public outpatient departments. At intake, a nurse records vitals and a
presenting complaint on an intake card. Mstari reads the card, maps the
complaint onto the South African Triage Scale (adult chart) discriminator list
— the scale behind Kenya's Kenya Triage Scale — computes the Triage Early
Warning Score with deterministic, cited code, and sequences the queue: RED
(immediate) → ORANGE (<10 min) → YELLOW (<60 min) → GREEN (<240 min), with
longer-waiting patients first within a colour. Every priority cites the exact
vitals and complaint entries behind it; an unsourced flag is refused by
design. If a waiting patient's re-check vitals worsen, the agent raises a
second-look flag citing both vital sets — it never changes the priority itself.

**Sub-theme.** Symptom-based priority scoring on an existing, cited triage
scale, with a deterioration-watch second-look capability.

**Facility and workflow.** The OPD triage desk of a Level 2–4 public facility
(e.g. a county referral hospital outpatient department), where one or two
nurses face the whole morning queue: registration → vitals card → Mstari
scores and sequences → the triage nurse confirms each priority → bay. The
agent is a queue instrument for the nurse, not a clinical decision-maker.

**Compliance, in one breath.** Our own MCP server exposes six tools (four act:
draft cards, publish priorities, write the board, raise re-check flags); the
two irreversible ones are gated — a named clinician must approve, block-by-
default, with every decision timestamped in a gate ledger and every tool call
logged with inputs, outputs and timestamps. The official `mcp-server-fetch`
(the one server we did not write) pulls the live scale references. LangGraph
orchestrates; a local open-weights Qwen model does the one full task of
reading complaints into discriminator codes, so patient data never leaves the
machine. It never diagnoses, never prescribes, never decides — the guardrails
scrub diagnosis-like language, children are escalated rather than scored by
the adult chart, and fifteen evaluation tasks pass while one known failure
(negation handling) is documented with our next fix.
