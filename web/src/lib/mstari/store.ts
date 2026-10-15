// Demo storage for the hosted Triage Desk.
//
// Backend: Neon Postgres (Vercel marketplace) when DATABASE_URL is set —
// used for demonstration persistence of the queue board, gate ledger and
// audit trail across reloads/redeploys. Every write is best-effort: a
// database outage must NEVER block or fail the gate, so failures degrade
// to the in-memory session store and are reported honestly via /api and
// /api/mstari/state ("in-memory").
//
// The Python repo (source of record) keeps file artifacts in runs/
// (audit_log.jsonl, gate_ledger.json, queue_board.md) and needs no DB.

import postgres from "postgres";
import type { AuditEntry, DraftCard, LedgerEntry } from "./types";

const DATABASE_URL = process.env.DATABASE_URL ?? "";

let sql: postgres.Sql | null = null;
let ddl: Promise<void> | null = null;
let degraded = false; // flipped on first DB error this process; honest mode kicks in

// In-memory fallback (also the always-fresh mirror for reads below).
const memQueue = new Map<string, DraftCard>();
const memLedger: LedgerEntry[] = [];
const memAudit: AuditEntry[] = [];

const AUDIT_CAP = 500;
const LEDGER_CAP = 500;

// postgres.js expects its JSONValue tree; our domain types are plain
// JSON-serialisable data by construction (intake cards, audit entries).
const asJson = (v: unknown) => v as never;

export function storageConfigured(): boolean {
  return DATABASE_URL.length > 0;
}

export function storageBackend(): "neon" | "in-memory" {
  return storageConfigured() && !degraded ? "neon" : "in-memory";
}

function getSql(): postgres.Sql | null {
  if (!storageConfigured() || degraded) return null;
  if (!sql) {
    // Neon requires TLS; a plain localhost Postgres (dev) must not force it.
    const isLocal = /@(\[?localhost|127\.0\.0\.1)/.test(DATABASE_URL);
    sql = postgres(DATABASE_URL, {
      ssl: isLocal ? "prefer" : "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // safe against Neon's pooled connection (PgBouncer)
    });
  }
  return sql;
}

async function ensureDDL(s: postgres.Sql): Promise<void> {
  if (!ddl) {
    ddl = (async () => {
      await s`
        CREATE TABLE IF NOT EXISTS mstari_queue (
          patient_ref  TEXT PRIMARY KEY,
          card         JSONB NOT NULL,
          colour       TEXT NOT NULL,
          tews         INTEGER NOT NULL,
          confirmed_by TEXT NOT NULL,
          confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await s`
        CREATE TABLE IF NOT EXISTS mstari_gate_ledger (
          id        SERIAL PRIMARY KEY,
          ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
          action    TEXT NOT NULL,
          artifact  TEXT NOT NULL,
          decision  TEXT NOT NULL,
          clinician TEXT,
          reason    TEXT NOT NULL,
          payload   JSONB
        )`;
      await s`
        CREATE TABLE IF NOT EXISTS mstari_audit_log (
          id      SERIAL PRIMARY KEY,
          ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
          event   TEXT NOT NULL,
          tool    TEXT NOT NULL,
          server  TEXT NOT NULL,
          payload JSONB NOT NULL
        )`;
    })();
  }
  await ddl;
}

async function withDb<T>(fn: (s: postgres.Sql) => Promise<T>): Promise<T | null> {
  const s = getSql();
  if (!s) return null;
  try {
    await ensureDDL(s);
    return await fn(s);
  } catch (err) {
    // Degrade honestly: never let storage trouble touch the gate.
    degraded = true;
    console.error("[mstari-store] Neon unavailable - falling back to in-memory:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------- queue (confirmed priorities only) ----------

export async function saveConfirmed(card: DraftCard): Promise<void> {
  memQueue.set(card.patient_ref, card);
  await withDb(async (s) => {
    await s`
      INSERT INTO mstari_queue (patient_ref, card, colour, tews, confirmed_by, confirmed_at)
      VALUES (${card.patient_ref}, ${s.json(asJson(card))}, ${card.colour}, ${card.tews}, ${card.confirmed_by ?? "unknown"}, ${card.confirmed_at ?? new Date().toISOString()})
      ON CONFLICT (patient_ref) DO UPDATE
        SET card = EXCLUDED.card,
            colour = EXCLUDED.colour,
            tews = EXCLUDED.tews,
            confirmed_by = EXCLUDED.confirmed_by,
            confirmed_at = EXCLUDED.confirmed_at`;
  });
}

export async function loadQueue(): Promise<DraftCard[]> {
  const rows = await withDb((s) =>
    s`SELECT card FROM mstari_queue ORDER BY confirmed_at DESC`
  );
  if (rows) return (rows as unknown as { card: DraftCard }[]).map((r) => r.card);
  return [...memQueue.values()];
}

// ---------- gate ledger (who / what / when, APPROVED and BLOCKED) ----------

export async function appendLedger(entry: LedgerEntry): Promise<void> {
  memLedger.push(entry);
  if (memLedger.length > LEDGER_CAP) memLedger.shift();
  await withDb(async (s) => {
    await s`
      INSERT INTO mstari_gate_ledger (ts, action, artifact, decision, clinician, reason, payload)
      VALUES (${entry.ts}, ${entry.action}, ${entry.artifact}, ${entry.decision}, ${entry.clinician}, ${entry.reason}, ${entry.payload === undefined ? null : s.json(asJson(entry.payload))})`;
  });
}

export async function loadLedger(limit = 100): Promise<LedgerEntry[]> {
  const rows = await withDb((s) =>
    s`SELECT ts, action, artifact, decision, clinician, reason, payload
        FROM mstari_gate_ledger
       ORDER BY id DESC
       LIMIT ${limit}`
  );
  if (rows) {
    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      ts: new Date(r.ts as string).toISOString(),
      action: String(r.action),
      artifact: String(r.artifact),
      decision: r.decision as LedgerEntry["decision"],
      clinician: (r.clinician as string | null) ?? null,
      reason: String(r.reason),
      ...(r.payload !== null && r.payload !== undefined ? { payload: r.payload } : {}),
    }));
  }
  return memLedger.slice(-limit).reverse();
}

// ---------- audit trail (every tool call) ----------

export async function appendAudit(entry: AuditEntry): Promise<void> {
  memAudit.push(entry);
  if (memAudit.length > AUDIT_CAP) memAudit.shift();
  await withDb(async (s) => {
    await s`
      INSERT INTO mstari_audit_log (ts, event, tool, server, payload)
      VALUES (${entry.ts}, ${entry.event}, ${entry.tool}, ${entry.server}, ${s.json(asJson(entry))})`;
  });
}

export async function loadAudit(limit = 200): Promise<AuditEntry[]> {
  const rows = await withDb((s) =>
    s`SELECT payload FROM mstari_audit_log ORDER BY id DESC LIMIT ${limit}`
  );
  if (rows) return (rows as unknown as { payload: AuditEntry }[]).map((r) => r.payload);
  return memAudit.slice(-limit).reverse();
}
