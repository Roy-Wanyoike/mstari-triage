"""Diagnosis guardrails.

The track's non-negotiable rule: the agent never diagnoses, never prescribes,
never decides who gets seen. Two enforced mechanisms:

  1. SCRUB - any LLM-generated narrative (summaries, handover notes) is scanned
     for diagnosis-like vocabulary before it is returned or written. Matches
     are redacted in place and the redaction is logged to the audit trail.
  2. SCOPE - the scoring engine only ever emits a triage colour, a TEWS number,
     and citations to the vitals behind them. There is no code path from a
     priority level to a diagnosis, a medicine, or a disposition decision.
"""
import re

from .audit import log_guardrail

# Diagnosis-like vocabulary that must never appear in agent narratives.
# Deliberately excludes triage-scale discriminator words (e.g. "chest pain")
# which come from the cited scale itself, not from diagnosis.
DIAGNOSIS_LEXICON = [
    "malaria", "pneumonia", "sepsis", "septicaemia", "septicemia", "covid",
    "influenza", "cancer", "tumour", "tumor", "hiv", "aids", "tuberculosis",
    "diabetes", "diabetic ketoacidosis", "appendicitis", "meningitis",
    "asthma", "peptic ulcer", "stroke", "cardiac arrest", "myocardial",
    "migraine", "arthritis", "pneumothorax", "embolism", "leukaemia",
    "leukemia", "anaemia", "anemia", "dengue", "cholera", "typhoid",
]

_REDACTION = "[redacted: diagnosis-like term - Mstari does not diagnose]"


def scrub(text: str, run_id: str = "adhoc") -> tuple[str, list[str]]:
    """Redact diagnosis-like terms from narrative text. Returns (clean, hits)."""
    hits: list[str] = []
    clean = text or ""
    for term in DIAGNOSIS_LEXICON:
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        if pattern.search(clean):
            hits.append(term)
            clean = pattern.sub(_REDACTION, clean)
    if hits:
        log_guardrail(run_id, "diagnosis_redaction", {"terms": hits})
    return clean, hits


def assert_no_prescription(text: str) -> None:
    """Hard stop if narrative text contains prescription-like phrasing.

    Negated disclaimers ('never prescribes', 'does not administer') are the
    scope banner itself, so 'never <verb>' forms are excluded from the check
    before matching."""
    low = (text or "").lower()
    # strip negated disclaimer forms before scanning
    import re
    low = re.sub(r"\bnever\s+\w+", " ", low)
    low = re.sub(r"\bdoes not\s+\w+", " ", low)
    banned = ["prescribe", "prescription", "dosage:", "take two tablets",
              "administer", "dispense"]
    for b in banned:
        if b in low:
            raise ValueError(
                f"guardrail violation: prescription-like phrase '{b}' detected")


SCOPE_BANNER = (
    "Mstari is a triage queue tool. It produces a cited priority level only. "
    "It never diagnoses, never prescribes, never decides who gets seen - a "
    "triage nurse or clinician confirms every priority level."
)
