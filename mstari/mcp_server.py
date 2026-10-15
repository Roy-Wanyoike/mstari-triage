"""Mstari MCP server (own build).

Exposes five tools over the Model Context Protocol:

  read-only:
    parse_intake_record   - load + normalise one synthetic intake card

  acting (write artifacts under runs/<run_id>/):
    score_priority        - compute the cited SATS/TEWS priority and write a
                            DRAFT triage card. Deterministic scale code; the
                            caller (agent) supplies discriminator codes it
                            extracted from the complaint text.
    rank_queue            - write the queue board from CONFIRMED cards only,
                            plus a clearly-marked DRAFT preview.

  acting, GATED (irreversible -> named clinician required):
    confirm_priority      - publish a draft card to the live queue board.
    raise_recheck_flag    - deterioration watch: raise a second-look flag
                            citing the changed vitals. Never re-scores,
                            never decides - a nurse takes the second look.

Data conduct:
  - All patient data is SYNTHETIC (data/synthetic/patients, "synthetic": true).
  - No real patient data, no network calls, no PHI leaves the machine.
  - Every tool call is appended to runs/<run_id>/audit_log.jsonl with inputs,
    outputs and timestamps.

Run:  python -m mstari.mcp_server      (stdio transport)
"""
import datetime
import json
import time
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from .config import RUNS_DIR, PATIENTS_DIR
from .audit import log_tool_call, log_gate
from .intake import load_intake, normalise
from .scale import (DISCRIMINATORS, COLOUR_RANK, extract_discriminators_heuristic,
                    score_tews, band_for_tews)
from .guardrails import SCOPE_BANNER
from .gates import check_approval

mcp = FastMCP("mstari")

import os
RUN_ID = os.environ.get("MSTARI_RUN_ID", "adhoc")


# ----------------------------------------------------------------- helpers

def _run_dir() -> Path:
    d = RUNS_DIR / RUN_ID
    d.mkdir(parents=True, exist_ok=True)
    return d


def _parse_codes(discriminators_json: str) -> tuple[list[str], list[str]]:
    """Returns (valid_codes, rejected_codes)."""
    try:
        raw = json.loads(discriminators_json or "[]")
    except Exception:
        return [], [(discriminators_json or "")[:80]]
    if not isinstance(raw, list):
        return [], ["payload not a JSON array"]
    valid, rejected = [], []
    for c in raw:
        if c in DISCRIMINATORS:
            valid.append(c)
        else:
            rejected.append(str(c))
    return valid, rejected


def _worst_colour(code_colours: list[str]) -> str:
    best = "GREEN"
    for c in code_colours:
        if COLOUR_RANK.get(c, 0) > COLOUR_RANK.get(best, 0):
            best = c
    return best


# ------------------------------------------------------------------- tools

@mcp.tool()
def parse_intake_record(patient_ref: str) -> dict:
    """Load and normalise one synthetic patient intake card (vitals, mobility,
    AVPU, presenting complaint). Returns the structured card; the card cites
    its source file. All data is synthetic."""
    t0 = time.monotonic()
    try:
        card = normalise(load_intake(patient_ref))
        result = {"status": "OK", "card": card, "source_file": card.get("_source_file"),
                  "note": "Synthetic intake card. No real patient data."}
    except FileNotFoundError as e:
        result = {"status": "NOT_FOUND", "error": str(e),
                  "hint": "run 'python -m mstari.main synth' to generate the bundled synthetic cards"}
    except Exception as e:
        result = {"status": "ERROR", "error": str(e)}
    log_tool_call(RUN_ID, "parse_intake_record", "mstari-mcp",
                  {"patient_ref": patient_ref}, result,
                  int((time.monotonic() - t0) * 1000))
    return result


@mcp.tool()
def score_priority(patient_ref: str, discriminators: str = "[]",
                   extraction_source: str = "keyword_fallback") -> dict:
    """ACTING TOOL. Compute the cited SATS (adult chart) priority for one
    patient and write a DRAFT triage card to runs/<run_id>/draft_cards/.

    `discriminators`: JSON array of codes the agent extracted from the
    complaint text (see the SATS discriminator list in the tool result of
    parse_intake_record). Unknown codes are rejected. With an empty array the
    tool falls back to a keyword extractor (documented limitation: no
    negation handling - see EVALS.md task F1).

    The score is deterministic scale code, never the LLM. Patients aged 12 or
    under are OUT OF SCOPE for the adult chart and are escalated, not scored.
    A draft card does NOT touch the live queue - confirm_priority does."""
    t0 = time.monotonic()
    args = {"patient_ref": patient_ref, "discriminators": discriminators,
            "extraction_source": extraction_source}
    try:
        card = normalise(load_intake(patient_ref))
    except Exception as e:
        result = {"status": "NOT_FOUND", "error": str(e)}
        log_tool_call(RUN_ID, "score_priority", "mstari-mcp", args, result,
                      int((time.monotonic() - t0) * 1000))
        return result

    age = card.get("age_years")
    if isinstance(age, (int, float)) and age <= 12:
        log_gate(RUN_ID, "score_priority", "BLOCKED", None,
                 f"{patient_ref} aged {age}: outside the adult SATS chart")
        result = {"status": "OUT_OF_SCOPE_ADULT_CHART", "patient_ref": patient_ref,
                  "age_years": age,
                  "reason": ("The adult SATS chart covers patients over 12 years. "
                             "This patient must be triaged with the paediatric chart "
                             "by a clinician. Mstari refuses to score and escalates."),
                  "escalate_to": "triage nurse / clinician"}
        log_tool_call(RUN_ID, "score_priority", "mstari-mcp", args, result,
                      int((time.monotonic() - t0) * 1000))
        return result

    codes, rejected = _parse_codes(discriminators)
    if not codes and not rejected:
        codes = extract_discriminators_heuristic(card.get("complaint_text", ""))
        extraction_source = "keyword_fallback"

    scored = score_tews(card.get("vitals"), age)
    if scored.get("status") != "OK":
        scored.update({"patient_ref": patient_ref, "escalate_to": "triage nurse"})
        log_tool_call(RUN_ID, "score_priority", "mstari-mcp", args, scored,
                      int((time.monotonic() - t0) * 1000))
        return scored

    disc_citations = []
    for code in codes:
        colour, label = DISCRIMINATORS[code]
        disc_citations.append({"code": code, "colour": colour, "label": label,
                               "source": extraction_source,
                               "citation": f"complaint_text: \"{card.get('complaint_text', '')}\""})

    tews_colour = scored["tews_colour"]
    final_colour = _worst_colour([tews_colour] + [d["colour"] for d in disc_citations])
    if final_colour != tews_colour:
        override = [d for d in disc_citations if d["colour"] == final_colour]
        reason = "discriminator override: " + ", ".join(
            f"{o['code']} ({o['label']})" for o in override)
    else:
        reason = f"TEWS {scored['tews']} -> {tews_colour}"

    v = card.get("vitals") or {}
    draft_card = {
        "card_id": f"{patient_ref}-{RUN_ID}",
        "patient_ref": patient_ref,
        "age_years": age,
        "tews": scored["tews"],
        "tews_colour": tews_colour,
        "colour": final_colour,
        "target_time": scored["target_time"] if final_colour == tews_colour
        else dict((b[2], b[3]) for b in
                  [(7, 99, "RED", "immediate"), (5, 6, "ORANGE", "< 10 minutes"),
                   (3, 4, "YELLOW", "< 60 minutes"), (0, 2, "GREEN", "< 240 minutes")])[final_colour],
        "override_reason": reason,
        "components": scored["components"],           # per-vital citations
        "discriminators": disc_citations,             # per-complaint citations
        "rejected_codes": rejected,
        "extraction_source": extraction_source,
        "key_vitals": {k: v.get(k) for k in
                       ("resp_rate", "heart_rate", "sbp", "temp_c", "avpu", "mobility")
                       if v.get(k) is not None},
        "spo2_note": "SpO2 recorded by nurse; the SATS adult chart does not score it.",
        "wait_minutes_at_triage": card.get("wait_minutes_at_triage", 0),
        "facility": card.get("facility"),
        "status": "DRAFT",
        "written_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "scope": SCOPE_BANNER,
    }
    out = _run_dir() / "draft_cards" / f"{patient_ref}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(draft_card, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    result = {"status": "DRAFT_WRITTEN", "patient_ref": patient_ref,
              "colour": final_colour, "tews": scored["tews"],
              "target_time": draft_card["target_time"],
              "override_reason": reason,
              "citations": {"vitals": len(draft_card["components"]),
                            "discriminators": len(disc_citations)},
              "draft_file": str(out),
              "note": "DRAFT - reaches the queue only after a named clinician confirms."}
    log_tool_call(RUN_ID, "score_priority", "mstari-mcp", args, result,
                  int((time.monotonic() - t0) * 1000))
    return result


@mcp.tool()
def confirm_priority(patient_ref: str, clinician_name: str = "") -> dict:
    """ACTING TOOL, GATED. Publish a DRAFT triage card to the live queue:
    copies runs/<run_id>/draft_cards/<ref>.json to confirmed_cards/ with the
    clinician's name and timestamp. A priority level reaches a patient's
    queue position ONLY here. Empty clinician_name -> BLOCKED, nothing is
    published, the block is logged."""
    t0 = time.monotonic()
    args = {"patient_ref": patient_ref, "clinician_name": clinician_name or None}
    draft_path = _run_dir() / "draft_cards" / f"{patient_ref}.json"
    if not draft_path.exists():
        result = {"status": "ERROR", "reason": f"no draft card for {patient_ref}"}
        log_tool_call(RUN_ID, "confirm_priority", "mstari-mcp", args, result,
                      int((time.monotonic() - t0) * 1000))
        return result

    gate = check_approval(RUN_ID, "confirm_priority", patient_ref, clinician_name)
    if gate["status"] == "BLOCKED":
        result = gate
        log_tool_call(RUN_ID, "confirm_priority", "mstari-mcp", args, result,
                      int((time.monotonic() - t0) * 1000))
        return result

    card = json.loads(draft_path.read_text(encoding="utf-8"))
    card["status"] = "CONFIRMED"
    card["confirmed_by"] = gate["clinician"]
    card["confirmed_at"] = gate["ts"]
    conf_path = _run_dir() / "confirmed_cards" / f"{patient_ref}.json"
    conf_path.parent.mkdir(parents=True, exist_ok=True)
    conf_path.write_text(json.dumps(card, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    result = {"status": "CONFIRMED", "patient_ref": patient_ref,
              "clinician": gate["clinician"], "colour": card["colour"],
              "tews": card["tews"], "file": str(conf_path),
              "note": "Priority now on the live queue board with full citations."}
    log_tool_call(RUN_ID, "confirm_priority", "mstari-mcp", args, result,
                  int((time.monotonic() - t0) * 1000))
    return result


@mcp.tool()
def rank_queue(facility_id: str = "OPD-triage-desk") -> dict:
    """ACTING TOOL. Write the queue board (runs/<run_id>/queue_board.md) from
    CONFIRMED cards only, ordered RED > ORANGE > YELLOW > GREEN, then TEWS
    descending, then longest wait first. DRAFT cards are listed separately as
    'pending clinician confirmation' and are never positioned."""
    t0 = time.monotonic()
    from .queue import write_board, rank_cards
    confirmed_dir = _run_dir() / "confirmed_cards"
    cards = []
    if confirmed_dir.exists():
        for p in sorted(confirmed_dir.glob("*.json")):
            cards.append(json.loads(p.read_text(encoding="utf-8")))
    drafts_dir = _run_dir() / "draft_cards"
    drafts = []
    if drafts_dir.exists():
        for p in sorted(drafts_dir.glob("*.json")):
            d = json.loads(p.read_text(encoding="utf-8"))
            if not (confirmed_dir / p.name).exists():
                drafts.append(d)
    if not cards and not drafts:
        result = {"status": "EMPTY", "reason": "no cards in this run yet",
                  "hint": "call score_priority first"}
        log_tool_call(RUN_ID, "rank_queue", "mstari-mcp",
                      {"facility_id": facility_id}, result,
                      int((time.monotonic() - t0) * 1000))
        return result
    board = write_board(RUN_ID, cards, _run_dir() / "queue_board.md")
    preview = write_board(RUN_ID, drafts, _run_dir() / "draft_board.md") if drafts else None
    result = {"status": "WRITTEN", "facility_id": facility_id,
              "confirmed_count": len(cards), "draft_pending": len(drafts),
              "order": board.get("order"), "board_file": board.get("file"),
              "draft_preview_file": (preview or {}).get("file"),
              "note": "Board shows CONFIRMED priorities with citations; drafts wait for the clinician."}
    log_tool_call(RUN_ID, "rank_queue", "mstari-mcp",
                  {"facility_id": facility_id}, result,
                  int((time.monotonic() - t0) * 1000))
    return result


@mcp.tool()
def raise_recheck_flag(patient_ref: str, clinician_name: str = "",
                       recheck_file: str = "") -> dict:
    """ACTING TOOL, GATED. Deterioration watch: compare a re-check vital set
    against the patient's confirmed card and, if the patient worsened, raise a
    SECOND-LOOK flag citing both vital sets. The flag never changes the
    priority and never decides anything - a nurse takes the second look
    (track wording: 'a second look, not a verdict').

    `recheck_file`: optional path/name of a recheck card JSON; defaults to
    data/synthetic/patients/<ref>-recheck.json when present."""
    t0 = time.monotonic()
    args = {"patient_ref": patient_ref, "clinician_name": clinician_name or None,
            "recheck_file": recheck_file or None}
    conf_path = _run_dir() / "confirmed_cards" / f"{patient_ref}.json"
    if not conf_path.exists():
        result = {"status": "ERROR",
                  "reason": f"no confirmed card for {patient_ref}; re-check flags attach to confirmed priorities"}
        log_tool_call(RUN_ID, "raise_recheck_flag", "mstari-mcp", args, result,
                      int((time.monotonic() - t0) * 1000))
        return result
    base_card = json.loads(conf_path.read_text(encoding="utf-8"))

    rc_path = (PATIENTS_DIR / f"{patient_ref}-recheck.json") if not recheck_file \
        else (PATIENTS_DIR / recheck_file if "/" not in recheck_file else Path(recheck_file))
    if not rc_path.exists():
        result = {"status": "ERROR", "reason": f"recheck vitals file not found: {rc_path}"}
        log_tool_call(RUN_ID, "raise_recheck_flag", "mstari-mcp", args, result,
                      int((time.monotonic() - t0) * 1000))
        return result
    recheck = json.loads(rc_path.read_text(encoding="utf-8"))

    after_vitals = recheck.get("vitals_after") or {}
    before_vitals = base_card.get("key_vitals") or {}
    before_tews = base_card.get("tews")
    after = score_tews(after_vitals, base_card.get("age_years"))
    if after.get("status") != "OK":
        result = {"status": "INCOMPLETE_RECHECK", "detail": after,
                  "escalate_to": "triage nurse"}
        log_tool_call(RUN_ID, "raise_recheck_flag", "mstari-mcp", args, result,
                      int((time.monotonic() - t0) * 1000))
        return result
    after_tews = after["tews"]
    worsened = after_tews > (before_tews or 0)

    gate = check_approval(RUN_ID, "raise_recheck_flag", f"{patient_ref}-recheck", clinician_name)
    if gate["status"] == "BLOCKED":
        result = gate
        log_tool_call(RUN_ID, "raise_recheck_flag", "mstari-mcp", args, result,
                      int((time.monotonic() - t0) * 1000))
        return result

    flag = {
        "flag_id": f"recheck-{patient_ref}-{RUN_ID}",
        "patient_ref": patient_ref,
        "kind": "DETERIORATION_SECOND_LOOK",
        "worsened": worsened,
        "before": {"tews": before_tews, "colour": base_card.get("colour"),
                   "vitals": before_vitals,
                   "citation": f"confirmed card {conf_path.name}"},
        "after": {"tews": after_tews, "colour": after["tews_colour"],
                  "vitals": after_vitals,
                  "citation": str(rc_path),
                  "components": after["components"]},
        "delta_tews": after_tews - (before_tews or 0),
        "observed_change": recheck.get("observed_change", "nurse re-check"),
        "raised_by": gate["clinician"],
        "raised_at": gate["ts"],
        "status": "SECOND_LOOK_REQUESTED",
        "note": "For a second look, not a verdict. The nurse re-assesses and decides.",
    }
    out = _run_dir() / "recheck_flags" / f"{patient_ref}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(flag, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    result = {"status": "FLAG_RAISED" if worsened else "NO_WORSENING_FLAGGED",
              "patient_ref": patient_ref, "worsened": worsened,
              "tews_before": before_tews, "tews_after": after_tews,
              "delta_tews": flag["delta_tews"], "file": str(out),
              "note": "Second-look flag with both vital sets cited. Priority unchanged."}
    log_tool_call(RUN_ID, "raise_recheck_flag", "mstari-mcp", args, result,
                  int((time.monotonic() - t0) * 1000))
    return result


@mcp.tool()
def list_discriminators() -> dict:
    """List the SATS discriminator codes this server accepts for
    score_priority, with their colours and chart labels. Read-only helper so
    any agent can discover the vocabulary before extracting."""
    t0 = time.monotonic()
    result = {"source": "SATS adult chart discriminator list (see data/ATTRIBUTION.md)",
              "discriminators": {k: {"colour": v[0], "label": v[1]}
                                 for k, v in sorted(DISCRIMINATORS.items())},
              "scope": SCOPE_BANNER}
    log_tool_call(RUN_ID, "list_discriminators", "mstari-mcp", {}, result,
                  int((time.monotonic() - t0) * 1000))
    return result


if __name__ == "__main__":
    # stdio transport - launched by the agent via StdioServerParameters
    mcp.run()
