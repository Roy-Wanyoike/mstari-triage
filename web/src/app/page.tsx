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
import { ShieldAlert, PlayCircle, Loader2, Download, HeartPulse, GitCompareArrows, Database } from "lucide-react";
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

const COLOUR_CLASS: Record<string, string> = {
  RED: "bg-red-100 text-red-800 border-red-300",
  ORANGE: "bg-orange-100 text-orange-800 border-orange-300",
  YELLOW: "bg-yellow-100 text-yellow-900 border-yellow-300",
  GREEN: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

function ColourChip({ colour }: { colour: string }) {
  return (
    <Badge variant="outline" className={`font-bold border ${COLOUR_CLASS[colour] ?? ""}`}>
      {colour}
    </Badge>
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

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Mstari — the Triage Desk</h1>
              <p className="text-sm text-muted-foreground">Agentic triage queue for a busy public OPD · hosted demo mirror</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 font-mono text-xs">
                <Database className="h-3 w-3" />
                storage: {storageLabel}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">Agentic AI for Africa Challenge · healthcare track</Badge>
            </div>
          </div>
          <Alert className="mt-3 border-amber-300 bg-amber-50">
            <ShieldAlert className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-amber-900 text-sm">Scope — enforced in code, not in prose</AlertTitle>
            <AlertDescription className="text-amber-900 text-sm">{SCOPE_BANNER}</AlertDescription>
          </Alert>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[380px,1fr]">
          {/* LEFT: patient queue */}
          <Card className="self-start">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span>Patient queue (synthetic)</span>
                <Button size="sm" variant="outline" onClick={runAll} disabled={queueBusy} className="gap-1.5">
                  {queueBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Run all
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[520px] px-4 pb-4">
                <div className="space-y-2">
                  {BUNDLED_PATIENTS.map(({ card }) => {
                    const run = runs[card.patient_ref];
                    const colour = run?.confirmed?.colour ?? run?.draft?.colour;
                    return (
                      <button
                        key={card.patient_ref}
                        onClick={() => { setSelected(card.patient_ref); if (!run && !queueBusy) runPipeline(card.patient_ref, card); }}
                        className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/60 ${selected === card.patient_ref ? "border-foreground/40 bg-muted/40" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-semibold">{card.patient_ref}</span>
                          {run?.busy ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : colour ? (
                            <ColourChip colour={colour} />
                          ) : run?.escalated ? (
                            <Badge variant="outline" className="text-xs">escalated</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">not run</Badge>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.complaint_text}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          age {card.age_years} · {card.sex ?? "?"} · wait {card.wait_minutes_at_triage ?? 0} min
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
              <Card>
                <CardContent className="py-16 text-center text-sm text-muted-foreground">
                  Select a patient on the left — the desk runs ingestion → extraction → cited scoring, then stops at the clinician gate.
                </CardContent>
              </Card>
            )}

            {selectedBundle && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Pipeline — {selectedBundle.card.patient_ref}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">every step is logged to the audit trail below</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Step 1 ingestion */}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Ingestion — parse_intake_record</p>
                      <div className="rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                          <span><b>{selectedBundle.card.patient_ref}</b></span>
                          <span>age {selectedBundle.card.age_years}</span>
                          <span>sex {selectedBundle.card.sex ?? "?"}</span>
                          <span>mobility {selectedBundle.card.mobility}</span>
                          <span>wait {String(selectedBundle.card.wait_minutes_at_triage ?? 0)} min</span>
                        </div>
                        <Separator className="my-2" />
                        <p className="text-xs text-muted-foreground">complaint_text</p>
                        <p className="italic">&ldquo;{selectedBundle.card.complaint_text}&rdquo;</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          vitals: resp {String(selectedBundle.card.vitals.resp_rate)} · HR {String(selectedBundle.card.vitals.heart_rate)} · SBP {String(selectedBundle.card.vitals.sbp)} · temp {String(selectedBundle.card.vitals.temp_c)}°C · AVPU {String(selectedBundle.card.vitals.avpu)} · SpO2 {selectedBundle.card.vitals.spo2_percent ?? "—"} (not scored by SATS)
                        </p>
                        <Badge variant="outline" className="mt-2 font-mono text-[10px]">&quot;synthetic&quot;: true</Badge>
                      </div>
                    </div>
                    {/* Step 2 extraction */}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Extraction — complaint → SATS discriminator codes</p>
                      <div className="rounded-md border bg-muted/30 p-3 text-sm">
                        {selectedRun?.extraction ? (
                          <>
                            <p className="text-xs text-muted-foreground">backend: <span className="font-mono">{selectedRun.extraction.backend}</span></p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {selectedRun.extraction.discriminators.length === 0 && <span className="text-xs text-muted-foreground">no discriminators matched</span>}
                              {selectedRun.extraction.discriminators.map((c) => (
                                <Badge key={c} variant="outline" className={`border ${COLOUR_CLASS[DISCRIMINATORS[c]?.[0] ?? ""] ?? ""} font-mono text-xs`}>
                                  {c} · {DISCRIMINATORS[c]?.[0]}
                                </Badge>
                              ))}
                              {selectedRun.extraction.rejected.map((c) => (
                                <Badge key={c} variant="outline" className="border-red-300 bg-red-50 font-mono text-xs text-red-700" title="unknown code - rejected">rejected: {c}</Badge>
                              ))}
                            </div>
                            {selectedRun.extraction.summary && <p className="mt-2 text-xs text-muted-foreground">{selectedRun.extraction.summary}</p>}
                            {selectedRun.extraction.guardrail_redactions.length > 0 && (
                              <p className="mt-1 text-xs text-amber-700">guardrail redactions: {selectedRun.extraction.guardrail_redactions.join(", ")}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">waiting…</p>
                        )}
                      </div>
                    </div>
                    {/* Step 3 score */}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Cited score — deterministic SATS/TEWS (never the model&apos;s opinion)</p>
                      {selectedRun?.draft ? (
                        <div className="rounded-md border bg-muted/30 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-3">
                            <ColourChip colour={selectedRun.draft.colour} />
                            <span>TEWS {selectedRun.draft.tews}</span>
                            <span className="text-muted-foreground">target {selectedRun.draft.target_time}</span>
                            <Badge variant="outline" className="text-xs">DRAFT</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{selectedRun.draft.override_reason}</p>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium">component citations ({selectedRun.draft.components.length}) + discriminator citations ({selectedRun.draft.discriminators.length})</summary>
                            <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
                              {selectedRun.draft.components.map((c, i) => (
                                <p key={i}>{c.source_field} → {c.points} pt ({c.band_on_chart}) — {c.scale_reference}</p>
                              ))}
                              {selectedRun.draft.discriminators.map((d, i) => (
                                <p key={`d${i}`}>{d.code} ({d.colour}) ← {d.citation}</p>
                              ))}
                            </div>
                          </details>
                        </div>
                      ) : selectedRun?.escalated ? (
                        <Alert className="border-amber-300 bg-amber-50">
                          <AlertTitle className="text-sm text-amber-900">{String(selectedRun.escalated.status)}</AlertTitle>
                          <AlertDescription className="text-sm text-amber-900">{String(selectedRun.escalated.reason ?? "")}</AlertDescription>
                        </Alert>
                      ) : (
                        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">waiting…</div>
                      )}
                    </div>
                    {/* Step 4 gate */}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">4 · Human gate — publish (irreversible, block-by-default)</p>
                      <div className="rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="flex-1 space-y-1">
                            <Label htmlFor="clinician" className="text-xs">Named clinician (required — empty name is BLOCKED and logged)</Label>
                            <Input id="clinician" value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="e.g. Sr. A. Wanjiru (Triage Nurse)" />
                          </div>
                          <Button onClick={() => selected && confirmPatient(selected)} disabled={!selectedRun?.draft || !!selectedRun?.confirmed} className="gap-1.5">
                            <HeartPulse className="h-4 w-4" /> Confirm priority
                          </Button>
                        </div>
                        {selectedRun?.gateNotice && (
                          <Alert className="mt-3 border-red-300 bg-red-50">
                            <AlertTitle className="text-sm text-red-800">BLOCKED — gate decision logged</AlertTitle>
                            <AlertDescription className="text-sm text-red-800">{selectedRun.gateNotice} Nothing reached the queue. Enter a named clinician and confirm again.</AlertDescription>
                          </Alert>
                        )}
                        {selectedRun?.confirmed && (
                          <p className="mt-2 text-xs text-emerald-700">
                            CONFIRMED by {selectedRun.confirmed.confirmed_by} at {selectedRun.confirmed.confirmed_at} — priority is on the live queue board.
                          </p>
                        )}
                        {selectedBundle.recheck && selectedRun?.confirmed && (
                          <div className="mt-3 rounded-md border border-dashed p-3">
                            <p className="text-xs font-semibold">Deterioration watch — re-check vitals available for this patient</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              A second look, not a verdict: the flag cites both vital sets and never changes the priority.
                            </p>
                            <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => selected && raiseRecheck(selected)}>
                              <GitCompareArrows className="h-4 w-4" /> Raise re-check flag
                            </Button>
                            {selectedRun.flag && (
                              <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/60 p-2 font-mono text-[11px]">{JSON.stringify(selectedRun.flag, null, 1)}</pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Queue board */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Queue board — confirmed priorities only <span className="text-xs font-normal text-muted-foreground">(RED → ORANGE → YELLOW → GREEN, TEWS desc, longest wait first)</span></CardTitle>
              </CardHeader>
              <CardContent>
                {board.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing confirmed yet — drafts never position patients; the gate decides.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3">#</th>
                          <th className="py-2 pr-3">Patient</th>
                          <th className="py-2 pr-3">Colour</th>
                          <th className="py-2 pr-3">TEWS</th>
                          <th className="py-2 pr-3">Target</th>
                          <th className="py-2 pr-3">Wait</th>
                          <th className="py-2 pr-3">Key vitals (citations)</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {board.map((c, i) => (
                          <tr key={c.patient_ref} className="border-b last:border-0">
                            <td className="py-2 pr-3">{i + 1}</td>
                            <td className="py-2 pr-3 font-mono font-semibold">{c.patient_ref}</td>
                            <td className="py-2 pr-3"><ColourChip colour={c.colour} /></td>
                            <td className="py-2 pr-3">{c.tews}</td>
                            <td className="py-2 pr-3">{c.target_time}</td>
                            <td className="py-2 pr-3">{c.wait_minutes_at_triage}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{Object.entries(c.key_vitals).map(([k, v]) => `${k} ${String(v)}`).join(", ")}</td>
                            <td className="py-2 text-xs font-semibold text-emerald-700">CONFIRMED</td>
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
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Audit trail — every tool call</CardTitle>
                  <Button size="sm" variant="outline" onClick={downloadAudit} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> audit_log.jsonl
                  </Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-72 rounded-md border bg-slate-950 p-3">
                    <div className="space-y-1 font-mono text-[11px] leading-relaxed text-slate-200">
                      {audit.length === 0 && <p className="text-slate-500">no calls yet</p>}
                      {audit.map((e, i) => (
                        <p key={i} className="break-all">
                          <span className="text-slate-500">{e.ts.slice(11, 19)}</span>{" "}
                          <span className="text-sky-300">{e.tool}</span>{" "}
                          <span className="text-slate-400">{JSON.stringify(e.args)}</span>{" "}
                          <span className="text-emerald-300">{typeof e.result?.status === "string" ? e.result.status : ""}</span>
                        </p>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Gate ledger — who, what, when</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-72 rounded-md border p-3">
                    <div className="space-y-2 text-xs">
                      {ledger.length === 0 && <p className="text-muted-foreground">no gate decisions yet — try confirming with an empty name to see the block</p>}
                      {ledger.map((e, i) => (
                        <div key={i} className="rounded-md border p-2">
                          <p className="font-mono">{e.ts.slice(11, 19)} · {e.action} · {e.artifact}</p>
                          <p className={e.decision === "APPROVED" ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                            {e.decision}{e.clinician ? ` — ${e.clinician}` : ""}
                          </p>
                          <p className="text-muted-foreground">{e.reason}</p>
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

      <footer className="mt-auto border-t bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p>
            Hosted mirror of the repo&apos;s agent pipeline — the real MCP server (6 tools, 2 gated), LangGraph orchestration and local open-weights Qwen lane run from the repo:{" "}
            <span className="font-mono">./run_demo.sh &quot;Sr. A. Wanjiru (Triage Nurse)&quot;</span>. All data here is synthetic; no PHI exists.
          </p>
          <p className="mt-1">
            github.com/Roy-Wanyoike/mstari-triage · MIT · Agentic AI for Africa Innovation Challenge — Healthcare: The Triage Desk.
          </p>
        </div>
      </footer>
    </div>
  );
}
