# Video — demo walkthrough

**`mstari-demo.mp4`** (2:16, 1280x800, silent screencast) — the submission's
demo video for the track's "<3 minutes, unedited" requirement.

Every frame is generated from the **real artifacts of one live run**
(`runs/video-demo/`): the MCP audit log (`audit_log.jsonl`, 140 tool calls),
`gate_ledger.json`, `queue_board.md`, the eval transcript and the run
summaries. Nothing is mocked or narrated over stills of other runs.

What it shows, in order:

1. Run config + the scope banner (never diagnoses / prescribes / decides)
2. **Ingestion** — all 12 `parse_intake_record` MCP tool calls, one frame each
3. **Scoring** — cited TEWS drafts per patient + the P-004 child escalation
4. **Human gate** — publish blocked without a named clinician (eval T08),
   then approved by `Sr. A. Wanjiru (Triage Nurse)` (gate ledger entries)
5. **Queue board** — the confirmed, fully cited RED→GREEN board
6. **Audit trail** — sample raw `audit_log.jsonl` entries
7. **Evals** — 15 pass + the intentional F1 known-unfixed failure
8. The system architecture diagram (`docs/architecture.png`)
9. Wrap-up: how to run it yourself

## Reproduce / re-record

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m mstari.main demo --run video-demo --no-llm
python -m mstari.main demo --run video-demo --no-llm --clinician "Sr. A. Wanjiru (Triage Nurse)"
python3 /path/to/scripts/make_video.py   # renders video/mstari-demo.mp4
```

The generator (`scripts/make_video.py` in the project workspace) reads
`runs/video-demo/` — re-run the demo, re-run the generator, and the video is
rebuilt from whatever the agent actually did. For a narrated on-camera
alternative, follow `VIDEO_SCRIPT.md` (shot list) with the same commands.
