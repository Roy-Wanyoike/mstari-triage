"""Synthetic intake card generator.

Generates the bundled synthetic patient cards used by the demo and the
evaluation suite. Every card carries "synthetic": true. No real patient data
exists anywhere in this repository; names are invented and vitals are
constructed to exercise each band of the SATS adult chart (see EVALS.md).
"""
import json
import random

from .config import PATIENTS_DIR

# (ref, age, sex, mobility, rr, hr, sbp, temp, avpu, trauma, complaint,
#  reported_discriminators, wait_min, note)
PATIENTS = [
    ("P-001", 34, "F", "walking", 18, 78, 118, 36.8, "alert", False,
     "Cough and fever for three days. Walked in unaided. Says the body pain is moderate.",
     ["pain_moderate"], 40, "routine febrile presentation; exercise YELLOW discriminator"),
    ("P-002", 47, "M", "stretcher_or_immobile", 28, 112, 86, 38.9, "reacts_voice", False,
     "Brought in on a stretcher. Acute shortness of breath that started this morning, getting worse.",
     ["sob_acute"], 5, "TEWS 7 + RED discriminator -> immediate"),
    ("P-003", 61, "M", "walking", 16, 105, 145, 36.2, "alert", False,
     "Central chest pain, severe, started an hour ago while shopping and is not easing.",
     ["chest_pain", "pain_severe"], 25,
     "mirrors the worked 'Mrs Mpendu' case on the source chart: TEWS low, ORANGE via discriminators"),
    ("P-004", 8, "F", "walking", 24, 120, 98, 38.5, "alert", False,
     "Fever and cough. Child brought by mother, walking.",
     [], 15, "age 8: OUTSIDE the adult chart (>12y); must escalate to clinician, never score"),
    ("P-005", 28, "F", "with_help", 20, 92, 104, 37.1, "alert", False,
     "28 weeks pregnant, abdominal pain since yesterday after a fall at home.",
     ["pregnancy_trauma_or_pain"], 30, "pregnancy + trauma discriminator, ORANGE"),
    ("P-006", 40, "M", "walking", 17, 74, 124, 36.6, "alert", False,
     "Headache since morning, mild. Denies chest pain. Denies fever.",
     ["pain_mild"], 12, "KNOWN-FAILING extraction case (negation): see EVALS.md task F1"),
    ("P-007", 55, "M", "walking", 18, 80, 136, 36.7, "alert", False,
     "Small cut on the hand while chopping wood. Bleeding stopped with a clean cloth. Mild pain.",
     ["pain_mild"], 20, "benign wound; GREEN expected"),
    ("P-008", 30, "M", "walking", 20, 96, 118, 36.9, "alert", False,
     "Deep cut on the leg from a panga. Bleeding heavily and will not stop despite pressure.",
     ["haemorrhage_uncontrolled"], 8, "RED discriminator: uncontrolled haemorrhage"),
    ("P-009", 70, "F", "with_help", 19, 88, 156, 36.5, "confused", False,
     "Brought by daughter. Confused since yesterday, not her usual self.",
     [], 35, "confusion + mobility: TEWS 3 -> YELLOW"),
    ("P-010", 22, "M", "walking", 18, 92, 122, 36.8, "alert", False,
     "Took an unknown number of pills after a disagreement this evening. Friend brought him.",
     ["poisoning_overdose"], 10, "RED discriminator: poisoning/overdose"),
    ("P-011", 39, "F", "walking", 24, 110, 118, 39.5, "alert", False,
     "Fever, feels hot, shivering since two days ago. Walking and talking normally.",
     [], 18, "deranged vitals only: temp 2 + RR 1 + HR 1 -> TEWS 4 YELLOW"),
    ("P-012", 50, "M", "walking", 18, 80, 120, 36.7, "alert", False,
     "Back pain for a week, moderate. Here for review.",
     ["pain_moderate"], 45,
     "deterioration-watch case: recheck vitals supplied separately (P-012-recheck)"),
]

RECHECK = {
    "patient_ref": "P-012",
    "synthetic": True,
    "observed_change": "Re-check by nurse while waiting in queue.",
    "vitals_after": {"resp_rate": 26, "heart_rate": 108, "sbp": 100,
                     "temp_c": 38.2, "avpu": "alert", "mobility": "walking",
                     "trauma": False},
    "wait_minutes_since_triage": 55,
}


def generate(force: bool = False) -> list[str]:
    PATIENTS_DIR.mkdir(parents=True, exist_ok=True)
    written = []
    rng = random.Random(2026)  # deterministic jitter for arrival times
    for (ref, age, sex, mob, rr, hr, sbp, temp, avpu, trauma,
         complaint, discs, wait, note) in PATIENTS:
        path = PATIENTS_DIR / f"{ref}.json"
        if path.exists() and not force:
            written.append(str(path))
            continue
        hh = 8 + rng.randint(0, 3)
        mm = rng.randint(0, 59)
        card = {
            "patient_ref": ref,
            "synthetic": True,
            "facility": "Kitui County Referral Hospital - OPD triage desk (demo)",
            "arrived_at": f"2026-10-15T{hh:02d}:{mm:02d}:00+03:00",
            "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)",
            "age_years": age,
            "sex": sex,
            "mobility": mob,
            "vitals": {
                "resp_rate": rr, "heart_rate": hr, "sbp": sbp,
                "temp_c": temp, "avpu": avpu, "trauma": trauma,
                "spo2_percent": None,  # recorded by nurse; SATS does not score it
            },
            "complaint_text": complaint,
            "discriminators_reported": discs,
            "wait_minutes_at_triage": wait,
            "_scenario_note": note,
        }
        path.write_text(json.dumps(card, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
        written.append(str(path))
    (PATIENTS_DIR / "P-012-recheck.json").write_text(
        json.dumps(RECHECK, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    written.append(str(PATIENTS_DIR / "P-012-recheck.json"))
    return written


if __name__ == "__main__":
    for p in generate(force=True):
        print("wrote", p)
