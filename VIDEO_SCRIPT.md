# VIDEO_SCRIPT.md — unedited demo, under 3 minutes

The track requires an **unedited agent run with tool calls on screen** — not
slides. One take, one terminal, one editor window. Rehearse once, then record.
Total: ~2:45.

## Pre-flight (before recording)

- [ ] Fresh clone dir; `rm -rf runs` (clean run).
- [ ] Ollama running with `ollama pull qwen2.5:7b` (open-weights lane on
      screen = strong open-weights evidence). Terminal font ≥14pt, screen
      1280×800 region so tool calls are readable.
- [ ] Split screen: left = terminal (full height), right = `README.md` +
      `mcp_config.json` open in the editor.
- [ ] `script -t` or OBS with system-audio-off; mic only. Do not cut later.

## Shot list (single take)

| Time | On screen | Say (short) |
|------|-----------|-------------|
| 0:00–0:20 | README.md open | "Mstari — the queue. At a Kenyan OPD, the queue starts at triage. Mstari reads intake cards and sequences the queue with a cited SATS priority. It never diagnoses, never prescribes, never decides — the nurse confirms." |
| 0:20–0:35 | scroll to compliance table | "Our own MCP server, six tools, two gated. Borrowed official fetch server for the live scale references. LangGraph orchestration, open-weights Qwen on Ollama." |
| 0:35–0:45 | right pane: `mcp_config.json` | "Here is the server we wrote — and the one we borrowed, with the one-line reason." |
| 0:45–1:15 | terminal: `./run_demo.sh "Sr. A. Wanjiru (Triage Nurse)"` | "One command. It builds the env, generates the synthetic patients — all data is synthetic, marked on every card — runs the eval suite… fifteen tasks pass, one known failure we documented on purpose." |
| 1:15–1:50 | terminal: agent run output | "Now the agent run. Watch the tool calls: parse_intake_record… the open-weights model extracts discriminators from the complaint… score_priority writes DRAFT cards — deterministic SATS code, every component cited to its vital." Point at `P-004` line: "Child under twelve — escalated, never scored by the adult chart." |
| 1:50–2:15 | terminal: gate + board | "Before anything reaches the queue: the clinician gate. Named clinician, block by default. Confirmed. Here is the queue board — RED first, each row citing its vitals. P-002: TEWS 9, immediate." |
| 2:15–2:35 | terminal: `cat runs/*/gate_ledger.json` and `head runs/*/audit_log.jsonl` | "Every decision, block or approve, timestamped. Every tool call logged with inputs and outputs." |
| 2:35–2:45 | README compliance map | "Grounded in a published scale, cited in ATTRIBUTION.md. MIT licence. Runs in one command. Mstari — the nurse decides; the queue just gets honest." |

## After recording

- [ ] Upload UNEDITED to YouTube (public/unlisted) or Vimeo.
- [ ] Put the URL in the submission form (and replace `DEMO_VIDEO_URL` in this
      file).

DEMO_VIDEO_URL: <paste link after upload>
