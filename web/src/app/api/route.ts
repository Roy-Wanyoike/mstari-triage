import { NextResponse } from "next/server";
import { storageBackend, storageConfigured } from "@/lib/mstari/store";

// Health endpoint: which storage backend and which extraction lane are live.

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "mstari-web",
    status: "ok",
    storage: storageBackend(),
    storage_configured: storageConfigured(),
    extraction_lane: process.env.MODELSCOPE_API_KEY
      ? `open-weights Qwen via ModelScope (${process.env.MODELSCOPE_MODEL ?? "default model"})`
      : "deterministic keyword fallback (no LLM key configured - honest mode)",
    time: new Date().toISOString(),
  });
}
