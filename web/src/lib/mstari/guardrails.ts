// Diagnosis guardrails - port of mstari/guardrails.py.
// The track's non-negotiable rule: never diagnoses, never prescribes, never
// decides. (1) SCRUB redacts diagnosis-like vocabulary from any LLM narrative;
// (2) assertNoPrescription hard-blocks prescription-like phrasing.

export const DIAGNOSIS_LEXICON = [
  "malaria", "pneumonia", "sepsis", "septicaemia", "septicemia", "covid",
  "influenza", "cancer", "tumour", "tumor", "hiv", "aids", "tuberculosis",
  "diabetes", "diabetic ketoacidosis", "appendicitis", "meningitis",
  "asthma", "peptic ulcer", "stroke", "cardiac arrest", "myocardial",
  "migraine", "arthritis", "pneumothorax", "embolism", "leukaemia",
  "leukemia", "anaemia", "anemia", "dengue", "cholera", "typhoid",
];

const REDACTION = "[redacted: diagnosis-like term - Mstari does not diagnose]";

export function scrub(text: string): { clean: string; hits: string[] } {
  const hits: string[] = [];
  let clean = text || "";
  for (const term of DIAGNOSIS_LEXICON) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(clean)) {
      hits.push(term);
      clean = clean.replace(re, REDACTION);
    }
  }
  return { clean, hits };
}

export function assertNoPrescription(text: string): void {
  let low = (text || "").toLowerCase();
  low = low.replace(/\bnever\s+\w+/g, " ");
  low = low.replace(/\bdoes not\s+\w+/g, " ");
  const banned = ["prescribe", "prescription", "dosage:", "take two tablets", "administer", "dispense"];
  for (const b of banned) {
    if (low.includes(b)) {
      throw new Error(`guardrail violation: prescription-like phrase '${b}' detected`);
    }
  }
}

export const SCOPE_BANNER =
  "Mstari is a triage queue tool. It produces a cited priority level only. It never diagnoses, never prescribes, never decides who gets seen - a triage nurse or clinician confirms every priority level.";
