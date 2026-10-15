"""The Triage Early Warning Score (TEWS) - South African Triage Scale, adult chart.

Grounded in an existing scale (track rule: do not invent your own):

  Source of record (bundled verbatim in data/references/):
    - "The South African Triage Scale: a tool for emergency nurses",
      Prof Nurs Today 2011;15(6), Adult Triage Score chart
      (reproduced with permission; also EMSSA SATS Manual).
    - Kenya rolled the SATS out nationally as the Kenya Triage Scale, which is
      why this scale fits a Kenyan OPD triage desk.

  Bands (from the chart): TEWS >= 7 RED (immediate), 5-6 ORANGE (<10 min),
  3-4 YELLOW (<60 min), 0-2 GREEN (<240 min).

  The agent NEVER invents a priority: this module is deterministic, cited
  code. Every scored component carries the source field it came from, so
  every priority level cites the vitals behind it (track requirement).
"""
from datetime import datetime, timezone

# ----------------------------------------------------------------- TEWS table
# Band -> points, exactly as printed on the adult chart (see data/references/).

MOBILITY_POINTS = {"walking": 0, "with_help": 1, "stretcher_or_immobile": 2}

RR_POINTS = [  # (band_low_inclusive, band_high_inclusive, points)
    (0, 8, 3),      # < 9
    (9, 14, 1),
    (15, 20, 0),
    (21, 29, 1),
    (30, 999, 2),   # > 29
]

HR_POINTS = [
    (0, 40, 3),     # < 41
    (41, 50, 2),    # 41-51 on chart (boundary shared; 51 resolved to normal band)
    (51, 100, 0),
    (101, 110, 1),
    (111, 129, 2),
    (130, 999, 3),  # > 129
]

SBP_POINTS = [
    (0, 70, 3),     # < 71
    (71, 80, 2),
    (81, 100, 1),
    (101, 199, 0),
    (200, 9999, 2),  # > 199 (chart's last band; interpretation documented)
]

def temp_points(t: float) -> int:
    if t < 35.0:
        return 3        # "feels cold OR < 35"
    if t <= 38.4:
        return 0        # "feels normal OR 35-38.4"
    return 2            # "feels hot OR > 38.4"

AVPU_POINTS = {
    "alert": 0,
    "reacts_voice": 1,
    "reacts_pain": 2,
    "unresponsive": 3,
    "confused": 2,      # chart places 'Confused' left of Alert; interpretation documented
}

TRAUMA_POINTS = {False: 0, True: 1}

TEWS_BANDS = [  # (min_tews, max_tews, colour, target_time)
    (7, 99, "RED", "immediate"),
    (5, 6, "ORANGE", "< 10 minutes"),
    (3, 4, "YELLOW", "< 60 minutes"),
    (0, 2, "GREEN", "< 240 minutes"),
]

COLOUR_RANK = {"GREEN": 0, "YELLOW": 1, "ORANGE": 2, "RED": 3}

# --------------------------------------------------- discriminators (subset)
# From the chart's discriminator list. We implement the subset that is
# reliably extractable from an intake card; see data/ATTRIBUTION.md.
DISCRIMINATORS = {
    # RED discriminators
    "sob_acute":              ("RED", "Shortness of breath: acute"),
    "coughing_blood":         ("RED", "Coughing blood"),
    "haemorrhage_uncontrolled": ("RED", "Haemorrhage: uncontrolled"),
    "seizure_current":        ("RED", "Seizure: current"),
    "focal_neurology_acute":  ("RED", "Focal neurology: acute"),
    "loc_reduced":            ("RED", "Level of consciousness: reduced"),
    "threatened_limb":        ("RED", "Threatened limb"),
    "fracture_compound":      ("RED", "Fracture: compound"),
    "burn_face_inhalation":   ("RED", "Burn: face/inhalation"),
    "burn_major_20":          ("RED", "Burn > 20%"),
    "burn_electrical":        ("RED", "Burn: electrical"),
    "poisoning_overdose":     ("RED", "Poisoning/overdose"),
    "vomiting_fresh_blood":   ("RED", "Vomiting: fresh blood"),
    "hypoglycaemia":          ("RED", "Hypoglycaemia: glucose < 3 mmol/l"),
    "pregnancy_pv_bleed":     ("RED", "Pregnancy and PV bleed"),
    "high_energy_transfer":   ("RED", "Mechanism of injury: high-energy transfer"),
    # ORANGE discriminators
    "chest_pain":             ("ORANGE", "Chest pains"),
    "haemorrhage_controlled": ("ORANGE", "Haemorrhage: controlled"),
    "seizure_postictal":      ("ORANGE", "Seizure: postictal"),
    "psychosis_aggression":   ("ORANGE", "Psychosis/aggression"),
    "abdominal_pain":         ("ORANGE", "Abdominal pain"),
    "pregnancy_trauma_or_pain": ("ORANGE", "Pregnancy and abdominal trauma or pain"),
    "burn_circumferential":   ("ORANGE", "Burn: circumferential"),
    "diabetic_ketonuria":     ("ORANGE", "Diabetic: glucose < 11 mmol/l and ketonuria"),
    "vomiting_persistent":    ("ORANGE", "Vomiting: persistent"),
    "pain_severe":            ("ORANGE", "Pain: severe"),
    # YELLOW discriminators
    "fracture_closed":        ("YELLOW", "Fracture: closed"),
    "dislocation_finger_toe": ("YELLOW", "Dislocation: finger or toe"),
    "burn_other":             ("YELLOW", "Burn: other"),
    "diabetic_hyperglycemia": ("YELLOW", "Diabetic: glucose > 17 mmol/l, no ketonuria"),
    "pain_moderate":          ("YELLOW", "Pain: moderate"),
    # GREEN discriminators
    "pain_mild":              ("GREEN", "Pain: mild"),
    "all_other":              ("GREEN", "All other patients"),
}

# keyword fallback used ONLY when no LLM/extraction supplied discriminator codes
KEYWORD_DISCRIMINATORS = [
    ("sob_acute", [r"short(ness)? of breath", r"can ?(not|'t) breathe",
                   r"difficulty breathing", r"struggling to breathe"]),
    ("coughing_blood", [r"coughing (up )?blood", r"blood in (the )?sputum"]),
    ("haemorrhage_uncontrolled", [r"bleeding (heavily|won'?t stop|will not stop|uncontrolled)",
                                  r"blood (is |keeps )?(pouring|spurting|flowing)"]),
    ("haemorrhage_controlled", [r"bleeding (has )?stopped", r"bleeding controlled",
                                r"bleeding (is )?under control"]),
    ("seizure_current", [r"having a seizure", r"currently seiz", r"convulsing now"]),
    ("seizure_postictal", [r"postictal", r"seizure (has )?stopped", r"recovered from seizure"]),
    ("loc_reduced", [r"unconscious", r"not responding", r"unresponsive"]),
    ("fracture_compound", [r"bone (is |sticking )?out", r"open fracture", r"compound fracture"]),
    ("burn_face_inhalation", [r"burn(ed|t)? (on |to )(the )?(face|neck)", r"inhal(ation|ed) burn",
                              r"burned? in a? ?(house |building )?fire.*smoke"]),
    ("poisoning_overdose", [r"overdose", r"took (an? )?(unknown )?(pills|tablets|poison)",
                            r"swallowed poison", r"ingested poison"]),
    ("vomiting_fresh_blood", [r"vomit(ing)? (fresh )?blood", r"vomiting blood"]),
    ("pregnancy_pv_bleed", [r"pregnan\w*.*bleeding", r"bleeding.*pregnan"]),
    ("pregnancy_trauma_or_pain", [r"pregnan\w*.*(pain|trauma|fell|accident)",
                                  r"(pain|trauma).*while pregnant"]),
    ("chest_pain", [r"chest pain", r"pain in (my |the )?chest", r"chest (is )?painful"]),
    ("abdominal_pain", [r"abdominal pain", r"stomach pain", r"belly pain", r"tummy pain"]),
    ("pain_severe", [r"severe pain", r"pain is severe", r"worst pain", r"unbearable pain",
                     r"pain (is )?10[/ ]?10"]),
    ("pain_moderate", [r"moderate pain", r"pain is moderate"]),
    ("pain_mild", [r"mild pain", r"pain is mild", r"slight pain"]),
]

import re as _re


def extract_discriminators_heuristic(complaint_text: str) -> list[str]:
    """Keyword fallback extractor (heuristic mode only). NOTE, documented as a
    known limitation: no negation handling - 'denies chest pain' still matches
    'chest pain'. See EVALS.md task F1."""
    text = (complaint_text or "").lower()
    codes: list[str] = []
    for code, patterns in KEYWORD_DISCRIMINATORS:
        if any(_re.search(p, text) for p in patterns):
            codes.append(code)
    return codes


# ------------------------------------------------------------------- scoring

def band_for_tews(tews: int) -> tuple[str, str]:
    for lo, hi, colour, target in TEWS_BANDS:
        if lo <= tews <= hi:
            return colour, target
    return "RED", "immediate"


def _band_points(table, value):
    for lo, hi, pts in table:
        if lo <= value <= hi:
            return pts, f"{lo}-{hi}" if lo < hi else str(lo)
    return None, None


def score_tews(vitals: dict, age_years: int | None) -> dict:
    """Deterministic TEWS computation. Returns components with per-component
    citations. Adults only (adult chart covers >12 years / >150 cm); callers
    must route younger patients to a clinician (see OUT_OF_SCOPE handling)."""
    v = vitals or {}
    missing = [k for k in ("resp_rate", "heart_rate", "sbp", "temp_c", "avpu", "mobility")
               if v.get(k) is None]
    if missing:
        return {"status": "INCOMPLETE",
                "missing_fields": missing,
                "note": ("Refuse to guess: incomplete vitals cannot produce a defensible "
                         "TEWS. Escalate to the triage nurse for re-measurement.")}

    components: list[dict] = []

    def add(param: str, value, points: int, band: str, source: str, scale_ref: str):
        components.append({
            "parameter": param, "value": value, "points": points,
            "band_on_chart": band, "source_field": source, "scale_reference": scale_ref,
        })

    rr = int(v["resp_rate"])
    pts, band = _band_points(RR_POINTS, rr)
    add("respiratory_rate", rr, pts, f"{band} breaths/min",
        f"vitals.resp_rate = {rr}", "SATS adult chart, RR row")

    hr = int(v["heart_rate"])
    pts, band = _band_points(HR_POINTS, hr)
    add("heart_rate", hr, pts, f"{band} beats/min",
        f"vitals.heart_rate = {hr}", "SATS adult chart, HR row")

    sbp = int(v["sbp"])
    pts, band = _band_points(SBP_POINTS, sbp)
    add("systolic_bp", sbp, pts, f"{band} mmHg",
        f"vitals.sbp = {sbp}", "SATS adult chart, SBP row")

    t = float(v["temp_c"])
    pts = temp_points(t)
    add("temperature", t, pts, "feels normal 35-38.4" if pts == 0 else
        ("feels cold < 35" if pts == 3 else "feels hot > 38.4"),
        f"vitals.temp_c = {t}", "SATS adult chart, Temp row")

    avpu = str(v["avpu"]).lower()
    if avpu not in AVPU_POINTS:
        return {"status": "INCOMPLETE", "missing_fields": [f"avpu:{avpu}"],
                "note": "Unknown AVPU value; nurse must re-assess consciousness."}
    add("avpu", avpu, AVPU_POINTS[avpu], avpu,
        f"vitals.avpu = {avpu}", "SATS adult chart, AVPU row")

    mob = str(v["mobility"]).lower()
    if mob not in MOBILITY_POINTS:
        return {"status": "INCOMPLETE", "missing_fields": [f"mobility:{mob}"],
                "note": "Unknown mobility value; nurse must re-assess."}
    add("mobility", mob, MOBILITY_POINTS[mob], mob,
        f"vitals.mobility = {mob}", "SATS adult chart, Mobility row")

    trauma = bool(v.get("trauma", False))
    add("trauma", trauma, TRAUMA_POINTS[trauma], "yes" if trauma else "no",
        f"vitals.trauma = {trauma}", "SATS adult chart, Trauma row")

    tews = sum(c["points"] for c in components)
    colour, target = band_for_tews(tews)
    return {"status": "OK", "tews": tews, "tews_colour": colour,
            "target_time": target, "components": components}
