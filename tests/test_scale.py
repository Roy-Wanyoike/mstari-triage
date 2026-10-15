"""Unit tests for the deterministic triage core (no MCP, no network)."""
import pytest

from mstari.scale import (score_tews, band_for_tews, temp_points,
                          extract_discriminators_heuristic)
from mstari.guardrails import scrub, assert_no_prescription
from mstari.intake import normalise, load_intake
from mstari.queue import rank_cards
from mstari.synth import generate, PATIENTS


def base_vitals(**overrides):
    v = {"resp_rate": 16, "heart_rate": 72, "sbp": 120, "temp_c": 36.7,
         "avpu": "alert", "mobility": "walking", "trauma": False}
    v.update(overrides)
    return v


def test_tews_all_normal_is_zero():
    s = score_tews(base_vitals(), 34)
    assert s["status"] == "OK"
    assert s["tews"] == 0
    assert s["tews_colour"] == "GREEN"


def test_tews_each_deranged_vital_counts():
    assert score_tews(base_vitals(resp_rate=26), 30)["tews"] == 1       # RR 21-29 -> 1
    assert score_tews(base_vitals(resp_rate=31), 30)["tews"] == 2       # RR >29 -> 2
    assert score_tews(base_vitals(resp_rate=7), 30)["tews"] == 3        # RR <9 -> 3
    assert score_tews(base_vitals(heart_rate=112), 30)["tews"] == 2     # HR 111-129 -> 2
    assert score_tews(base_vitals(heart_rate=105), 30)["tews"] == 1     # HR 101-110 -> 1
    assert score_tews(base_vitals(heart_rate=135), 30)["tews"] == 3     # HR >129 -> 3
    assert score_tews(base_vitals(sbp=86), 30)["tews"] == 1             # SBP 81-100 -> 1
    assert score_tews(base_vitals(sbp=76), 30)["tews"] == 2             # SBP 71-80 -> 2
    assert score_tews(base_vitals(sbp=65), 30)["tews"] == 3             # SBP <71 -> 3
    assert score_tews(base_vitals(trauma=True), 30)["tews"] == 1        # trauma -> 1


def test_tews_temp_and_avpu():
    assert temp_points(34.0) == 3
    assert temp_points(36.5) == 0
    assert temp_points(38.5) == 2
    assert score_tews(base_vitals(avpu="reacts_voice"), 30)["tews"] == 1
    assert score_tews(base_vitals(avpu="reacts_pain"), 30)["tews"] == 2
    assert score_tews(base_vitals(avpu="unresponsive"), 30)["tews"] == 3
    assert score_tews(base_vitals(avpu="confused"), 30)["tews"] == 2


def test_tews_known_hard_case_p002():
    """P-002: stretcher + RR 28 + HR 112 + SBP 86 + 38.9C + reacts to voice = 9."""
    s = score_tews(base_vitals(resp_rate=28, heart_rate=112, sbp=86, temp_c=38.9,
                               avpu="reacts_voice", mobility="stretcher_or_immobile"), 47)
    assert s["tews"] == 9
    assert s["tews_colour"] == "RED"
    assert s["target_time"] == "immediate"
    # every component carries its source field (citation requirement)
    assert all(c["source_field"] for c in s["components"])
    assert len(s["components"]) == 7


def test_incomplete_vitals_refuse_to_score():
    s = score_tews(base_vitals(sbp=None), 30)
    assert s["status"] == "INCOMPLETE"
    assert "sbp" in s["missing_fields"]


def test_band_boundaries_match_chart():
    assert band_for_tews(0)[0] == "GREEN"
    assert band_for_tews(2)[0] == "GREEN"
    assert band_for_tews(3)[0] == "YELLOW"
    assert band_for_tews(4)[0] == "YELLOW"
    assert band_for_tews(5)[0] == "ORANGE"
    assert band_for_tews(6)[0] == "ORANGE"
    assert band_for_tews(7)[0] == "RED"


def test_heuristic_extractor_matches_and_misses_negation():
    codes = extract_discriminators_heuristic("Severe chest pain since morning")
    assert "chest_pain" in codes
    codes3 = extract_discriminators_heuristic("The pain is severe and unbearable")
    assert "pain_severe" in codes3
    # documented known limitation: no negation handling
    codes2 = extract_discriminators_heuristic("Denies chest pain, mild headache")
    assert "chest_pain" in codes2  # over-match; see EVALS.md task F1


def test_guardrail_scrub_and_prescription_block():
    clean, hits = scrub("impression: malaria then pneumonia", "test")
    assert hits == ["malaria", "pneumonia"]
    assert "malaria" not in clean
    assert_no_prescription("the team must never prescribe anything")  # negated -> allowed
    with pytest.raises(ValueError):
        assert_no_prescription("prescription: amoxicillin 500mg tds")


def test_queue_ranking_order():
    generate()  # ensure cards exist
    cards = [
        {"patient_ref": "P-003", "colour": "ORANGE", "tews": 1, "wait_minutes_at_triage": 25},
        {"patient_ref": "P-002", "colour": "RED", "tews": 9, "wait_minutes_at_triage": 5},
        {"patient_ref": "P-010", "colour": "RED", "tews": 0, "wait_minutes_at_triage": 10},
        {"patient_ref": "P-008", "colour": "RED", "tews": 0, "wait_minutes_at_triage": 8},
        {"patient_ref": "P-005", "colour": "ORANGE", "tews": 1, "wait_minutes_at_triage": 30},
        {"patient_ref": "P-001", "colour": "YELLOW", "tews": 0, "wait_minutes_at_triage": 40},
    ]
    order = [c["patient_ref"] for c in rank_cards(cards)]
    assert order == ["P-002", "P-010", "P-008", "P-005", "P-003", "P-001"]


def test_intake_normalise_threads_mobility_and_flags_synthetic():
    card = normalise(load_intake("P-001"))
    assert card["vitals"]["mobility"] == "walking"
    assert card["synthetic"] is True
    assert card["patient_ref"] == "P-001"


def test_every_bundled_patient_scores_or_escalates():
    generate(force=True)
    scored = 0
    for (ref, *_rest) in PATIENTS:
        from mstari.intake import load_intake as li
        card = normalise(li(ref))
        if card["age_years"] <= 12:
            continue
        s = score_tews(card["vitals"], card["age_years"])
        assert s["status"] == "OK", ref
        assert 0 <= s["tews"] <= 15
        scored += 1
    assert scored == 11  # 12 patients, P-004 is paediatric
