"""Clinician approval gate ledger.

The track requires a gate on every irreversible action - before a priority
level or a re-check flag reaches a patient's queue position - with a named
clinician approving, plus inputs/outputs/timestamps in the log.

Ledger file: runs/<run_id>/gate_ledger.json. Every decision, block or
approve, is also mirrored to the JSONL audit log.
"""
import datetime
import json
from pathlib import Path

from .audit import log_gate
from .config import RUNS_DIR


def _ledger_path(run_id: str) -> Path:
    d = RUNS_DIR / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d / "gate_ledger.json"


def _read(run_id: str) -> dict:
    p = _ledger_path(run_id)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"entries": []}


def _write(run_id: str, ledger: dict) -> None:
    _ledger_path(run_id).write_text(
        json.dumps(ledger, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def check_approval(run_id: str, action: str, artifact_id: str,
                   clinician: str) -> dict:
    """BLOCKED unless a non-empty clinician name is supplied. The name is the
    human who ran the approving command - the agent cannot invent one."""
    name = (clinician or "").strip()
    ts = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds")
    if not name:
        log_gate(run_id, action, "BLOCKED", None,
                 f"no named clinician for {artifact_id} - nothing published")
        entry = {"ts": ts, "action": action, "artifact": artifact_id,
                 "decision": "BLOCKED", "clinician": None,
                 "reason": "named clinician required"}
        ledger = _read(run_id)
        ledger["entries"].append(entry)
        _write(run_id, ledger)
        return {"status": "BLOCKED",
                "reason": ("Irreversible action gated: a named clinician must approve "
                           "before anything reaches the queue. Re-run with --clinician "
                           "'Name (role)' or type the name at the prompt.")}

    log_gate(run_id, action, "APPROVED", name, f"{artifact_id} published")
    entry = {"ts": ts, "action": action, "artifact": artifact_id,
             "decision": "APPROVED", "clinician": name,
             "reason": "named clinician approved irreversible publish"}
    ledger = _read(run_id)
    ledger["entries"].append(entry)
    _write(run_id, ledger)
    return {"status": "APPROVED", "clinician": name, "ts": ts}
