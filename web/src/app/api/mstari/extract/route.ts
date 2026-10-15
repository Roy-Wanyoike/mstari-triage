import { NextRequest, NextResponse } from "next/server";
import { scrub, assertNoPrescription } from "@/lib/mstari/guardrails";
import { DISCRIMINATORS, extractDiscriminatorsHeuristic } from "@/lib/mstari/scale";
import type { AuditEntry, ExtractionResult } from "@/lib/mstari/types";
import { appendAudit } from "@/lib/mstari/store";

// Lane configuration (server-only env):
//   MODELSCOPE_BASE_URL (default https://api-inference.modelscope.ai/v1)
//   MODELSCOPE_API_KEY  (challenge-provided token; never committed)
//   MODELSCOPE_MODEL    (Qwen-Ambassador/Qwen3.8-plus etc.)
// No endpoint / any failure -> deterministic keyword fallback, honestly labelled.
const BASE_URL = process.env.MODELSCOPE_BASE_URL || "https://api-inference.modelscope.ai/v1";
const API_KEY = process.env.MODELSCOPE_API_KEY || "";
const MODEL = process.env.MODELSCOPE_MODEL || "Qwen-Ambassador/Qwen3.8-plus";

const VALID = new Set(Object.keys(DISCRIMINATORS));

const SYSTEM_PROMPT =
  "You are the intake reader at a triage desk. Map the patient's presenting complaint onto this EXACT list of discriminator codes only: " +
  Object.keys(DISCRIMINATORS).join(", ") +
  ". Pay attention to negation: 'denies chest pain' means chest_pain is NOT present. Reply with strict JSON: {\"discriminators\": [codes], \"summary\": \"one factual sentence, no diagnosis, no medication\"}. You must not diagnose, prescribe, or invent codes outside the list.";

async function qwenExtract(complaintText: string, ageYears: number | null) {
  if (!API_KEY) return null;
  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Patient age: ${ageYears ?? "unknown"} years.\nPresenting complaint: ${complaintText}` },
        ],
        max_tokens: 300,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data?.choices?.[0]?.message?.content as string) || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const complaintText = String(body?.complaintText ?? "");
  const ageYears = typeof body?.ageYears === "number" ? body.ageYears : null;

  let backend = "";
  let codes: string[] = [];
  let rejected: string[] = [];
  let summary = "";
  let redactions: string[] = [];

  const raw = await qwenExtract(complaintText, ageYears);
  if (raw) {
    backend = `${MODEL} (ModelScope-hosted Qwen)`;
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const parsed = JSON.parse(raw.slice(start, end + 1));
      for (const c of parsed.discriminators ?? []) {
        if (VALID.has(c)) codes.push(c);
        else rejected.push(String(c));
      }
      summary = String(parsed.summary ?? "");
    } catch {
      codes = [];
      summary = "";
      backend = "";
    }
  }
  if (!backend) {
    backend = "keyword_fallback (no LLM endpoint configured / unreachable - honest mode)";
    codes = extractDiscriminatorsHeuristic(complaintText);
    summary = `Complaint recorded verbatim; keyword matcher applied the cited SATS discriminator list (no negation scope - see EVALS.md F1).`;
  }

  let { clean, hits } = scrub(summary);
  redactions = hits;
  try {
    assertNoPrescription(clean);
  } catch {
    clean = "[blocked by guardrail: prescription-like phrasing]";
  }

  const result: ExtractionResult = {
    backend,
    discriminators: codes,
    rejected,
    summary: clean,
    guardrail_redactions: redactions,
  };

  const audit: AuditEntry = {
    ts: new Date().toISOString(),
    event: "llm_task",
    tool: "extract_discriminators",
    server: "mstari-web",
    args: { complaint_len: complaintText.length, age_years: ageYears },
    result: { backend, discriminators: codes, rejected, redactions },
  };
  await appendAudit(audit);
  return NextResponse.json({ extraction: result, audit });
}
