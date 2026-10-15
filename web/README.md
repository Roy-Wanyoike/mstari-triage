# Mstari Web — the hosted Triage Desk (Vercel-ready)

A **hosted demo mirror** of the repo's agent pipeline: the same deterministic
cited SATS/TEWS scoring, the same guardrails, the same **block-by-default
clinician gate** — with a visual desk instead of a terminal. The full agentic
core (own MCP server with 6 tools, LangGraph orchestration, local open-weights
Qwen lane) runs from the repo root with `./run_demo.sh`; this app mirrors the
pipeline faithfully so judges can click through it in a browser.

All data is **synthetic** (bundled from `data/synthetic/patients/`, every card
marked `"synthetic": true`). No PHI exists, is stored, or is transmitted.

## What it does

1. **Ingestion** — pick any of the 12 bundled intake cards (`parse_intake_record` step).
2. **Extraction** — the complaint is mapped to SATS discriminator codes by the
   challenge-provided **Qwen models on ModelScope** (server-side env only); if
   no key is configured or the call fails, a deterministic keyword fallback
   runs and the backend is labelled honestly on every card.
3. **Cited scoring** — deterministic TS port of `mstari/scale.py`: TEWS bands +
   discriminator overrides, every component citing its source vital. The model
   never scores. Children ≤ 12 are escalated, never scored.
4. **Human gate** — publish is **irreversible and blocked by default**: an
   empty clinician name is refused server-side and logged to the gate ledger;
   a named clinician + timestamp publishes the priority.
5. **Deterioration watch** — for patients with a bundled re-check card, raise a
   gated second-look flag citing both vital sets (never changes the priority).
6. **Queue board + audit** — confirmed priorities only (RED → GREEN, TEWS desc,
   longest wait first), a live audit trail of every tool call (downloadable as
   `audit_log.jsonl`), and the gate ledger (who / what / when).
7. **Persisted demo state** — the board, ledger and audit hydrate from
   **Neon Postgres** when `DATABASE_URL` is set (see below), so refreshes and
   multiple judges share one queue. Without it the desk runs on in-memory
   session storage — the header pill always shows which backend is live.

## Run locally

```bash
cd web
cp .env.example .env.local      # optional - add a ModelScope token, or skip
npm install
npm run dev                     # http://localhost:3000
```

## Deploy to Vercel

**Dashboard (recommended):**

1. Push this repo to GitHub (it lives in `web/`).
2. Vercel → **Add New Project** → import the repo.
3. Set **Root Directory** to `web` (Framework: Next.js, auto-detected).
4. Add Environment Variables (Project → Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `MODELSCOPE_BASE_URL` | `https://api-inference.modelscope.ai/v1` |
   | `MODELSCOPE_MODEL` | `Qwen-Ambassador/Qwen3.8-plus` |
   | `MODELSCOPE_API_KEY` | your ModelScope token (**never commit this**) |
   | `DATABASE_URL` | Neon **pooled** connection string (see below) |

   Switch models by changing `MODELSCOPE_MODEL`:
   `Qwen-Ambassador/Qwen3.7-Max` · `Qwen-Ambassador/Qwen3.8-Max` ·
   `Qwen-Ambassador/Qwen3.8-plus` · `Qwen-Ambassador/Qwen3.7-Plus`

5. **Add the Neon database (demo storage):**

   1. In the Vercel project: **Storage → Create Database → Neon** (marketplace
      integration; a free-tier Postgres is enough for the demo), or create one
      at [app.neon.tech](https://app.neon.tech) and connect it manually.
   2. Copy the **pooled connection string**
      (`postgresql://…-pooler…neon.tech/neondb?sslmode=require`) into
      `DATABASE_URL` for Production / Preview. When Vercel manages the
      integration, `DATABASE_URL` is injected automatically.
   3. Deploy once — the three tables (`mstari_queue`, `mstari_gate_ledger`,
      `mstari_audit_log`) are auto-created on first write. The queue board,
      gate ledger and audit trail then survive refreshes and redeploys.

   Storage failures never block the gate: if the database is unreachable the
   desk degrades to in-memory session storage and the header pill says so.

6. Deploy.

**CLI alternative:**

```bash
cd web
npx vercel            # link + preview
npx vercel --prod     # production
# add secrets: npx vercel env add MODELSCOPE_API_KEY
# add database: npx vercel env add DATABASE_URL   (Neon pooled connection string)
```

No key configured? The desk still runs end-to-end — extraction falls back to
the deterministic keyword matcher and every card says so honestly.

## Honest scope note

This UI is a **mirror**, not the agent itself: the submission's agentic core
(MCP server + client over stdio, LangGraph graph, Ollama/ModelScope LLM lanes,
JSONL audit on disk) is the Python package at the repo root. The UI ports the
deterministic scale and gate semantics 1:1 and labels its extraction backend
on every card. Patients never leave the bundle of synthetic cards.
