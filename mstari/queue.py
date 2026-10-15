"""Queue board ranking.

Sorts confirmed triage cards into the order the nurse should see patients:
colour rank (RED first), then TEWS descending, then longest wait first within
the same colour (queue-flow: nobody with equal urgency keeps waiting longer
than a later arrival).

The board is an ARTIFACT for the triage nurse - the agent never sends anyone
to a bay and never re-orders clinical decisions, it sequences and cites.
"""
import datetime
from pathlib import Path

from .audit import log_tool_call
from .scale import COLOUR_RANK

BOARD_HEADER = (
    "# Mstari queue board - for triage nurse review\n\n"
    "> Every row cites its vitals. Priority levels marked CONFIRMED were "
    "signed by a named clinician; anything else is a DRAFT and must not move "
    "a patient.\n")


def rank_cards(cards: list[dict]) -> list[dict]:
    """Deterministic ordering: colour rank, TEWS desc, wait desc, ref asc."""
    return sorted(
        cards,
        key=lambda c: (
            COLOUR_RANK.get(c.get("colour", "GREEN"), 0) * -1,
            -(c.get("tews") or 0),
            -(c.get("wait_minutes_at_triage") or 0),
            c.get("patient_ref", ""),
        ))


def write_board(run_id: str, cards: list[dict], out_path: Path) -> dict:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    lines = [BOARD_HEADER, f"_Generated (UTC): {now}_", "",
             "| # | Patient | Colour | TEWS | Target time | Wait (min) | Key vitals (citations) | Status |",
             "|---|---------|--------|------|-------------|-----------:|------------------------|--------|"]
    for i, c in enumerate(rank_cards(cards), 1):
        v = c.get("key_vitals") or {}
        cited = ", ".join(f"{k} {v[k]}" for k in v)
        lines.append(
            f"| {i} | {c.get('patient_ref')} | **{c.get('colour')}** | {c.get('tews')} | "
            f"{c.get('target_time')} | {c.get('wait_minutes_at_triage', 0)} | {cited} | "
            f"{c.get('status', 'DRAFT')} |")
    lines += ["", "## Discriminator citations", ""]
    for c in rank_cards(cards):
        for d in c.get("discriminators", []) or []:
            lines.append(f"- {c.get('patient_ref')}: {d.get('label')} ({d.get('colour')})"
                         f" — from complaint text, applied by {'LLM extraction' if d.get('source') == 'llm' else 'keyword fallback'}")
    lines += ["", "_Mstari sequences the queue; the triage nurse decides who is seen. "
              "No diagnosis, no prescription, no disposition._", ""]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    result = {"file": str(out_path), "patients": len(cards),
              "order": [c.get("patient_ref") for c in rank_cards(cards)]}
    log_tool_call(run_id, "write_queue_board", "mstari-internal", {"out_path": str(out_path)},
                  result, 0)
    return result
