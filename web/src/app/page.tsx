"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ShieldAlert, PlayCircle, Loader2, Download, HeartPulse, GitCompareArrows, Database,
  Activity, Clock3, CheckCircle2, XCircle, FileClock, LockKeyhole, Stethoscope, ListOrdered,
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

/* ---- Mstari visual system: SATS colours are the interface's first language ---- */

const COLOUR_CLASS: Record<string, string> = {
  RED: "bg-red-50 text-red-700 border-red-200",
  ORANGE: "bg-orange-50 text-orange-700 border-orange-200",
  YELLOW: "bg-amber-50 text-amber-800 border-amber-200",
  GREEN: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const COLOUR_SOLID: Record<string, string> = {
  RED: "bg-red-600 text-white shadow-sm shadow-red-600/30",
  ORANGE: "bg-orange-500 text-white shadow-sm shadow-orange-500/30",
  YELLOW: "bg-amber-400 text-amber-950 shadow-sm shadow-amber-400/30",
  GREEN: "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30",
};

const SPINE: Record<string, string> = {
  RED: "border-l-red-600",
  ORANGE: "border-l-orange-500",
  YELLOW: "border-l-amber-400",
  GREEN: "border-l-emerald-600",
};

const POINTS_DOT = ["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-600"];

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

function BrandMark() {
  return (
    <div className="flex h-11 w-11 flex-col justify-center gap-[5px] rounded-xl bg-slate-900 px-2.5 py-3 shadow-md shadow-slate-900/20">
      <span className="h-[3px] rounded-full bg-red-500" />
      <span className="h-[3px] rounded-full bg-amber-400" />
      <span className="h-[3px] rounded-full bg-emerald-500" />
    </div>
  );
}

function StepHeading({ n, title, note }: { n: number; title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 font-mono text-[11px] font-bold text-white shadow-sm">
        {n}
      </span>
      <h3 className="text-sm font-semibold tracking-tight text-slate-800">{title}</h3>
      {note && <span className="hidden truncate text-xs text-muted-foreground sm:block">— {note}</span>}
    </div>
  );
}

function VitalTile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold leading-tight text-slate-900">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
      {note && <p className="text-[10px] leading-tight text-amber-700">{note}</p>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: number | string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight tabular-nums text-slate-900">{value}</p>
      </div>
    </div>
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

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(1200px_500px_at_50%_-10%,oklch(0.93_0.03_195),transparent)]">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-20 border-b bg-white/85 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <BrandMark />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[1.35rem]">
                  Mstari <span className="font-light text-slate-400">—</span>{" "}
                  <span className="text-teal-800">the Triage Desk</span>
                </h1>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Agentic triage queue for a busy public OPD · hosted demo mirror
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5 border-slate-300 bg-white py-1 font-mono text-xs">
                <Database className="h-3 w-3 text-teal-700" />
                <span className="text-muted-foreground">storage:</span> {storageLabel}
              </Badge>
              <Badge variant="outline" className="hidden border-slate-300 bg-white py-1 text-xs text-muted-foreground md:inline-flex">
                Agentic AI for Africa Challenge · healthcare track
              </Badge>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-300/80 bg-amber-50 px-3.5 py-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-xs leading-relaxed text-amber-900">
              <b className="font-semibold">Scope — enforced in code, not in prose.</b> {SCOPE_BANNER}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6">
        {/* ---------- Stats strip ---------- */}
        <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={ListOrdered} label="synthetic patients" value={BUNDLED_PATIENTS.length} tone="bg-teal-50 text-teal-700" />
          <StatCard icon={Activity} label="runs started" value={runsStarted} tone="bg-sky-50 text-sky-700" />
          <StatCard icon={CheckCircle2} label="confirmed on board" value={board.length} tone="bg-emerald-50 text-emerald-700" />
          <StatCard icon={Clock3} label="drafts pending gate" value={pendingDrafts.length} tone="bg-amber-50 text-amber-700" />
          <StatCard icon={FileClock} label="audit events" value={audit.length} tone="bg-slate-100 text-slate-700" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* LEFT: patient queue */}
          <Card className="self-start shadow-sm">
            <CardHeader className="border-b bg-slate-50/70 pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-teal-700" />
                  Patient queue <span className="text-xs font-normal text-muted-foreground">(synthetic)</span>
                </span>
                <Button size="sm" onClick={runAll} disabled={queueBusy} className="gap-1.5 shadow-sm">
                  {queueBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Run all
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[560px] px-3 py-3">
                <div className="space-y-2">
                  {BUNDLED_PATIENTS.map(({ card }) => {
                    const run = runs[card.patient_ref];
                    const colour = run?.confirmed?.colour ?? run?.draft?.colour;
                    const isSel = selected === card.patient_ref;
                    return (
                      <button
                        key={card.patient_ref}
                        onClick={() => { setSelected(card.patient_ref); if (!run && !queueBusy) runPipeline(card.patient_ref, card); }}
                        className={`w-full rounded-xl border border-l-4 bg-white p-3 text-left transition-all hover:-translate-y-px hover:shadow-md ${
                          colour ? `${SPINE[colour]} ` : "border-l-slate-300 "
                        }${isSel ? "border-teal-700/50 ring-2 ring-teal-700/15 shadow-md" : "shadow-sm"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">{card.patient_ref}</span>
                          {run?.busy ? (
                            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                          ) : colour ? (
                            <ColourChip colour={colour} />
                          ) : run?.escalated ? (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-xs text-amber-800">escalated</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">not run</Badge>
                          )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{card.complaint_text}</p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          age {card.age_years} · {card.sex ?? "?"} ·
                          <Clock3 className="h-3 w-3" /> waiting {card.wait_minutes_at_triage ?? 0} min
                        </p>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* RIGHT: pipeline workspace */}
          <div className="space-y-6">
            {!selectedBundle && (
              <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
                <Stethoscope className="mx-auto h-10 w-10 text-teal-700/40" />
                <p className="mt-4 text-sm font-medium text-slate-700">Select a patient on the left</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  The desk runs ingestion &rarr; extraction &rarr; cited scoring, then stops at the clinician gate —
                  exactly where a human takes over.
                </p>
              </div>
            )}

            {selectedBundle && (
              <Card className="shadow-sm">
                <CardHeader className="border-b bg-slate-50/70 pb-3">
                  <CardTitle className="text-base">
                    Pipeline <span className="font-mono text-teal-800">{selectedBundle.card.patient_ref}</span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">every step is logged to the audit trail below</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-5">

                  {/* Step 1 ingestion */}
                  <section>
                    <StepHeading n={1} title="Ingestion" note="parse_intake_record" />
                    <div className="mt-2.5 rounded-xl border bg-slate-50/50 p-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">{selectedBundle.card.patient_ref}</span>
                        <Badge variant="outline" className="bg-white text-xs">age {selectedBundle.card.age_years}</Badge>
                        <Badge variant="outline" className="bg-white text-xs">sex {selectedBundle.card.sex ?? "?"}</Badge>
                        <Badge variant="outline" className="bg-white text-xs">mobility {selectedBundle.card.mobility}</Badge>
                        <Badge variant="outline" className="bg-white text-xs">wait {String(selectedBundle.card.wait_minutes_at_triage ?? 0)} min</Badge>
                      </div>
                      <blockquote className="mt-3 border-l-2 border-teal-700/50 pl-3 text-sm italic leading-relaxed text-slate-700">
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
                  </section>

                  {/* Step 2 extraction */}
                  <section>
                    <StepHeading n={2} title="Extraction" note="complaint → SATS discriminator codes" />
                    <div className="mt-2.5 rounded-xl border bg-slate-50/50 p-4">
                      {selectedRun?.extraction ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            backend <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">{selectedRun.extraction.backend}</span>
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {selectedRun.extraction.discriminators.length === 0 && <span className="text-xs text-muted-foreground">no discriminators matched</span>}
                            {selectedRun.extraction.discriminators.map((c) => (
                              <Badge key={c} variant="outline" className={`border px-2 py-0.5 font-mono text-xs ${COLOUR_CLASS[DISCRIMINATORS[c]?.[0] ?? ""] ?? ""}`}>
                                {c} · {DISCRIMINATORS[c]?.[0]}
                              </Badge>
                            ))}
                            {selectedRun.extraction.rejected.map((c) => (
                              <Badge key={c} variant="outline" className="border-red-300 bg-red-50 font-mono text-xs text-red-700" title="unknown code - rejected">rejected: {c}</Badge>
                            ))}
                          </div>
                          {selectedRun.extraction.summary && <p className="mt-2.5 text-xs text-muted-foreground">{selectedRun.extraction.summary}</p>}
                          {selectedRun.extraction.guardrail_redactions.length > 0 && (
                            <p className="mt-1.5 text-xs font-medium text-amber-700">guardrail redactions: {selectedRun.extraction.guardrail_redactions.join(", ")}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">waiting…</p>
                      )}
                    </div>
                  </section>

                  {/* Step 3 score */}
                  <section>
                    <StepHeading n={3} title="Cited score" note="deterministic SATS/TEWS — never the model's opinion" />
                    {selectedRun?.draft ? (
                      <div className="mt-2.5 overflow-hidden rounded-xl border">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-slate-50/80 px-4 py-3">
                          <ColourChip colour={selectedRun.draft.colour} big />
                          <div>
                            <p className="font-mono text-2xl font-bold leading-none text-slate-900">{selectedRun.draft.tews}</p>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">TEWS</p>
                          </div>
                          <Separator orientation="vertical" className="hidden h-8 sm:block" />
                          <p className="text-sm text-slate-600">target <b className="text-slate-900">{selectedRun.draft.target_time}</b></p>
                          <Badge variant="outline" className="ml-auto font-mono text-xs">DRAFT</Badge>
                        </div>
                        <div className="px-4 py-3">
                          <p className="text-xs leading-relaxed text-muted-foreground">{selectedRun.draft.override_reason}</p>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-teal-800 hover:text-teal-900">
                              component citations ({selectedRun.draft.components.length}) + discriminator citations ({selectedRun.draft.discriminators.length})
                            </summary>
                            <div className="mt-3 overflow-x-auto rounded-lg border bg-white">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-slate-50 text-left uppercase tracking-wide text-muted-foreground">
                                    <th className="px-3 py-2 font-semibold">Parameter</th>
                                    <th className="px-3 py-2 font-semibold">Value</th>
                                    <th className="px-3 py-2 font-semibold">Pts</th>
                                    <th className="px-3 py-2 font-semibold">Chart band</th>
                                    <th className="px-3 py-2 font-semibold">Source</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedRun.draft.components.map((c, i) => (
                                    <tr key={i} className="border-b last:border-0">
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
                            <div className="mt-2 space-y-1 rounded-lg border bg-white p-3 font-mono text-[11px] text-muted-foreground">
                              {selectedRun.draft.discriminators.map((d, i) => (
                                <p key={i}><span className="font-semibold text-slate-700">{d.code} ({d.colour})</span> ← {d.citation}</p>
                              ))}
                            </div>
                          </details>
                        </div>
                      </div>
                    ) : selectedRun?.escalated ? (
                      <Alert className="mt-2.5 border-amber-300 bg-amber-50">
                        <AlertTitle className="text-sm text-amber-900">{String(selectedRun.escalated.status)}</AlertTitle>
                        <AlertDescription className="text-sm text-amber-900">{String(selectedRun.escalated.reason ?? "")}</AlertDescription>
                      </Alert>
                    ) : (
                      <div className="mt-2.5 rounded-xl border bg-slate-50/50 p-4 text-xs text-muted-foreground">waiting…</div>
                    )}
                  </section>

                  {/* Step 4 gate */}
                  <section>
                    <StepHeading n={4} title="Human gate" note="publish — irreversible, block-by-default" />
                    <div className="mt-2.5 rounded-xl border border-amber-300/70 bg-gradient-to-b from-amber-50/80 to-white p-4">
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1">
                          <Label htmlFor="clinician" className="flex items-center gap-1.5 text-xs">
                            <LockKeyhole className="h-3.5 w-3.5 text-amber-700" />
                            Named clinician <span className="text-muted-foreground">(required — empty name is BLOCKED and logged)</span>
                          </Label>
                          <Input id="clinician" value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="e.g. Sr. A. Wanjiru (Triage Nurse)" className="bg-white" />
                        </div>
                        <Button onClick={() => selected && confirmPatient(selected)} disabled={!selectedRun?.draft || !!selectedRun?.confirmed} className="gap-1.5 shadow-sm">
                          <HeartPulse className="h-4 w-4" /> Confirm priority
                        </Button>
                      </div>
                      {selectedRun?.gateNotice && (
                        <Alert className="mt-3 border-red-300 bg-red-50">
                          <XCircle className="h-4 w-4 text-red-700" />
                          <AlertTitle className="text-sm text-red-800">BLOCKED — gate decision logged</AlertTitle>
                          <AlertDescription className="text-sm text-red-800">{selectedRun.gateNotice} Nothing reached the queue. Enter a named clinician and confirm again.</AlertDescription>
                        </Alert>
                      )}
                      {selectedRun?.confirmed && (
                        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          CONFIRMED by {selectedRun.confirmed.confirmed_by} at {selectedRun.confirmed.confirmed_at} — priority is on the live queue board.
                        </p>
                      )}
                      {selectedBundle.recheck && selectedRun?.confirmed && (
                        <div className="mt-3.5 rounded-lg border border-dashed border-slate-300 bg-white/70 p-3.5">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <GitCompareArrows className="h-4 w-4 text-teal-700" />
                            Deterioration watch — re-check vitals available for this patient
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            A second look, not a verdict: the flag cites both vital sets and never changes the priority.
                          </p>
                          <Button size="sm" variant="outline" className="mt-2.5 gap-1.5 bg-white" onClick={() => selected && raiseRecheck(selected)}>
                            Raise re-check flag
                          </Button>
                          {selectedRun.flag && (
                            <pre className="mt-2.5 max-h-40 overflow-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-200">{JSON.stringify(selectedRun.flag, null, 1)}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                </CardContent>
              </Card>
            )}

            {/* Queue board */}
            <Card className="shadow-sm">
              <CardHeader className="border-b bg-slate-50/70 pb-3">
                <CardTitle className="text-base">
                  Queue board <span className="text-xs font-normal text-muted-foreground">— confirmed priorities only (RED → ORANGE → YELLOW → GREEN, TEWS desc, longest wait first)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                {board.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-slate-50/50 px-4 py-6 text-center text-sm text-muted-foreground">
                    Nothing confirmed yet — drafts never position patients; the gate decides.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
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
                          <tr key={c.patient_ref} className={`border-b bg-white transition-colors last:border-0 hover:bg-slate-50/60 border-l-4 ${SPINE[c.colour] ?? "border-l-slate-300"}`}>
                            <td className="py-2.5 pl-4 pr-3">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{i + 1}</span>
                            </td>
                            <td className="py-2.5 pr-3 font-mono font-bold text-slate-900">{c.patient_ref}</td>
                            <td className="py-2.5 pr-3"><ColourChip colour={c.colour} /></td>
                            <td className="py-2.5 pr-3 font-mono font-semibold">{c.tews}</td>
                            <td className="py-2.5 pr-3 text-slate-600">{c.target_time}</td>
                            <td className="py-2.5 pr-3 tabular-nums text-slate-600">{c.wait_minutes_at_triage} min</td>
                            <td className="py-2.5 pr-3 text-xs text-muted-foreground">{Object.entries(c.key_vitals).map(([k, v]) => `${k} ${String(v)}`).join(", ")}</td>
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
                  <p className="mt-3 text-xs text-muted-foreground">{pendingDrafts.length} draft(s) pending clinician confirmation — never positioned.</p>
                )}
              </CardContent>
            </Card>

            {/* Audit + ledger */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/70 pb-3">
                  <CardTitle className="text-base">Audit trail <span className="text-xs font-normal text-muted-foreground">— every tool call</span></CardTitle>
                  <Button size="sm" variant="outline" onClick={downloadAudit} className="gap-1.5 bg-white">
                    <Download className="h-3.5 w-3.5" /> audit_log.jsonl
                  </Button>
                </CardHeader>
                <CardContent className="pt-5">
                  <ScrollArea className="h-72 rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                    <div className="space-y-1 font-mono text-[11px] leading-relaxed text-slate-200">
                      {audit.length === 0 && <p className="text-slate-500">no calls yet</p>}
                      {audit.map((e, i) => (
                        <p key={i} className="break-all">
                          <span className="text-slate-500">{e.ts.slice(11, 19)}</span>{" "}
                          <span className="font-semibold text-sky-300">{e.tool}</span>{" "}
                          <span className="text-slate-400">{JSON.stringify(e.args)}</span>{" "}
                          <span className="text-emerald-300">{typeof e.result?.status === "string" ? e.result.status : ""}</span>
                        </p>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="border-b bg-slate-50/70 pb-3">
                  <CardTitle className="text-base">Gate ledger <span className="text-xs font-normal text-muted-foreground">— who, what, when</span></CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <ScrollArea className="h-72">
                    <div className="space-y-2 pr-2">
                      {ledger.length === 0 && (
                        <p className="rounded-lg border border-dashed bg-slate-50/50 px-4 py-6 text-center text-xs text-muted-foreground">
                          no gate decisions yet — try confirming with an empty name to see the block
                        </p>
                      )}
                      {ledger.map((e, i) => (
                        <div key={i} className={`rounded-lg border border-l-4 bg-white p-2.5 shadow-sm ${e.decision === "APPROVED" ? "border-l-emerald-600" : "border-l-red-600"}`}>
                          <p className="font-mono text-[11px] text-muted-foreground">{e.ts.slice(11, 19)} · {e.action} · {e.artifact}</p>
                          <p className={`mt-0.5 flex items-center gap-1 text-sm font-bold ${e.decision === "APPROVED" ? "text-emerald-700" : "text-red-700"}`}>
                            {e.decision === "APPROVED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                            {e.decision}{e.clinician ? ` — ${e.clinician}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{e.reason}</p>
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

      <footer className="mt-auto border-t bg-white/70">
        <div className="mx-auto max-w-7xl px-4 py-5 text-xs leading-relaxed text-muted-foreground sm:px-6">
          <p>
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
