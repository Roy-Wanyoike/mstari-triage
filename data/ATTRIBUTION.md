# Data attribution and provenance

## The triage scale (not ours - cited, and that is the point)

Mstari implements the **South African Triage Scale (SATS), adult chart** — the
scale on which Kenya's adopted Kenya Triage Scale is based. The track brief
requires grounding in "an existing triage scale ... Build on one; don't invent
your own from scratch." Every TEWS band and discriminator in
`mstari/scale.py` is traceable to the sources below.

Primary sources (bundled verbatim extract in `data/references/`):

1. **"The South African Triage Scale: a tool for emergency nurses"**, Prof Nurs
   Today 2011;15(6) — the Adult Triage Score chart (Figure 1), reproduced with
   permission. This is the chart whose text extraction is stored at
   `data/references/sats_adult_chart_source.md`, including the worked "Mrs
   Mpendu" case study used as evaluation task T06.
2. **EMSSA SATS Manual** (Emergency Medicine Society of South Africa),
   emssa.org.za — canonical manual for the same chart.
3. Kenya context: the **Kenya Triage Scale** rollout (Emergency Medicine Kenya
   Foundation / Ministry of Health) is a national adoption of SATS, which is
   why this chart fits a Kenyan OPD triage desk.

### TEWS bands implemented (adult chart)

| Parameter | 3 | 2 | 1 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|---|
| Mobility | | | | Walking | With help | Stretcher/immobile | |
| RR | <9 | | 9–14 | 15–20 | 21–29 | >29 | |
| HR | <41 | 41–51 | | 51–100 | 101–110 | 111–129 | >129 |
| SBP | <71 | 71–80 | 81–100 | 101–199 | | >199 | |
| Temp | <35 | | | 35–38.4 | | >38.4 | |
| AVPU | | | | Alert | Reacts to voice | Reacts to pain / confused* | Unresponsive |
| Trauma | | | | No | Yes | | |

\* The chart prints "Confused" on the abnormal side of Alert; Mstari scores it
2 points. This single-cell interpretation (and the SBP >199 cell) is documented
here rather than hidden — the band boundaries are verbatim from the chart.

Colour bands: TEWS ≥7 RED (immediate) · 5–6 ORANGE (<10 min) · 3–4 YELLOW
(<60 min) · 0–2 GREEN (<240 min). Any discriminator overrides the TEWS colour
upwards — exactly as the chart's worked case does (TEWS 2 → GREEN by vitals,
ORANGE via "chest pains" + "severe pain").

### Discriminator subset

`scale.py` implements a documented SUBSET of the chart's discriminator list —
the items reliably extractable from a written intake card (acute shortness of
breath, haemorrhage controlled/uncontrolled, seizures current/postictal, chest
pain, abdominal pain, pregnancy with trauma/pain/PV bleed, compound/closed
fracture, burns variants, poisoning/overdose, vomiting fresh blood/persistent,
focal neurology, reduced consciousness, threatened limb, hypoglycaemia, pain
severe/moderate/mild). Items needing equipment or examination at the desk
(e.g. glucose reading, burn %) remain clinician tasks by design.

## Patient data (all synthetic, no exceptions)

- `data/synthetic/patients/*.json` are **fabricated** intake cards. Every file
  carries `"synthetic": true`; names, times and vitals are invented to exercise
  each band of the chart and each edge case (paediatric out-of-scope, missing
  fields, deterioration re-check, negation failure).
- No real patient data (PHI) is used, stored, transmitted, or needed anywhere
  in this repository. The demo facility name is illustrative only.
- Patient health data cannot leave the country: the default LLM lane is a
  local Ollama endpoint on the operator's own machine. The optional frontier
  lane is documented as synthetic-data-only — and all Mstari data is synthetic
  anyway.
