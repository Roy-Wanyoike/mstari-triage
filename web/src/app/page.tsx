"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ShieldAlert, PlayCircle, Loader2, Download, HeartPulse, GitCompareArrows, Database,
  Activity, Clock3, CheckCircle2, XCircle, LockKeyhole, Stethoscope, ListOrdered,
  Ban, ChevronRight, ArrowRight,
} from "lucide-react";
import { BUNDLED_PATIENTS } from "@/lib/mstari/patients";
import { COLOUR_RANK, DISCRIMINATORS } from "@/lib/mstari/scale";
import { SCOPE_BANNER } from "@/lib/mstari/guardrails";
import type { AuditEntry, DraftCard, ExtractionResult, IntakeCard, LedgerEntry } from "@/lib/mstari/types";

interface RunState {
  extraction?: ExtractionResult;
  draft?: DraftCard | null;
  escalated?: Record<string, unknown> | null;
  confirmed?: DraftCard | null;
  flag?: Record<string, unknown> | null;
  gateNotice?: string | null;
  busy?: boolean;
}

/* ========================================================================
   Mstari — the Triage Desk · visual system v3.
   One idea carries the whole interface: the SATS spectrum is a LINE.
   The brand mark is a vitals pulse crossing that line; the header ribbon,
   queue spines, locator bars and board chips are all voices of the same
   scale. Clinical, honest, calm — numbers stay tabular, labels stay true.
   ======================================================================== */

const COLOUR_CLASS: Record<string, string> = {
  RED: "bg-red-50 text-red-700 border-red-200",
  ORANGE: "bg-orange-50 text-orange-700 border-orange-200",
  YELLOW: "bg-amber-50 text-amber-800 border-amber-200",
  GREEN: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const COLOUR_SOLID: Record<string, string> = {
  RED: "bg-red-600 text-white shadow-sm shadow-red-600/40",
  ORANGE: "bg-orange-500 text-white shadow-sm shadow-orange-500/40",
  YELLOW: "bg-amber-400 text-amber-950 shadow-sm shadow-amber-400/40",
  GREEN: "bg-emerald-600 text-white shadow-sm shadow-emerald-600/40",
};

const SPINE: Record<string, string> = {
  RED: "border-l-red-600",
  ORANGE: "border-l-orange-500",
  YELLOW: "border-l-amber-400",
  GREEN: "border-l-emerald-600",
};

const DOT_BY_COLOUR: Record<string, string> = {
  RED: "bg-red-600",
  ORANGE: "bg-orange-500",
  YELLOW: "bg-amber-400",
  GREEN: "bg-emerald-600",
};

const POINTS_DOT = ["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-600"];

/* The SATS adult-chart spectrum, ordered worst → best. Drives the header
   ribbon, the draft-card locator bar and the footer legend. */
const SATS_SPECTRUM = [
  { colour: "RED", bar: "bg-red-600", label: "immediate", labelClass: "text-white/95" },
  { colour: "ORANGE", bar: "bg-orange-500", label: "< 10 min", labelClass: "text-white/95" },
  { colour: "YELLOW", bar: "bg-amber-400", label: "< 60 min", labelClass: "text-amber-950" },
  { colour: "GREEN", bar: "bg-emerald-600", label: "< 240 min", labelClass: "text-white/95" },
];

/* ---- The Mstari mark ---------------------------------------------------
   A single vitals pulse stroked with the full SATS spectrum — critical
   red at the left, stable green at the right. "Mstari" is Swahili for
   "line": the patient's line, the pulse, and the triage scale in one.
   ------------------------------------------------------------------------ */
function MstariPulse({ className = "", idSuffix }: { className?: string; idSuffix: string }) {
  const gid = `mstari-sats-${idSuffix}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="0.38" stopColor="#f97316" />
          <stop offset="0.66" stopColor="#facc15" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <path
        d="M7 36H18L23 36L28 22L34.5 48L39 29L42 36H57"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="4.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Header brand tile: the pulse on a deep instrument tile. */
function BrandMark() {
  return (
    <div
      aria-hidden
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-slate-700/60 to-slate-950 shadow-lg shadow-black/40 ring-1 ring-white/25"
    >
      <MstariPulse className="h-8 w-8" idSuffix="brand" />
      <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-transparent via-transparent to-white/10" />
    </div>
  );
}

function ColourChip({ colour, big = false }: { colour: string; big?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wide shadow-sm ${COLOUR_SOLID[colour] ?? "bg-slate-200 text-slate-700"} ${
        big ? "px-4 py-1.5 text-sm" : "px-2.5 py-0.5 text-[11px]"
      }`}
    >
      {colour}
    </span>
  );
}

/* Full-width SATS spectrum ribbon — the desk's signature edge. */
function SatsRibbon() {
  return (
    <div aria-hidden className="grid grid-cols-4 text-center font-mono text-[9px] font-semibold uppercase tracking-[0.18em]">
      {SATS_SPECTRUM.map((s) => (
        <span key={s.colour} className={`${s.bar} ${s.labelClass} flex items-center justify-center py-1`}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* Where a patient sits on the SATS scale — active band widens and glows. */
function SatsLocator({ colour, dark = false }: { colour: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="img"
        aria-label={`SATS scale position: ${colour}`}
        className="flex h-2.5 w-36 gap-px overflow-hidden rounded-full sm:w-44"
      >
        {SATS_SPECTRUM.map((s) => (
          <span
            key={s.colour}
            className={`${s.bar} transition-all duration-500 ${
              s.colour === colour ? "flex-[1.7] opacity-100" : `flex-1 ${dark ? "opacity-30" : "opacity-25"}`
            }`}
          />
        ))}
      </div>
      <span
        className={`hidden font-mono text-[10px] font-semibold uppercase tracking-wider sm:inline ${
          dark ? "text-white/70" : "text-muted-foreground"
        }`}
      >
        {colour}
      </span>
    </div>
  );
}

function StatCell({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: number | string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white px-4 py-4">
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="mt-1 text-[1.7rem] font-bold leading-none tabular-nums tracking-tight text-slate-900">{value}</p>
      </div>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
    </div>
  );
}

function VitalTile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-[inset_0_1px_0_oklch(1_0_0)]">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold leading-tight tabular-nums text-slate-900">
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{unit}</span>}
      </p>
      {note && <p className="text-[9.5px] leading-tight text-amber-700">{note}</p>}
    </div>
  );
}

/* Pipeline rail node — the numbered station on the vertical timeline. */
function RailNode({ n, state }: { n: number; state: "done" | "busy" | "pending" }) {
  const styles =
    state === "done"
      ? "border-teal-900 bg-teal-900 text-white shadow-sm shadow-teal-900/30"
      : state === "busy"
        ? "border-2 border-teal-600 bg-white text-teal-700 animate-pulse"
        : "border-2 border-slate-300 bg-white text-slate-400";
  return (
    <span
      aria-hidden
      className={`absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] font-bold ${styles}`}
    >
      {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : n}
    </span>
  );
}

function RailStep({
  n,
  state,
  title,
  note,
  last = false,
  children,
}: {
  n: number;
  state: "done" | "busy" | "pending";
  title: string;
  note?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative pl-11 pb-7 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className="absolute bottom-1 left-[13.5px] top-9 w-px bg-gradient-to-b from-teal-900/30 via-slate-300 to-slate-100"
        />
      )}
      <RailNode n={n} state={state} />
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
        {note && <span className="font-mono text-[10.5px] text-muted-foreground">{note}</span>}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export default function Home() {
  const [selected, setSelected] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [clinician, setClinician] = useState("");
  const [queueBusy, setQueueBusy] = useState(false);
  const [serverQueue, setServerQueue] = useState<DraftCard[]>([]);
  const [storageLabel, setStorageLabel] = useState("checking\u2026");

  // Hydrate persisted demo state (Neon Postgres when DATABASE_URL is set,
  // else the server's in-memory session) so the board survives a refresh.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/mstari/state");
        const data = await res.json();
        setServerQueue(Array.isArray(data.queue) ? data.queue : []);
        setLedger(Array.isArray(data.ledger) ? data.ledger : []);
        setAudit(Array.isArray(data.audit) ? data.audit : []);
        setStorageLabel(data.storage === "neon" ? "Neon Postgres" : "in-memory (session)");
      } catch {
        setStorageLabel("in-memory (session)");
      }
    })();
  }, []);

  const pushAudit = useCallback((entries: AuditEntry[]) => {
    setAudit((a) => [...a, ...entries]);
  }, []);

  const runPipeline = useCallback(
    async (ref: string, card: IntakeCard) => {
      setRuns((r) => ({ ...r, [ref]: { ...r[ref], busy: true, escalated: null, draft: null, confirmed: null, gateNotice: null } }));
      pushAudit([
        {
          ts: new Date().toISOString(),
          event: "tool_call",
          tool: "parse_intake_record",
          server: "mstari-web",
          args: { patient_ref: ref },
          result: { status: "OK", note: "Synthetic intake card loaded (bundled, synthetic:true)." },
        },
      ]);
      // Step 2 - extraction (Qwen via ModelScope, honest fallback)
      let extraction: ExtractionResult | undefined;
      try {
        const res = await fetch("/api/mstari/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ complaintText: card.complaint_text, ageYears: card.age_years }),
        });
        const data = await res.json();
        extraction = data.extraction;
        pushAudit([data.audit]);
      } catch {
        extraction = { backend: "keyword_fallback (request failed - honest mode)", discriminators: [], rejected: [], summary: "", guardrail_redactions: [] };
      }
      setRuns((r) => ({ ...r, [ref]: { ...r[ref], extraction } }));
      // Step 3 - deterministic cited score
      try {
        const res = await fetch("/api/mstari/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card, extraction }),
        });
        const data = await res.json();
        pushAudit([data.audit]);
        if (data.draft) {
          setRuns((r) => ({ ...r, [ref]: { ...r[ref], draft: data.draft, busy: false } }));
        } else {
          setRuns((r) => ({ ...r, [ref]: { ...r[ref], escalated: data.result, busy: false } }));
        }
      } catch {
        setRuns((r) => ({ ...r, [ref]: { ...r[ref], busy: false } }));
      }
    },
    [pushAudit]
  );

  const confirmPatient = useCallback(
    async (ref: string) => {
      const run = runs[ref];
      if (!run?.draft) return;
      const res = await fetch("/api/mstari/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: run.draft, clinicianName: clinician }),
      });
      const data = await res.json();
      pushAudit([data.audit]);
      if (data.ledger) setLedger((l) => [...l, data.ledger]);
      if (data.confirmed) {
        setRuns((r) => ({ ...r, [ref]: { ...r[ref], confirmed: data.confirmed, gateNotice: null } }));
      } else {
        setRuns((r) => ({ ...r, [ref]: { ...r[ref], gateNotice: String(data.result?.reason ?? "BLOCKED") } }));
      }
    },
    [runs, clinician, pushAudit]
  );

  const raiseRecheck = useCallback(
    async (ref: string) => {
      const bundle = BUNDLED_PATIENTS.find((p) => p.card.patient_ref === ref);
      const run = runs[ref];
      if (!bundle?.recheck || !run?.confirmed) return;
      const res = await fetch("/api/mstari/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: run.confirmed, recheck: bundle.recheck, clinicianName: clinician }),
      });
      const data = await res.json();
      pushAudit([data.audit]);
      if (data.ledger) setLedger((l) => [...l, data.ledger]);
      setRuns((r) => ({ ...r, [ref]: { ...r[ref], flag: data.flag ?? { status: data.result?.status, reason: data.result?.reason } } }));
    },
    [runs, clinician, pushAudit]
  );

  const runAll = useCallback(async () => {
    setQueueBusy(true);
    for (const p of BUNDLED_PATIENTS) {
      await runPipeline(p.card.patient_ref, p.card);
    }
    setQueueBusy(false);
  }, [runPipeline]);

  const confirmedCards = useMemo(
    () => Object.values(runs).map((r) => r.confirmed).filter(Boolean) as DraftCard[],
    [runs]
  );
  const pendingDrafts = useMemo(
    () => Object.values(runs).map((r) => r.draft).filter((d): d is DraftCard => !!d && d.status === "DRAFT" && !runs[`${d.patient_ref}`]?.confirmed),
    [runs]
  );
  const board = useMemo(() => {
    // Merge persisted confirmed cards (Neon / server memory) with the ones
    // confirmed in this browser session; newest confirmation wins per patient.
    const byRef = new Map<string, DraftCard>();
    for (const c of serverQueue) byRef.set(c.patient_ref, c);
    for (const c of confirmedCards) {
      const prev = byRef.get(c.patient_ref);
      if (!prev || (c.confirmed_at ?? "") >= (prev.confirmed_at ?? "")) byRef.set(c.patient_ref, c);
    }
    return [...byRef.values()].sort((a, b) => {
      const c = (COLOUR_RANK[b.colour] ?? 0) - (COLOUR_RANK[a.colour] ?? 0);
      if (c !== 0) return c;
      if (b.tews !== a.tews) return b.tews - a.tews;
      return b.wait_minutes_at_triage - a.wait_minutes_at_triage;
    });
  }, [confirmedCards, serverQueue]);

  const downloadAudit = () => {
    const blob = new Blob([audit.map((e) => JSON.stringify(e)).join("\n") + "\n"], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit_log.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedBundle = BUNDLED_PATIENTS.find((p) => p.card.patient_ref === selected);
  const selectedRun = selected ? runs[selected] : undefined;
  const runsStarted = Object.values(runs).filter((r) => r.draft || r.escalated || r.busy).length;
  const blocksCount = ledger.filter((e) => e.decision === "BLOCKED").length;

  /* ---- v3 additive: desk wall-clock (hydration-safe — renders after mount) ---- */
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Africa/Nairobi",
    });
    const tick = () => setClock(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const neonLive = storageLabel === "Neon Postgres";

  return (
    <div className="dot-grid flex min-h-screen flex-col">
      {/* ---------- Command bar ---------- */}
      <header className="command-bar sticky top-0 z-30 text-white shadow-lg shadow-slate-950/25">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
            <div className="flex items-center gap-3.5">
              <BrandMark />
              <div>
                <h1 className="flex flex-wrap items-baseline gap-x-2.5 text-lg font-bold tracking-tight sm:text-[1.35rem]">
                  Mstari
                  <span aria-hidden className="hidden h-4 w-px bg-white/20 sm:inline-block" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-teal-300 sm:text-xs">
                    Triage&nbsp;Desk
                  </span>
                </h1>
                <p className="mt-0.5 text-[11px] text-white/55 sm:text-xs">
                  Agentic triage queue for a busy public OPD · hosted demo mirror · synthetic data only
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[11px] tabular-nums backdrop-blur"
                title="Desk clock — East Africa Time"
              >
                <Clock3 className="h-3 w-3 text-teal-300" />
                {clock ?? <span className="text-white/40">--:--:--</span>}
                <span className="text-white/45">EAT</span>
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[11px] backdrop-blur"
                title={neonLive ? "Confirmed priorities, gate ledger and audit trail persist to Neon Postgres" : "State lives in this server session's memory"}
              >
                {neonLive ? (
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden />
                )}
                <span className="text-white/50">storage:</span>
                <span className={neonLive ? "text-emerald-200" : "text-white/70"}>{storageLabel}</span>
              </span>
              <span className="hidden rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/60 backdrop-blur lg:inline-flex">
                Agentic AI for Africa Challenge · healthcare track
              </span>
            </div>
          </div>
        </div>
        <SatsRibbon />
      </header>

      {/* ---------- Scope strip (scrolls away; header stays slim) ---------- */}
      <div className="border-b border-amber-200/70 bg-amber-50">
        <div className="mx-auto flex max-w-7xl items-start gap-2.5 px-4 py-2.5 sm:px-6">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-xs leading-relaxed text-amber-900">
            <b className="font-semibold">Scope — enforced in code, not in prose.</b> {SCOPE_BANNER}
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {/* ---------- Meter strip ---------- */}
        <div className="rise mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-sm shadow-slate-950/5 sm:grid-cols-3 lg:grid-cols-5">
          <StatCell icon={ListOrdered} label="synthetic patients" value={BUNDLED_PATIENTS.length} tone="bg-teal-50 text-teal-700" />
          <StatCell icon={Activity} label="runs started" value={runsStarted} tone="bg-sky-50 text-sky-700" />
          <StatCell icon={CheckCircle2} label="confirmed on board" value={board.length} tone="bg-emerald-50 text-emerald-700" />
          <StatCell icon={Clock3} label="drafts pending gate" value={pendingDrafts.length} tone="bg-amber-50 text-amber-700" />
          <StatCell icon={Ban} label="gate blocks" value={blocksCount} tone="bg-red-50 text-red-700" />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* LEFT: arrival queue */}
          <Card className="overflow-hidden shadow-sm ring-1 ring-slate-950/5">
            <CardHeader className="border-b bg-slate-50/80 py-3.5">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-900 text-white shadow-sm">
                    <Stethoscope className="h-3.5 w-3.5" />
                  </span>
                  Arrival queue
                  <span className="text-xs font-normal text-muted-foreground">{BUNDLED_PATIENTS.length} synthetic</span>
                </span>
                <Button size="sm" onClick={runAll} disabled={queueBusy} className="gap-1.5 shadow-sm">
                  {queueBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Run all
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="space-y-2 p-3">
                  {BUNDLED_PATIENTS.map(({ card }) => {
                    const run = runs[card.patient_ref];
                    const colour = run?.confirmed?.colour ?? run?.draft?.colour;
                    const isSel = selected === card.patient_ref;
                    return (
                      <button
                        key={card.patient_ref}
                        onClick={() => { setSelected(card.patient_ref); if (!run && !queueBusy) runPipeline(card.patient_ref, card); }}
                        className={`relative w-full overflow-hidden rounded-xl border border-l-4 bg-white p-3 text-left transition-all hover:-translate-y-px hover:shadow-md ${
                          colour ? `${SPINE[colour]} ` : "border-l-slate-300 "
                        }${isSel ? "border-teal-800/50 shadow-md ring-2 ring-teal-800/20" : "shadow-sm"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-bold tracking-tight text-slate-900">{card.patient_ref}</span>
                          {run?.busy ? (
                            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                          ) : colour ? (
                            <ColourChip colour={colour} />
                          ) : run?.escalated ? (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              escalated
                            </Badge>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">not run</span>
                          )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{card.complaint_text}</p>
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="font-mono">{card.age_years}·{card.sex ?? "?"}</span>
                          <span aria-hidden>·</span>
                          <Clock3 className="h-3 w-3" /> waiting {card.wait_minutes_at_triage ?? 0} min
                        </p>
                        {run?.busy && <span aria-hidden className="busy-shimmer" />}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* RIGHT: pipeline workspace */}
          <div className="min-w-0 space-y-6">
            {!selectedBundle && (
              <div className="rise rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 ring-1 ring-teal-800/15">
                  <Stethoscope className="h-7 w-7 text-teal-800/70" />
                </div>
                <p className="mt-4 text-base font-semibold text-slate-800">Select a patient to open their pipeline</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                  The desk runs ingestion &rarr; extraction &rarr; cited scoring, then stops at the clinician gate —
                  exactly where a human takes over.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-1 font-mono text-[10.5px] text-slate-500">
                  <span className="rounded-md border bg-white px-2 py-1">1 intake</span>
                  <ArrowRight className="h-3 w-3 text-slate-300" />
                  <span className="rounded-md border bg-white px-2 py-1">2 extract</span>
                  <ArrowRight className="h-3 w-3 text-slate-300" />
                  <span className="rounded-md border bg-white px-2 py-1">3 cited score</span>
                  <ArrowRight className="h-3 w-3 text-slate-300" />
                  <span className="rounded-md border bg-white px-2 py-1">4 human gate</span>
                </div>
              </div>
            )}

            {selectedBundle && (
              <Card className="rise shadow-sm ring-1 ring-slate-950/5">
                <CardHeader className="border-b bg-slate-50/80 py-3.5">
                  <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
                    <span>Pipeline</span>
                    <span className="rounded-md bg-slate-950 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {selectedBundle.card.patient_ref}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">every step is logged to the audit trail below</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {/* Step 1 — ingestion */}
                  <RailStep n={1} state="done" title="Ingestion" note="parse_intake_record">
                    <div className="rounded-xl border bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-slate-950 px-2 py-0.5 font-mono text-xs font-bold text-white">
                          {selectedBundle.card.patient_ref}
                        </span>
                        <Badge variant="outline" className="bg-white text-xs">age {selectedBundle.card.age_years}</Badge>
                        <Badge variant="outline" className="bg-white text-xs">sex {selectedBundle.card.sex ?? "?"}</Badge>
                        <Badge variant="outline" className="bg-white text-xs">mobility {selectedBundle.card.mobility}</Badge>
                        <Badge variant="outline" className="bg-white text-xs">wait {String(selectedBundle.card.wait_minutes_at_triage ?? 0)} min</Badge>
                      </div>
                      <blockquote className="mt-3 border-l-2 border-teal-800/60 pl-3 text-sm italic leading-relaxed text-slate-700">
                        &ldquo;{selectedBundle.card.complaint_text}&rdquo;
                        <span className="ml-2 align-middle font-mono text-[10px] not-italic text-muted-foreground">complaint_text</span>
                      </blockquote>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <VitalTile label="Resp rate" value={String(selectedBundle.card.vitals.resp_rate)} unit="/min" />
                        <VitalTile label="Heart rate" value={String(selectedBundle.card.vitals.heart_rate)} unit="bpm" />
                        <VitalTile label="SBP" value={String(selectedBundle.card.vitals.sbp)} unit="mmHg" />
                        <VitalTile label="Temp" value={String(selectedBundle.card.vitals.temp_c)} unit="°C" />
                        <VitalTile label="AVPU" value={String(selectedBundle.card.vitals.avpu)} />
                        <VitalTile label="SpO2" value={String(selectedBundle.card.vitals.spo2_percent ?? "—")} unit={selectedBundle.card.vitals.spo2_percent != null ? "%" : undefined} note="not scored by SATS" />
                      </div>
                      <Badge variant="outline" className="mt-3 font-mono text-[10px] text-muted-foreground">&quot;synthetic&quot;: true</Badge>
                    </div>
                  </RailStep>

                  {/* Step 2 — extraction */}
                  <RailStep
                    n={2}
                    state={selectedRun?.busy ? "busy" : selectedRun?.extraction ? "done" : "pending"}
                    title="Extraction"
                    note="complaint → SATS discriminator codes"
                  >
                    <div className="rounded-xl border bg-slate-50/60 p-4">
                      {selectedRun?.extraction ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            backend{" "}
                            <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
                              {selectedRun.extraction.backend}
                            </span>
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {selectedRun.extraction.discriminators.length === 0 && (
                              <span className="text-xs italic text-muted-foreground">no discriminators matched</span>
                            )}
                            {selectedRun.extraction.discriminators.map((c) => (
                              <Badge key={c} variant="outline" className={`border px-2 py-0.5 font-mono text-xs ${COLOUR_CLASS[DISCRIMINATORS[c]?.[0] ?? ""] ?? ""}`}>
                                {c} · {DISCRIMINATORS[c]?.[0]}
                              </Badge>
                            ))}
                            {selectedRun.extraction.rejected.map((c) => (
                              <Badge key={c} variant="outline" className="border-red-300 bg-red-50 font-mono text-xs text-red-700" title="unknown code - rejected">
                                rejected: {c}
                              </Badge>
                            ))}
                          </div>
                          {selectedRun.extraction.summary && (
                            <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{selectedRun.extraction.summary}</p>
                          )}
                          {selectedRun.extraction.guardrail_redactions.length > 0 && (
                            <p className="mt-1.5 text-xs font-medium text-amber-700">
                              guardrail redactions: {selectedRun.extraction.guardrail_redactions.join(", ")}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">
                          {selectedRun?.busy ? "reading the complaint…" : "waiting…"}
                        </p>
                      )}
                    </div>
                  </RailStep>

                  {/* Step 3 — cited score */}
                  <RailStep
                    n={3}
                    state={selectedRun?.draft || selectedRun?.escalated ? "done" : selectedRun?.busy ? "busy" : "pending"}
                    title="Cited score"
                    note="deterministic SATS/TEWS — never the model's opinion"
                    last
                  >
                    {selectedRun?.draft ? (
                      <div className="overflow-hidden rounded-xl border shadow-sm">
                        {/* dark score banner */}
                        <div className="command-bar flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 text-white">
                          <ColourChip colour={selectedRun.draft.colour} big />
                          <div>
                            <p className="font-mono text-3xl font-bold leading-none tabular-nums">{selectedRun.draft.tews}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/50">TEWS</p>
                          </div>
                          <SatsLocator colour={selectedRun.draft.colour} dark />
                          <p className="text-xs text-white/60">
                            target <b className="font-semibold text-white">{selectedRun.draft.target_time}</b>
                          </p>
                          <span className="ml-auto rounded-md border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-200">
                            DRAFT — not queued
                          </span>
                        </div>
                        <div className="bg-white px-4 py-3.5">
                          <p className="text-xs leading-relaxed text-muted-foreground">{selectedRun.draft.override_reason}</p>
                          <details className="group mt-3">
                            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-teal-800 transition-colors hover:bg-slate-100">
                              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                              component citations ({selectedRun.draft.components.length}) · discriminator citations ({selectedRun.draft.discriminators.length})
                            </summary>
                            <div className="mt-3 overflow-x-auto rounded-lg border bg-white">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="border-b bg-slate-50 text-left uppercase tracking-wider text-muted-foreground">
                                    <th className="px-3 py-2 font-semibold">Parameter</th>
                                    <th className="px-3 py-2 font-semibold">Value</th>
                                    <th className="px-3 py-2 font-semibold">Pts</th>
                                    <th className="px-3 py-2 font-semibold">Chart band</th>
                                    <th className="px-3 py-2 font-semibold">Source</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedRun.draft.components.map((c, i) => (
                                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50/60">
                                      <td className="px-3 py-1.5 font-medium text-slate-800">{c.parameter}</td>
                                      <td className="px-3 py-1.5 font-mono">{String(c.value)}</td>
                                      <td className="px-3 py-1.5">
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className={`h-2 w-2 rounded-full ${POINTS_DOT[Math.min(c.points, 3)]}`} />
                                          <span className="font-mono font-semibold">{c.points}</span>
                                        </span>
                                      </td>
                                      <td className="px-3 py-1.5 text-muted-foreground">{c.band_on_chart}</td>
                                      <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">{c.source_field} · {c.scale_reference}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-2 space-y-1 rounded-lg border bg-slate-50/80 p-3 font-mono text-[11px] text-slate-600">
                              {selectedRun.draft.discriminators.map((d, i) => (
                                <p key={i} className="flex items-start gap-2">
                                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT_BY_COLOUR[d.colour] ?? "bg-slate-300"}`} />
                                  <span className="jsonl-row">
                                    <b className="text-slate-800">{d.code} ({d.colour})</b> ← {d.citation}
                                  </span>
                                </p>
                              ))}
                            </div>
                          </details>
                        </div>
                      </div>
                    ) : selectedRun?.escalated ? (
                      <Alert className="border-amber-300 bg-amber-50 shadow-sm">
                        <ShieldAlert className="h-4 w-4 text-amber-700" />
                        <AlertTitle className="text-sm font-semibold text-amber-900">{String(selectedRun.escalated.status)}</AlertTitle>
                        <AlertDescription className="text-sm leading-relaxed text-amber-900">
                          {String(selectedRun.escalated.reason ?? "")}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="rounded-xl border border-dashed bg-white/50 p-4 text-xs italic text-muted-foreground">
                        {selectedRun?.busy ? "scoring on the cited chart…" : "waiting…"}
                      </div>
                    )}
                  </RailStep>

                  {/* Step 4 — human gate */}
                  <RailStep
                    n={4}
                    state={selectedRun?.confirmed ? "done" : "pending"}
                    title="Human gate"
                    note="publish — irreversible, block-by-default"
                    last
                  >
                    <div className="rounded-xl border border-amber-300/70 bg-gradient-to-b from-amber-50/90 to-white p-4 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 ring-1 ring-amber-300">
                          <LockKeyhole className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-amber-900">
                            Publish is irreversible — a named clinician must approve every priority.
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/80">
                            Nothing reaches the queue board without this gate. Empty names are BLOCKED and logged.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1">
                          <Label htmlFor="clinician" className="flex items-center gap-1.5 text-xs">
                            Named clinician <span className="text-muted-foreground">(required)</span>
                          </Label>
                          <Input
                            id="clinician"
                            value={clinician}
                            onChange={(e) => setClinician(e.target.value)}
                            placeholder="e.g. Sr. A. Wanjiru (Triage Nurse)"
                            className="border-amber-200 bg-white focus-visible:ring-amber-600/30"
                          />
                        </div>
                        <Button
                          onClick={() => selected && confirmPatient(selected)}
                          disabled={!selectedRun?.draft || !!selectedRun?.confirmed}
                          className="gap-1.5 shadow-sm"
                        >
                          <HeartPulse className="h-4 w-4" /> Confirm priority
                        </Button>
                      </div>
                      {selectedRun?.gateNotice && (
                        <Alert variant="destructive" className="mt-3 border-red-300 bg-red-50">
                          <XCircle className="h-4 w-4 text-red-700" />
                          <AlertTitle className="text-sm font-semibold text-red-800">BLOCKED — gate decision logged</AlertTitle>
                          <AlertDescription className="text-sm leading-relaxed text-red-800">
                            {selectedRun.gateNotice} Nothing reached the queue. Enter a named clinician and confirm again.
                          </AlertDescription>
                        </Alert>
                      )}
                      {selectedRun?.confirmed && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            <b className="font-semibold">CONFIRMED</b> by {selectedRun.confirmed.confirmed_by} at{" "}
                            <span className="font-mono">{selectedRun.confirmed.confirmed_at}</span> — priority is live on the queue board.
                          </span>
                        </div>
                      )}
                      {selectedBundle.recheck && selectedRun?.confirmed && (
                        <div className="mt-3.5 rounded-lg border border-dashed border-slate-300 bg-white/80 p-3.5">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <GitCompareArrows className="h-4 w-4 text-teal-800" />
                            Deterioration watch — re-check vitals available for this patient
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            A second look, not a verdict: the flag cites both vital sets and never changes the priority.
                          </p>
                          <Button size="sm" variant="outline" className="mt-2.5 gap-1.5 bg-white" onClick={() => selected && raiseRecheck(selected)}>
                            Raise re-check flag
                          </Button>
                          {selectedRun.flag && (
                            <pre className="quiet-scroll dark-terminal mt-2.5 max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                              {JSON.stringify(selectedRun.flag, null, 1)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </RailStep>
                </CardContent>
              </Card>
            )}

            {/* Queue board — confirmed priorities only */}
            <Card className="shadow-sm ring-1 ring-slate-950/5">
              <CardHeader className="border-b bg-slate-50/80 py-3.5">
                <CardTitle className="text-[15px]">
                  Queue board
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    confirmed priorities only — RED → ORANGE → YELLOW → GREEN · TEWS desc · longest wait first
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                {board.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-white/60 px-4 py-10 text-center">
                    <ListOrdered className="mx-auto h-6 w-6 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">Nothing confirmed yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      Drafts never position patients — the clinician gate decides. Confirm a draft above to seat it here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          <th className="py-2.5 pl-4 pr-3 font-semibold">#</th>
                          <th className="py-2.5 pr-3 font-semibold">Patient</th>
                          <th className="py-2.5 pr-3 font-semibold">Priority</th>
                          <th className="py-2.5 pr-3 font-semibold">TEWS</th>
                          <th className="py-2.5 pr-3 font-semibold">Target</th>
                          <th className="py-2.5 pr-3 font-semibold">Wait</th>
                          <th className="py-2.5 pr-3 font-semibold">Key vitals (citations)</th>
                          <th className="py-2.5 pr-4 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {board.map((c, i) => (
                          <tr
                            key={c.patient_ref}
                            className={`border-b border-l-4 bg-white transition-colors last:border-0 hover:bg-slate-50/60 ${SPINE[c.colour] ?? "border-l-slate-300"}`}
                          >
                            <td className="py-2.5 pl-4 pr-3">
                              <span
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                                  i === 0 ? "bg-teal-900 text-white shadow-sm" : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {i + 1}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 font-mono text-[13px] font-bold text-slate-900">{c.patient_ref}</td>
                            <td className="py-2.5 pr-3"><ColourChip colour={c.colour} /></td>
                            <td className="py-2.5 pr-3 font-mono font-semibold tabular-nums">{c.tews}</td>
                            <td className="py-2.5 pr-3 text-slate-600">{c.target_time}</td>
                            <td className="py-2.5 pr-3 tabular-nums text-slate-600">{c.wait_minutes_at_triage} min</td>
                            <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                              {Object.entries(c.key_vitals).map(([k, v]) => `${k} ${String(v)}`).join(", ")}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> CONFIRMED
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {pendingDrafts.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {pendingDrafts.length} draft(s) pending clinician confirmation — never positioned.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Audit trail + gate ledger */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-sm ring-1 ring-slate-950/5">
                <CardHeader className="flex flex-row items-center justify-between gap-2 border-b bg-slate-50/80 py-3.5">
                  <CardTitle className="text-[15px]">
                    Audit trail <span className="text-xs font-normal text-muted-foreground">{audit.length} tool calls — nothing hidden</span>
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={downloadAudit} className="gap-1.5 bg-white">
                    <Download className="h-3.5 w-3.5" /> audit_log.jsonl
                  </Button>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
                    <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">mcp · jsonl</span>
                    </div>
                    <ScrollArea className="h-72">
                      <div className="space-y-1 p-3.5 font-mono text-[11px] leading-relaxed text-slate-200">
                        {audit.length === 0 && <p className="text-slate-500">no calls yet</p>}
                        {audit.map((e, i) => (
                          <p key={i} className="jsonl-row">
                            <span className="text-slate-500">{e.ts.slice(11, 19)}</span>{" "}
                            <span className="font-semibold text-sky-300">{e.tool}</span>{" "}
                            <span className="text-slate-400">{JSON.stringify(e.args)}</span>{" "}
                            <span className="text-emerald-300">{typeof e.result?.status === "string" ? e.result.status : ""}</span>
                          </p>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm ring-1 ring-slate-950/5">
                <CardHeader className="border-b bg-slate-50/80 py-3.5">
                  <CardTitle className="text-[15px]">
                    Gate ledger <span className="text-xs font-normal text-muted-foreground">who, what, when</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <ScrollArea className="h-72">
                    <div className="space-y-2 pr-2">
                      {ledger.length === 0 && (
                        <div className="rounded-xl border border-dashed bg-white/60 px-4 py-8 text-center">
                          <LockKeyhole className="mx-auto h-5 w-5 text-slate-300" />
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            no gate decisions yet — try confirming with an empty name to see the block
                          </p>
                        </div>
                      )}
                      {ledger.map((e, i) => (
                        <div
                          key={i}
                          className={`rounded-lg border border-l-4 bg-white p-3 shadow-sm ${
                            e.decision === "APPROVED" ? "border-l-emerald-600" : "border-l-red-600"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className={`flex items-center gap-1.5 text-sm font-bold ${e.decision === "APPROVED" ? "text-emerald-700" : "text-red-700"}`}>
                              {e.decision === "APPROVED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              {e.decision}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground">{e.ts.slice(11, 19)}</p>
                          </div>
                          {e.clinician && <p className="mt-0.5 text-xs font-medium text-slate-700">{e.clinician}</p>}
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{e.reason}</p>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{e.action} · {e.artifact}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <footer className="border-t bg-white/70">
        <div className="mx-auto max-w-7xl px-4 py-6 text-xs leading-relaxed text-muted-foreground sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="SATS colour legend">
            <span className="flex items-center gap-2 font-semibold uppercase tracking-[0.12em] text-slate-500">
              <MstariPulse className="h-4 w-4" idSuffix="footer" />
              Mstari · SATS bands
            </span>
            {SATS_SPECTRUM.map((s) => (
              <span key={s.colour} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${s.bar}`} aria-hidden />
                <b className="font-mono text-[11px] font-semibold text-slate-700">{s.colour}</b>
                <span>{s.label}</span>
              </span>
            ))}
          </div>
          <p className="mt-3">
            Hosted mirror of the repo&apos;s agent pipeline — the real MCP server (6 tools, 2 gated), LangGraph orchestration and local open-weights Qwen lane run from the repo:{" "}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">./run_demo.sh &quot;Sr. A. Wanjiru (Triage Nurse)&quot;</span>. All data here is synthetic; no PHI exists.
          </p>
          <p className="mt-1.5">
            <span className="font-medium text-slate-700">github.com/Roy-Wanyoike/mstari-triage</span> · MIT · Agentic AI for Africa Innovation Challenge — Healthcare: The Triage Desk
          </p>
        </div>
      </footer>
    </div>
  );
}
