// The Triage Early Warning Score (TEWS) - SATS adult chart.
// Faithful TypeScript port of mstari/scale.py (deterministic, cited code).
// Source of record: "The South African Triage Scale: a tool for emergency
// nurses", Prof Nurs Today 2011;15(6), adult chart (bundled verbatim in the
// repo under data/references/). Bands: TEWS >=7 RED, 5-6 ORANGE, 3-4 YELLOW,
// 0-2 GREEN. The agent NEVER invents a priority.

export const MOBILITY_POINTS: Record<string, number> = {
  walking: 0,
  with_help: 1,
  stretcher_or_immobile: 2,
};

const RR_POINTS: [number, number, number][] = [
  [0, 8, 3],
  [9, 14, 1],
  [15, 20, 0],
  [21, 29, 1],
  [30, 999, 2],
];

const HR_POINTS: [number, number, number][] = [
  [0, 40, 3],
  [41, 50, 2],
  [51, 100, 0],
  [101, 110, 1],
  [111, 129, 2],
  [130, 999, 3],
];

const SBP_POINTS: [number, number, number][] = [
  [0, 70, 3],
  [71, 80, 2],
  [81, 100, 1],
  [101, 199, 0],
  [200, 9999, 2],
];

export function tempPoints(t: number): number {
  if (t < 35.0) return 3;
  if (t <= 38.4) return 0;
  return 2;
}

export const AVPU_POINTS: Record<string, number> = {
  alert: 0,
  reacts_voice: 1,
  reacts_pain: 2,
  unresponsive: 3,
  confused: 2, // interpretation documented in data/ATTRIBUTION.md
};

const traumaPoints = (t: boolean): number => (t ? 1 : 0);

export const TEWS_BANDS: [number, number, string, string][] = [
  [7, 99, "RED", "immediate"],
  [5, 6, "ORANGE", "< 10 minutes"],
  [3, 4, "YELLOW", "< 60 minutes"],
  [0, 2, "GREEN", "< 240 minutes"],
];

export const COLOUR_RANK: Record<string, number> = {
  GREEN: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3,
};

export const TARGET_BY_COLOUR: Record<string, string> = {
  RED: "immediate",
  ORANGE: "< 10 minutes",
  YELLOW: "< 60 minutes",
  GREEN: "< 240 minutes",
};

// SATS discriminator subset implemented by Mstari (see data/ATTRIBUTION.md).
export const DISCRIMINATORS: Record<string, [string, string]> = {
  sob_acute: ["RED", "Shortness of breath: acute"],
  coughing_blood: ["RED", "Coughing blood"],
  haemorrhage_uncontrolled: ["RED", "Haemorrhage: uncontrolled"],
  seizure_current: ["RED", "Seizure: current"],
  focal_neurology_acute: ["RED", "Focal neurology: acute"],
  loc_reduced: ["RED", "Level of consciousness: reduced"],
  threatened_limb: ["RED", "Threatened limb"],
  fracture_compound: ["RED", "Fracture: compound"],
  burn_face_inhalation: ["RED", "Burn: face/inhalation"],
  burn_major_20: ["RED", "Burn > 20%"],
  burn_electrical: ["RED", "Burn: electrical"],
  poisoning_overdose: ["RED", "Poisoning/overdose"],
  vomiting_fresh_blood: ["RED", "Vomiting: fresh blood"],
  hypoglycaemia: ["RED", "Hypoglycaemia: glucose < 3 mmol/l"],
  pregnancy_pv_bleed: ["RED", "Pregnancy and PV bleed"],
  high_energy_transfer: ["RED", "Mechanism of injury: high-energy transfer"],
  chest_pain: ["ORANGE", "Chest pains"],
  haemorrhage_controlled: ["ORANGE", "Haemorrhage: controlled"],
  seizure_postictal: ["ORANGE", "Seizure: postictal"],
  psychosis_aggression: ["ORANGE", "Psychosis/aggression"],
  abdominal_pain: ["ORANGE", "Abdominal pain"],
  pregnancy_trauma_or_pain: ["ORANGE", "Pregnancy and abdominal trauma or pain"],
  burn_circumferential: ["ORANGE", "Burn: circumferential"],
  diabetic_ketonuria: ["ORANGE", "Diabetic: glucose < 11 mmol/l and ketonuria"],
  vomiting_persistent: ["ORANGE", "Vomiting: persistent"],
  pain_severe: ["ORANGE", "Pain: severe"],
  fracture_closed: ["YELLOW", "Fracture: closed"],
  dislocation_finger_toe: ["YELLOW", "Dislocation: finger or toe"],
  burn_other: ["YELLOW", "Burn: other"],
  diabetic_hyperglycemia: ["YELLOW", "Diabetic: glucose > 17 mmol/l, no ketonuria"],
  pain_moderate: ["YELLOW", "Pain: moderate"],
  pain_mild: ["GREEN", "Pain: mild"],
  all_other: ["GREEN", "All other patients"],
};

// Keyword fallback extractor - heuristic mode only. Documented limitation:
// no negation handling ("denies chest pain" still matches; EVALS.md F1).
export const KEYWORD_DISCRIMINATORS: [string, string[]][] = [
  ["sob_acute", ["short(ness)? of breath", "can ?(not|'t) breathe", "difficulty breathing", "struggling to breathe"]],
  ["coughing_blood", ["coughing (up )?blood", "blood in (the )?sputum"]],
  ["haemorrhage_uncontrolled", ["bleeding (heavily|won'?t stop|will not stop|uncontrolled)", "blood (is |keeps )?(pouring|spurting|flowing)"]],
  ["haemorrhage_controlled", ["bleeding (has )?stopped", "bleeding controlled", "bleeding (is )?under control"]],
  ["seizure_current", ["having a seizure", "currently seiz", "convulsing now"]],
  ["seizure_postictal", ["postictal", "seizure (has )?stopped", "recovered from seizure"]],
  ["loc_reduced", ["unconscious", "not responding", "unresponsive"]],
  ["fracture_compound", ["bone (is |sticking )?out", "open fracture", "compound fracture"]],
  ["burn_face_inhalation", ["burn(ed|t)? (on |to )(the )?(face|neck)", "inhal(ation|ed) burn", "burned? in a? ?(house |building )?fire.*smoke"]],
  ["poisoning_overdose", ["overdose", "took (an? )?(unknown )?(pills|tablets|poison)", "swallowed poison", "ingested poison"]],
  ["vomiting_fresh_blood", ["vomit(ing)? (fresh )?blood", "vomiting blood"]],
  ["pregnancy_pv_bleed", ["pregnan\\w*.*bleeding", "bleeding.*pregnan"]],
  ["pregnancy_trauma_or_pain", ["pregnan\\w*.*(pain|trauma|fell|accident)", "(pain|trauma).*while pregnant"]],
  ["chest_pain", ["chest pain", "pain in (my |the )?chest", "chest (is )?painful"]],
  ["abdominal_pain", ["abdominal pain", "stomach pain", "belly pain", "tummy pain"]],
  ["pain_severe", ["severe pain", "pain is severe", "worst pain", "unbearable pain", "pain (is )?10[/ ]?10"]],
  ["pain_moderate", ["moderate pain", "pain is moderate"]],
  ["pain_mild", ["mild pain", "pain is mild", "slight pain"]],
];

export function extractDiscriminatorsHeuristic(complaintText: string): string[] {
  const text = (complaintText || "").toLowerCase();
  const codes: string[] = [];
  for (const [code, patterns] of KEYWORD_DISCRIMINATORS) {
    if (patterns.some((p) => new RegExp(p, "i").test(text))) codes.push(code);
  }
  return codes;
}

export function bandForTews(tews: number): [string, string] {
  for (const [lo, hi, colour, target] of TEWS_BANDS) {
    if (tews >= lo && tews <= hi) return [colour, target];
  }
  return ["RED", "immediate"];
}

function bandPoints(table: [number, number, number][], value: number): [number, string] | [null, null] {
  for (const [lo, hi, pts] of table) {
    if (value >= lo && value <= hi) return [pts, lo < hi ? `${lo}-${hi}` : `${lo}`];
  }
  return [null, null];
}

export interface ScoredComponent {
  parameter: string;
  value: unknown;
  points: number;
  band_on_chart: string;
  source_field: string;
  scale_reference: string;
}

export type TewsResult =
  | { status: "OK"; tews: number; tews_colour: string; target_time: string; components: ScoredComponent[] }
  | { status: "INCOMPLETE"; missing_fields: string[]; note: string };

export function scoreTews(vitals: Record<string, unknown> | null | undefined): TewsResult {
  const v = vitals || {};
  const missing = (["resp_rate", "heart_rate", "sbp", "temp_c", "avpu", "mobility"] as const).filter(
    (k) => v[k] === null || v[k] === undefined
  );
  if (missing.length) {
    return {
      status: "INCOMPLETE",
      missing_fields: [...missing],
      note: "Refuse to guess: incomplete vitals cannot produce a defensible TEWS. Escalate to the triage nurse for re-measurement.",
    };
  }
  const components: ScoredComponent[] = [];

  const rr = Number(v.resp_rate);
  const [rrPts, rrBand] = bandPoints(RR_POINTS, rr);
  components.push({ parameter: "respiratory_rate", value: rr, points: rrPts!, band_on_chart: `${rrBand} breaths/min`, source_field: `vitals.resp_rate = ${rr}`, scale_reference: "SATS adult chart, RR row" });

  const hr = Number(v.heart_rate);
  const [hrPts, hrBand] = bandPoints(HR_POINTS, hr);
  components.push({ parameter: "heart_rate", value: hr, points: hrPts!, band_on_chart: `${hrBand} beats/min`, source_field: `vitals.heart_rate = ${hr}`, scale_reference: "SATS adult chart, HR row" });

  const sbp = Number(v.sbp);
  const [sbpPts, sbpBand] = bandPoints(SBP_POINTS, sbp);
  components.push({ parameter: "systolic_bp", value: sbp, points: sbpPts!, band_on_chart: `${sbpBand} mmHg`, source_field: `vitals.sbp = ${sbp}`, scale_reference: "SATS adult chart, SBP row" });

  const t = Number(v.temp_c);
  const tPts = tempPoints(t);
  components.push({ parameter: "temperature", value: t, points: tPts, band_on_chart: tPts === 0 ? "feels normal 35-38.4" : tPts === 3 ? "feels cold < 35" : "feels hot > 38.4", source_field: `vitals.temp_c = ${t}`, scale_reference: "SATS adult chart, Temp row" });

  const avpu = String(v.avpu).toLowerCase();
  if (!(avpu in AVPU_POINTS)) {
    return { status: "INCOMPLETE", missing_fields: [`avpu:${avpu}`], note: "Unknown AVPU value; nurse must re-assess consciousness." };
  }
  components.push({ parameter: "avpu", value: avpu, points: AVPU_POINTS[avpu], band_on_chart: avpu, source_field: `vitals.avpu = ${avpu}`, scale_reference: "SATS adult chart, AVPU row" });

  const mob = String(v.mobility).toLowerCase();
  if (!(mob in MOBILITY_POINTS)) {
    return { status: "INCOMPLETE", missing_fields: [`mobility:${mob}`], note: "Unknown mobility value; nurse must re-assess." };
  }
  components.push({ parameter: "mobility", value: mob, points: MOBILITY_POINTS[mob], band_on_chart: mob, source_field: `vitals.mobility = ${mob}`, scale_reference: "SATS adult chart, Mobility row" });

  const trauma = Boolean(v.trauma);
  components.push({ parameter: "trauma", value: trauma, points: traumaPoints(trauma), band_on_chart: trauma ? "yes" : "no", source_field: `vitals.trauma = ${trauma}`, scale_reference: "SATS adult chart, Trauma row" });

  const tews = components.reduce((s, c) => s + c.points, 0);
  const [colour, target] = bandForTews(tews);
  return { status: "OK", tews, tews_colour: colour, target_time: target, components };
}

export function worstColour(codeColours: string[]): string {
  let best = "GREEN";
  for (const c of codeColours) {
    if ((COLOUR_RANK[c] ?? 0) > (COLOUR_RANK[best] ?? 0)) best = c;
  }
  return best;
}
