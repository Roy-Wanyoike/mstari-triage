import { NextRequest, NextResponse } from "next/server";
import { DISCRIMINATORS, TARGET_BY_COLOUR, COLOUR_RANK, scoreTews, worstColour } from "@/lib/mstari/scale";
import { SCOPE_BANNER } from "@/lib/mstari/guardrails";
import { normaliseCard } from "@/lib/mstari/intake";
import type { AuditEntry, DraftCard, IntakeCard } from "@/lib/mstari/types";
import { appendAudit } from "@/lib/mstari/store";

// Deterministic scoring route - the mirror of the mstari MCP score_priority
// tool. The LLM NEVER scores; this is cited scale code only (mstari/scale.py
// ported to lib/mstari/scale.ts). Children <= 12 are escalated, never scored.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const card = body?.card as IntakeCard | undefined;
  const extraction = body?.extraction as { discriminators?: string[]; backend?: string } | undefined;
  if (!card || !card.patient_ref) {
    return NextResponse.json({ error: "card.patient_ref is required" }, { status: 400 });
  }
  const norm = normaliseCard(card);

  const auditBase = {
    ts: new Date().toISOString(),
    event: "tool_call",
    server: "mstari-web",
  };

  // 1. child escalation - the adult chart does not apply
  const age = typeof norm.age_years === "number" ? norm.age_years : null;
  if (age !== null && age <= 12) {
    const result = {
      status: "OUT_OF_SCOPE_ADULT_CHART",
      patient_ref: norm.patient_ref,
      age_years: age,
      reason: "The adult SATS chart covers patients over 12 years. This patient must be triaged with the paediatric chart by a clinician. Mstari refuses to score and escalates.",
      escalate_to: "triage nurse / clinician",
    };
    const audit: AuditEntry = { ...auditBase, tool: "score_priority", args: { patient_ref: norm.patient_ref }, result };
    await appendAudit(audit);
    return NextResponse.json({
      draft: null,
      result,
      audit,
    });
  }

  // 2. extraction source: passed-in codes (LLM) or keyword fallback
  let codes = (extraction?.discriminators ?? []).filter((c) => c in DISCRIMINATORS);
  const rejected = (extraction?.discriminators ?? []).filter((c) => !(c in DISCRIMINATORS));
  let extractionSource = extraction?.backend?.includes("keyword_fallback")
    ? "keyword_fallback"
    : extraction
      ? "llm_extraction"
      : "keyword_fallback";
  if (!codes.length && !rejected.length) {
    codes = (norm.discriminators_reported ?? []) as string[];
    extractionSource = "reported_on_card";
  }

  // 3. deterministic TEWS
  const scored = scoreTews(norm.vitals as Record<string, unknown>);
  if (scored.status !== "OK") {
    const result = { ...scored, patient_ref: norm.patient_ref, escalate_to: "triage nurse" };
    const audit: AuditEntry = { ...auditBase, tool: "score_priority", args: { patient_ref: norm.patient_ref }, result };
    await appendAudit(audit);
    return NextResponse.json({
      draft: null,
      result,
      audit,
    });
  }

  // 4. discriminator override (worst of TEWS band vs discriminator colours)
  const discCitations = codes.map((code) => {
    const [colour, label] = DISCRIMINATORS[code];
    return {
      code,
      colour,
      label,
      source: extractionSource,
      citation: `complaint_text: "${norm.complaint_text}"`,
    };
  });
  const tewsColour = scored.tews_colour;
  const finalColour = worstColour([tewsColour, ...discCitations.map((d) => d.colour)]);
  const overrideReason =
    finalColour !== tewsColour
      ? "discriminator override: " +
        discCitations
          .filter((d) => d.colour === finalColour)
          .map((o) => `${o.code} (${o.label})`)
          .join(", ")
      : `TEWS ${scored.tews} -> ${tewsColour}`;

  const v = (norm.vitals ?? {}) as Record<string, unknown>;
  const keyFields = ["resp_rate", "heart_rate", "sbp", "temp_c", "avpu", "mobility"] as const;
  const keyVitals: Record<string, unknown> = {};
  for (const k of keyFields) if (v[k] !== null && v[k] !== undefined) keyVitals[k] = v[k];

  const draft: DraftCard = {
    card_id: `${norm.patient_ref}-webui`,
    patient_ref: norm.patient_ref,
    age_years: age,
    tews: scored.tews,
    tews_colour: tewsColour,
    colour: finalColour,
    target_time: finalColour === tewsColour ? scored.target_time : TARGET_BY_COLOUR[finalColour],
    override_reason: overrideReason,
    components: scored.components,
    discriminators: discCitations,
    rejected_codes: rejected,
    extraction_source: extractionSource,
    key_vitals: keyVitals,
    spo2_note: "SpO2 recorded by nurse; the SATS adult chart does not score it.",
    wait_minutes_at_triage: typeof norm.wait_minutes_at_triage === "number" ? norm.wait_minutes_at_triage : 0,
    facility: norm.facility,
    status: "DRAFT",
    written_at: new Date().toISOString(),
    scope: SCOPE_BANNER,
  };

  const result = {
    status: "DRAFT_WRITTEN",
    patient_ref: norm.patient_ref,
    colour: finalColour,
    tews: scored.tews,
    target_time: draft.target_time,
    override_reason: overrideReason,
    citations: { vitals: draft.components.length, discriminators: discCitations.length },
    note: "DRAFT - reaches the queue only after a named clinician confirms.",
  };
  const audit: AuditEntry = {
    ...auditBase,
    tool: "score_priority",
    args: { patient_ref: norm.patient_ref, extraction_source: extractionSource },
    result,
  };
  await appendAudit(audit);
  return NextResponse.json({
    draft,
    result,
    audit,
  });
}
