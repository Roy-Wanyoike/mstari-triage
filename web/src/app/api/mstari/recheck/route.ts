import { NextRequest, NextResponse } from "next/server";
import { scoreTews } from "@/lib/mstari/scale";
import type { AuditEntry, DraftCard, LedgerEntry, RecheckCard } from "@/lib/mstari/types";
import { appendAudit, appendLedger } from "@/lib/mstari/store";

// GATED acting route - the mirror of the mstari MCP raise_recheck_flag tool.
// Deterioration watch: compare re-check vitals against the confirmed card.
// The flag NEVER changes the priority - "a second look, not a verdict".
// Gated like confirm: no named clinician -> BLOCKED. Persisted to Neon
// Postgres when DATABASE_URL is set (best-effort, gate never depends on DB).

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const confirmed = body?.confirmed as DraftCard | undefined;
  const recheck = body?.recheck as RecheckCard | undefined;
  const clinicianName = String(body?.clinicianName ?? "").trim();
  if (!confirmed?.patient_ref || !recheck?.vitals_after) {
    return NextResponse.json({ error: "confirmed.patient_ref and recheck.vitals_after are required" }, { status: 400 });
  }

  const ts = new Date().toISOString();
  if (!clinicianName) {
    const ledger: LedgerEntry = {
      ts,
      action: "raise_recheck_flag",
      artifact: `${confirmed.patient_ref}-recheck`,
      decision: "BLOCKED",
      clinician: null,
      reason: "no named clinician approved - gate blocks by default",
    };
    const audit: AuditEntry = { ts, event: "tool_call", tool: "raise_recheck_flag", server: "mstari-web", args: { patient_ref: confirmed.patient_ref, clinician_name: null }, result: { status: "BLOCKED" } };
    await Promise.all([appendLedger(ledger), appendAudit(audit)]);
    return NextResponse.json({
      flag: null,
      result: { status: "BLOCKED", reason: ledger.reason },
      ledger,
      audit,
    });
  }

  const after = scoreTews(recheck.vitals_after as Record<string, unknown>);
  if (after.status !== "OK") {
    const audit: AuditEntry = { ts, event: "tool_call", tool: "raise_recheck_flag", server: "mstari-web", args: { patient_ref: confirmed.patient_ref }, result: { status: "INCOMPLETE_RECHECK" } };
    await appendAudit(audit);
    return NextResponse.json({
      flag: null,
      result: { status: "INCOMPLETE_RECHECK", detail: after, escalate_to: "triage nurse" },
      audit,
    });
  }

  const beforeTews = confirmed.tews;
  const afterTews = after.tews;
  const worsened = afterTews > (beforeTews || 0);

  const flag = {
    flag_id: `recheck-${confirmed.patient_ref}-webui`,
    patient_ref: confirmed.patient_ref,
    kind: "DETERIORATION_SECOND_LOOK",
    worsened,
    before: {
      tews: beforeTews,
      colour: confirmed.colour,
      vitals: confirmed.key_vitals,
      citation: "confirmed card (web UI run)",
    },
    after: {
      tews: afterTews,
      colour: after.tews_colour,
      vitals: recheck.vitals_after,
      components: after.components,
      citation: "re-check vitals (bundled synthetic recheck card)",
    },
    delta_tews: afterTews - (beforeTews || 0),
    observed_change: recheck.observed_change || "nurse re-check",
    raised_by: clinicianName,
    raised_at: ts,
    status: "SECOND_LOOK_REQUESTED",
    note: "For a second look, not a verdict. The nurse re-assesses and decides.",
  };

  const result = {
    status: worsened ? "FLAG_RAISED" : "NO_WORSENING_FLAGGED",
    patient_ref: confirmed.patient_ref,
    worsened,
    tews_before: beforeTews,
    tews_after: afterTews,
    delta_tews: flag.delta_tews,
    note: "Second-look flag with both vital sets cited. Priority unchanged.",
  };
  const ledger: LedgerEntry = {
    ts,
    action: "raise_recheck_flag",
    artifact: `${confirmed.patient_ref}-recheck`,
    decision: "APPROVED",
    clinician: clinicianName,
    reason: "named clinician approved the second-look flag",
    payload: flag,
  };
  const audit: AuditEntry = { ts, event: "tool_call", tool: "raise_recheck_flag", server: "mstari-web", args: { patient_ref: confirmed.patient_ref, clinician_name: clinicianName }, result };
  await Promise.all([appendLedger(ledger), appendAudit(audit)]);
  return NextResponse.json({ flag, result, ledger, audit });
}
