import { NextResponse } from "next/server";
import { loadAudit, loadLedger, loadQueue, storageBackend, storageConfigured } from "@/lib/mstari/store";

// Hydration endpoint: the desk reloads the persisted queue board, gate
// ledger and audit trail on load, so a shared demo state survives page
// refreshes and multiple judges see the same board.
// Backend: Neon Postgres when DATABASE_URL is set, else in-memory (per
// server instance). Always reports which one it served - honest mode.

export const dynamic = "force-dynamic";

export async function GET() {
  const [queue, ledger, audit] = await Promise.all([loadQueue(), loadLedger(100), loadAudit(200)]);
  return NextResponse.json({
    storage: storageBackend(),
    storage_configured: storageConfigured(),
    queue,
    ledger,
    audit,
    ts: new Date().toISOString(),
  });
}
