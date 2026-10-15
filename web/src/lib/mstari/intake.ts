// Intake card normalisation - port of mstari/intake.py normalise().
// Tolerates numeric strings, threads card-level mobility into vitals
// (the chart's mobility row is recorded at card level).

import type { IntakeCard } from "./types";

const REQUIRED = ["patient_ref", "age_years", "vitals", "complaint_text"] as const;

export function normaliseCard(card: IntakeCard): IntakeCard {
  const missing = REQUIRED.filter((k) => {
    const val = (card as Record<string, unknown>)[k];
    return val === null || val === undefined || val === "";
  });
  if (missing.length) {
    throw new Error(`intake card missing required fields: ${missing.join(", ")}`);
  }
  const v: Record<string, unknown> = { ...(card.vitals as Record<string, unknown>) };
  for (const k of ["resp_rate", "heart_rate", "sbp", "temp_c"]) {
    const val = v[k];
    if (typeof val === "string") {
      const n = val.includes(".") ? parseFloat(val) : parseInt(val, 10);
      v[k] = Number.isNaN(n) ? null : n;
    }
  }
  if (v.mobility == null && card.mobility) {
    v.mobility = card.mobility;
  }
  return {
    ...card,
    vitals: v as IntakeCard["vitals"],
    discriminators_reported: card.discriminators_reported ?? [],
    wait_minutes_at_triage: card.wait_minutes_at_triage ?? 0,
    facility: card.facility ?? "unspecified facility",
    synthetic: card.synthetic ?? false,
  };
}
