"""Append-only JSONL audit log.

Every tool call - inputs, outputs, timestamps, gate decisions - is recorded
here. This is the defensibility layer required by the track: any priority
level on the queue board can be traced back to the exact tool call, the raw
vitals behind it, and the clinician who confirmed it.
"""
import datetime
import json
import os
from pathlib import Path

from .config import RUNS_DIR, RUN_ID


def _run_dir(run_id: str) -> Path:
    d = RUNS_DIR / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def log_event(run_id: str, event: str, payload: dict) -> None:
    """Append one structured event to runs/<run_id>/audit_log.jsonl."""
    entry = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds"),
        "run_id": run_id,
        "event": event,
        **payload,
    }
    path = _run_dir(run_id) / "audit_log.jsonl"
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")


def log_tool_call(run_id: str, tool: str, server: str, args: dict, result, duration_ms: int) -> None:
    log_event(run_id, "tool_call", {
        "tool": tool,
        "server": server,
        "args": args,
        "result": result,
        "duration_ms": duration_ms,
    })


def log_gate(run_id: str, gate: str, decision: str, approved_by, reason: str = "") -> None:
    """Irreversible-action gate decisions are always logged, block or approve."""
    log_event(run_id, "gate_decision", {
        "gate": gate,
        "decision": decision,  # BLOCKED | APPROVED
        "approved_by": approved_by,
        "reason": reason,
    })


def log_guardrail(run_id: str, kind: str, detail: dict) -> None:
    log_event(run_id, "guardrail", {"kind": kind, **detail})


def audit_path(run_id: str = None) -> Path:
    return _run_dir(run_id or RUN_ID) / "audit_log.jsonl"
