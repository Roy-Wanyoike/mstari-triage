"""Intake card parsing and normalisation.

A patient intake card is the unit of work at the triage desk: one JSON file
per patient under data/synthetic/patients/. Fields follow the vitals the
track names: blood pressure, pulse, temperature, respiratory rate, oxygen
saturation (recorded for the nurse; SATS itself does not score SpO2), plus
mobility, AVPU, trauma and the free-text presenting complaint.

All bundled cards are SYNTHETIC - no patient data is used anywhere in this
repository (see data/synthetic/patients/README note and each card's
"synthetic": true marker).
"""
import json
from pathlib import Path

from .config import PATIENTS_DIR

REQUIRED = ("patient_ref", "age_years", "vitals", "complaint_text")


def load_intake(patient_ref: str) -> dict:
    """Load one intake card by patient reference (e.g. 'P-001')."""
    ref = (patient_ref or "").strip().lstrip("P-").lstrip("-")
    for suffix in (".json",):
        p = PATIENTS_DIR / f"P-{ref.zfill(3)}{suffix}"
        if p.exists():
            card = json.loads(p.read_text(encoding="utf-8"))
            card["_source_file"] = str(p)
            return card
        p = PATIENTS_DIR / f"{patient_ref}{suffix}"
        if p.exists():
            card = json.loads(p.read_text(encoding="utf-8"))
            card["_source_file"] = str(p)
            return card
    raise FileNotFoundError(
        f"no intake card for {patient_ref!r} under {PATIENTS_DIR} "
        f"(run 'python -m mstari.main synth' first)")


def normalise(card: dict) -> dict:
    """Validate + normalise an intake card; returns a clean card or raises."""
    missing = [k for k in REQUIRED if k not in card or card.get(k) in (None, "")]
    if missing:
        raise ValueError(f"intake card missing required fields: {missing}")
    v = dict(card.get("vitals") or {})
    # tolerate numeric strings from manual entry
    for k in ("resp_rate", "heart_rate", "sbp", "temp_c"):
        if isinstance(v.get(k), str):
            try:
                v[k] = float(v[k]) if "." in v[k] else int(v[k])
            except ValueError:
                v[k] = None
    # the chart's mobility row is recorded at card level; thread it into vitals
    if v.get("mobility") is None and card.get("mobility"):
        v["mobility"] = card["mobility"]
    clean = {**card, "vitals": v}
    clean.setdefault("discriminators_reported", [])
    clean.setdefault("wait_minutes_at_triage", 0)
    clean.setdefault("facility", "unspecified facility")
    clean.setdefault("synthetic", False)
    return clean
