// Shared types for the Mstari hosted triage desk (mirror of the Python core).

export interface Vitals {
  resp_rate?: number | null;
  heart_rate?: number | null;
  sbp?: number | null;
  temp_c?: number | null;
  avpu?: string | null;
  mobility?: string | null;
  trauma?: boolean | null;
  spo2_percent?: number | null;
}

export interface IntakeCard {
  patient_ref: string;
  synthetic: boolean;
  facility?: string;
  arrived_at?: string;
  recorded_by?: string;
  age_years: number;
  sex?: string;
  mobility?: string;
  vitals: Vitals;
  complaint_text: string;
  discriminators_reported?: string[];
  wait_minutes_at_triage?: number;
  [k: string]: unknown;
}

export interface RecheckCard {
  patient_ref?: string;
  vitals_after: Vitals;
  observed_change?: string;
  [k: string]: unknown;
}

export interface DiscriminatorCitation {
  code: string;
  colour: string;
  label: string;
  source: string;
  citation: string;
}

export interface DraftCard {
  card_id: string;
  patient_ref: string;
  age_years: number | null;
  tews: number;
  tews_colour: string;
  colour: string;
  target_time: string;
  override_reason: string;
  components: { parameter: string; value: unknown; points: number; band_on_chart: string; source_field: string; scale_reference: string }[];
  discriminators: DiscriminatorCitation[];
  rejected_codes: string[];
  extraction_source: string;
  key_vitals: Record<string, unknown>;
  spo2_note?: string;
  wait_minutes_at_triage: number;
  facility?: string;
  status: "DRAFT" | "CONFIRMED" | "OUT_OF_SCOPE_ADULT_CHART" | "INCOMPLETE";
  written_at: string;
  scope: string;
  confirmed_by?: string;
  confirmed_at?: string;
}

export interface AuditEntry {
  ts: string;
  event: string;
  tool: string;
  server: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  duration_ms?: number;
}

export interface LedgerEntry {
  ts: string;
  action: string;
  artifact: string;
  decision: "APPROVED" | "BLOCKED";
  clinician: string | null;
  reason: string;
  payload?: unknown; // optional detail blob (e.g. re-check flag) persisted in Neon
}

export interface ExtractionResult {
  backend: string; // e.g. "Qwen-Ambassador/Qwen3.8-plus (ModelScope)" or "keyword_fallback (no LLM endpoint / unreachable)"
  discriminators: string[];
  rejected: string[];
  summary: string;
  guardrail_redactions: string[];
}
