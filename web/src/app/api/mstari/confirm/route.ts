import { NextRequest, NextResponse } from "next/server";
import type { AuditEntry, DraftCard, LedgerEntry } from "@/lib/mstari/types";
import { appendAudit, appendLedger, saveConfirmed } from "@/lib/mstari/store";

// GATED acting route - the mirror of the mstari MCP confirm_priority tool.
// Block-by-default lives HERE (server side), not in the UI: an empty or
// whitespace clinician name is refused, logged as a BLOCKED gate decision,
// and nothing is published. A named clinician + timestamp is required.
// Persisted to Neon Postgres when DATABASE_URL is set (best-effort: the
// gate itself never depends on the database being up).

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const draft = body?.draft as DraftCard | undefined;
  const clinicianName = String(body?.clinicianName ?? "").trim();
  if (!draft || !draft.patient_ref) {
    return NextResponse.json({ error: "draft.patient_ref is required" }, { status: 400 });
  }

  const ts = new Date().toISOString();
  if (!clinicianName) {
    // BLOCKED by default - this is the gate, in code, on the server.
    const ledger: LedgerEntry = {
      ts,
      action: "confirm_priority",
      artifact: draft.patient_ref,
      decision: "BLOCKED",
      clinician: null,
      reason: "no named clinician approved - gate blocks by default",
    };
    const audit: AuditEntry = { ts, event: "tool_call", tool: "confirm_priority", server: "mstari-web", args: { patient_ref: draft.patient_ref, clinician_name: null }, result: { status: "BLOCKED" } };
    await Promise.all([appendLedger(ledger), appendAudit(audit)]);
    const result = { status: "BLOCKED", reason: ledger.reason, patient_ref: draft.patient_ref };
    return NextResponse.json({ confirmed: null, result, ledger, audit });
  }

  const confirmed: DraftCard = {
    ...draft,
    status: "CONFIRMED",
    confirmed_by: clinicianName,
    confirmed_at: ts,
  };
  const ledger: LedgerEntry = {
    ts,
    action: "confirm_priority",
    artifact: draft.patient_ref,
    decision: "APPROVED",
    clinician: clinicianName,
    reason: "named clinician approved irreversible publish",
  };
  const result = {
    status: "CONFIRMED",
    patient_ref: draft.patient_ref,
    clinician: clinicianName,
    colour: draft.colour,
    tews: draft.tews,
    note: "Priority now on the live queue board with full citations.",
  };
  const audit: AuditEntry = { ts, event: "tool_call", tool: "confirm_priority", server: "mstari-web", args: { patient_ref: draft.patient_ref, clinician_name: clinicianName }, result };
  await Promise.all([saveConfirmed(confirmed), appendLedger(ledger), appendAudit(audit)]);
  return NextResponse.json({ confirmed, result, ledger, audit });
}
