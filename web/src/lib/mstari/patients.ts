// AUTO-GENERATED from data/synthetic/patients/ (mstari-triage repo).
// All cards are fabricated ("synthetic": true) - no PHI exists anywhere.
import type { IntakeCard, RecheckCard } from "./types";

export interface BundledPatient { card: IntakeCard; recheck: RecheckCard | null }

export const BUNDLED_PATIENTS: BundledPatient[] = [
  {
    card: {"patient_ref": "P-001", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T08:20:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 34, "sex": "F", "mobility": "walking", "vitals": {"resp_rate": 18, "heart_rate": 78, "sbp": 118, "temp_c": 36.8, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Cough and fever for three days. Walked in unaided. Says the body pain is moderate.", "discriminators_reported": ["pain_moderate"], "wait_minutes_at_triage": 40, "_scenario_note": "routine febrile presentation; exercise YELLOW discriminator"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-002", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T08:56:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 47, "sex": "M", "mobility": "stretcher_or_immobile", "vitals": {"resp_rate": 28, "heart_rate": 112, "sbp": 86, "temp_c": 38.9, "avpu": "reacts_voice", "trauma": false, "spo2_percent": null}, "complaint_text": "Brought in on a stretcher. Acute shortness of breath that started this morning, getting worse.", "discriminators_reported": ["sob_acute"], "wait_minutes_at_triage": 5, "_scenario_note": "TEWS 7 + RED discriminator -> immediate"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-003", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T09:57:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 61, "sex": "M", "mobility": "walking", "vitals": {"resp_rate": 16, "heart_rate": 105, "sbp": 145, "temp_c": 36.2, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Central chest pain, severe, started an hour ago while shopping and is not easing.", "discriminators_reported": ["chest_pain", "pain_severe"], "wait_minutes_at_triage": 25, "_scenario_note": "mirrors the worked 'Mrs Mpendu' case on the source chart: TEWS low, ORANGE via discriminators"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-004", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T11:50:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 8, "sex": "F", "mobility": "walking", "vitals": {"resp_rate": 24, "heart_rate": 120, "sbp": 98, "temp_c": 38.5, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Fever and cough. Child brought by mother, walking.", "discriminators_reported": [], "wait_minutes_at_triage": 15, "_scenario_note": "age 8: OUTSIDE the adult chart (>12y); must escalate to clinician, never score"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-005", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T11:48:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 28, "sex": "F", "mobility": "with_help", "vitals": {"resp_rate": 20, "heart_rate": 92, "sbp": 104, "temp_c": 37.1, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "28 weeks pregnant, abdominal pain since yesterday after a fall at home.", "discriminators_reported": ["pregnancy_trauma_or_pain"], "wait_minutes_at_triage": 30, "_scenario_note": "pregnancy + trauma discriminator, ORANGE"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-006", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T11:15:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 40, "sex": "M", "mobility": "walking", "vitals": {"resp_rate": 17, "heart_rate": 74, "sbp": 124, "temp_c": 36.6, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Headache since morning, mild. Denies chest pain. Denies fever.", "discriminators_reported": ["pain_mild"], "wait_minutes_at_triage": 12, "_scenario_note": "KNOWN-FAILING extraction case (negation): see EVALS.md task F1"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-007", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T08:39:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 55, "sex": "M", "mobility": "walking", "vitals": {"resp_rate": 18, "heart_rate": 80, "sbp": 136, "temp_c": 36.7, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Small cut on the hand while chopping wood. Bleeding stopped with a clean cloth. Mild pain.", "discriminators_reported": ["pain_mild"], "wait_minutes_at_triage": 20, "_scenario_note": "benign wound; GREEN expected"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-008", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T08:07:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 30, "sex": "M", "mobility": "walking", "vitals": {"resp_rate": 20, "heart_rate": 96, "sbp": 118, "temp_c": 36.9, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Deep cut on the leg from a panga. Bleeding heavily and will not stop despite pressure.", "discriminators_reported": ["haemorrhage_uncontrolled"], "wait_minutes_at_triage": 8, "_scenario_note": "RED discriminator: uncontrolled haemorrhage"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-009", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T10:52:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 70, "sex": "F", "mobility": "with_help", "vitals": {"resp_rate": 19, "heart_rate": 88, "sbp": 156, "temp_c": 36.5, "avpu": "confused", "trauma": false, "spo2_percent": null}, "complaint_text": "Brought by daughter. Confused since yesterday, not her usual self.", "discriminators_reported": [], "wait_minutes_at_triage": 35, "_scenario_note": "confusion + mobility: TEWS 3 -> YELLOW"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-010", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T08:28:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 22, "sex": "M", "mobility": "walking", "vitals": {"resp_rate": 18, "heart_rate": 92, "sbp": 122, "temp_c": 36.8, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Took an unknown number of pills after a disagreement this evening. Friend brought him.", "discriminators_reported": ["poisoning_overdose"], "wait_minutes_at_triage": 10, "_scenario_note": "RED discriminator: poisoning/overdose"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-011", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T08:52:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 39, "sex": "F", "mobility": "walking", "vitals": {"resp_rate": 24, "heart_rate": 110, "sbp": 118, "temp_c": 39.5, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Fever, feels hot, shivering since two days ago. Walking and talking normally.", "discriminators_reported": [], "wait_minutes_at_triage": 18, "_scenario_note": "deranged vitals only: temp 2 + RR 1 + HR 1 -> TEWS 4 YELLOW"} as IntakeCard,
    recheck: null,
  },
  {
    card: {"patient_ref": "P-012", "synthetic": true, "facility": "Kitui County Referral Hospital - OPD triage desk (demo)", "arrived_at": "2026-10-15T11:43:00+03:00", "recorded_by": "Enrolled Nurse Auxiliary (synthetic demo roster)", "age_years": 50, "sex": "M", "mobility": "walking", "vitals": {"resp_rate": 18, "heart_rate": 80, "sbp": 120, "temp_c": 36.7, "avpu": "alert", "trauma": false, "spo2_percent": null}, "complaint_text": "Back pain for a week, moderate. Here for review.", "discriminators_reported": ["pain_moderate"], "wait_minutes_at_triage": 45, "_scenario_note": "deterioration-watch case: recheck vitals supplied separately (P-012-recheck)"} as IntakeCard,
    recheck: {"patient_ref": "P-012", "synthetic": true, "observed_change": "Re-check by nurse while waiting in queue.", "vitals_after": {"resp_rate": 26, "heart_rate": 108, "sbp": 100, "temp_c": 38.2, "avpu": "alert", "mobility": "walking", "trauma": false}, "wait_minutes_since_triage": 55} as RecheckCard,
  },
];
