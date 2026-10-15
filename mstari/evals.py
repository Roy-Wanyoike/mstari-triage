"""Mstari evals - honest, repeatable, programmatic.

Run:  python -m mstari.evals

12 tasks across the five tools + the gate + the borrowed server + guardrails,
plus ONE known unfixed failure (F1, negation handling) that is expected to
fail and is reported as such. See EVALS.md for the full write-up.
"""
import datetime
import json
import sys
import uuid
from pathlib import Path

from .config import RUNS_DIR
from .mcp_client import MCPClientProxy
from .audit import audit_path
from .guardrails import scrub, assert_no_prescription


def main(argv=None) -> int:
    run_id = "evals-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:4]
    srv = MCPClientProxy.own_server(run_id)
    results: list[dict] = []

    def case(name: str, expect: str, fn):
        try:
            got, ok = fn()
        except Exception as e:
            got, ok = f"exception: {e}", False
        results.append({"task": name, "expected": expect, "observed": got, "pass": ok})

    # --- tool availability -------------------------------------------------
    tools = srv.list_tools()
    case("T01 own MCP server lists >= 6 tools",
         "parse_intake_record, score_priority, confirm_priority, rank_queue, "
         "raise_recheck_flag, list_discriminators",
         lambda: (", ".join(tools), len(tools) >= 6))

    # --- parse_intake_record ----------------------------------------------
    def t02():
        r = srv.call_tool("parse_intake_record", {"patient_ref": "P-001"}, "mstari-mcp")
        v = (r.get("card") or {}).get("vitals") or {}
        return (f"status={r.get('status')}, rr={v.get('resp_rate')}, "
                f"complaint='{((r.get('card') or {}).get('complaint_text') or '')[:38]}...'",
                r.get("status") == "OK" and v.get("resp_rate") == 18
                and bool((r.get("card") or {}).get("complaint_text")))
    case("T02 parse synthetic intake card P-001", "OK; structured vitals + complaint", t02)

    def t03():
        r = srv.call_tool("parse_intake_record", {"patient_ref": "P-999"}, "mstari-mcp")
        return (f"status={r.get('status')}, hint present={bool(r.get('hint'))}",
                r.get("status") == "NOT_FOUND" and not r.get("card"))
    case("T03 unknown patient degrades gracefully", "NOT_FOUND with hint, no exception", t03)

    # --- score_priority ----------------------------------------------------
    def t04():
        r = srv.call_tool("score_priority",
                          {"patient_ref": "P-001", "discriminators": '["pain_moderate"]',
                           "extraction_source": "card_reported"}, "mstari-mcp")
        return (f"status={r.get('status')}, colour={r.get('colour')}, tews={r.get('tews')}, "
                f"citations(vitals)={r.get('citations', {}).get('vitals')}",
                r.get("status") == "DRAFT_WRITTEN" and r.get("colour") == "YELLOW"
                and (r.get("citations", {}).get("vitals") or 0) >= 5)
    case("T04 P-001 scores YELLOW with cited components",
         "DRAFT_WRITTEN YELLOW (TEWS 0 + pain_moderate), >=5 vital citations", t04)

    def t05():
        r = srv.call_tool("score_priority",
                          {"patient_ref": "P-002", "discriminators": '["sob_acute"]',
                           "extraction_source": "llm"}, "mstari-mcp")
        return (f"colour={r.get('colour')}, tews={r.get('tews')}, "
                f"target={r.get('target_time')}",
                r.get("colour") == "RED" and r.get("tews") == 9
                and r.get("target_time") == "immediate")
    case("T05 P-002 deranged vitals -> RED immediate", "RED, TEWS 9, target immediate", t05)

    def t06():
        r = srv.call_tool("score_priority",
                          {"patient_ref": "P-003",
                           "discriminators": '["chest_pain", "pain_severe"]',
                           "extraction_source": "llm"}, "mstari-mcp")
        return (f"colour={r.get('colour')}, tews={r.get('tews')}, "
                f"override='{r.get('override_reason')}'",
                r.get("colour") == "ORANGE" and r.get("tews") == 1
                and "chest_pain" in (r.get("override_reason") or ""))
    case("T06 P-003 chart worked-case path: low TEWS, ORANGE via discriminator",
         "ORANGE via chest_pain override (mirrors the source chart's own case study)", t06)

    def t07():
        r = srv.call_tool("score_priority", {"patient_ref": "P-004",
                                             "discriminators": "[]"}, "mstari-mcp")
        drafts = Path(r.get("draft_file") or "/tmp/never").exists() if r.get("draft_file") else False
        return (f"status={r.get('status')}, escalate_to={r.get('escalate_to')}, "
                f"no_draft_written={not drafts}",
                r.get("status") == "OUT_OF_SCOPE_ADULT_CHART" and not drafts)
    case("T07 child under 12 is escalated, never scored by the adult chart",
         "OUT_OF_SCOPE_ADULT_CHART; nothing written", t07)

    # --- the gate ----------------------------------------------------------
    def t08():
        r = srv.call_tool("confirm_priority", {"patient_ref": "P-001",
                                               "clinician_name": ""}, "mstari-mcp")
        return (f"status={r.get('status')}",
                r.get("status") == "BLOCKED")
    case("T08 gate blocks confirmation without a named clinician", "BLOCKED", t08)

    def t09():
        r = srv.call_tool("confirm_priority",
                          {"patient_ref": "P-001",
                           "clinician_name": "Sr. A. Wanjiru (Triage Nurse, evals)"},
                          "mstari-mcp")
        ledger = RUNS_DIR / run_id / "gate_ledger.json"
        ok_ledger = ledger.exists() and "Wanjiru" in ledger.read_text()
        return (f"status={r.get('status')}, clinician={r.get('clinician')}, "
                f"ledger_has_entry={ok_ledger}",
                r.get("status") == "CONFIRMED" and ok_ledger)
    case("T09 named clinician confirmation is recorded in the gate ledger",
         "CONFIRMED; ledger entry with name + timestamp", t09)

    # --- queue ranking -----------------------------------------------------
    def t10():
        # score the remaining demo patients (P-012 will be needed by T11/T12)
        for ref, discs in (("P-005", '["pregnancy_trauma_or_pain"]'),
                           ("P-008", '["haemorrhage_uncontrolled"]'),
                           ("P-010", '["poisoning_overdose"]'),
                           ("P-012", '["pain_moderate"]')):
            srv.call_tool("score_priority",
                          {"patient_ref": ref, "discriminators": discs,
                           "extraction_source": "card_reported"}, "mstari-mcp")
        for ref in ("P-002", "P-008", "P-010", "P-003", "P-005", "P-012"):
            srv.call_tool("confirm_priority",
                          {"patient_ref": ref,
                           "clinician_name": "Sr. A. Wanjiru (Triage Nurse, evals)"},
                          "mstari-mcp")
        r = srv.call_tool("rank_queue", {"facility_id": "OPD-triage-desk-evals"}, "mstari-mcp")
        order = r.get("order") or []
        # RED: P-002 (TEWS 9) then TEWS-0 REDs by wait desc (P-010 w10 > P-008 w8)
        # ORANGE: P-005 (w30) > P-003 (w25); YELLOW: P-012 (w45) > P-001 (w40)
        head_ok = order[:5] == ["P-002", "P-010", "P-008", "P-005", "P-003"]
        tail_ok = order[-2:] == ["P-012", "P-001"]
        return (f"order={order}",
                head_ok and tail_ok and r.get("status") == "WRITTEN")
    case("T10 queue board order: colour rank, TEWS desc, wait tie-break",
         "RED(TEWS 9) > RED(wait 10) > RED(wait 8) > ORANGE(wait 30) > ORANGE(wait 25) > YELLOW(wait 45) > YELLOW(wait 40)", t10)

    # --- deterioration watch ----------------------------------------------
    def t11():
        r = srv.call_tool("raise_recheck_flag", {"patient_ref": "P-012",
                                                 "clinician_name": ""}, "mstari-mcp")
        return (f"status={r.get('status')}", r.get("status") == "BLOCKED")
    case("T11 re-check flag is gated too (deterioration watch)", "BLOCKED without clinician", t11)

    def t12():
        r = srv.call_tool("raise_recheck_flag",
                          {"patient_ref": "P-012",
                           "clinician_name": "Sr. A. Wanjiru (Triage Nurse, evals)"},
                          "mstari-mcp")
        return (f"status={r.get('status')}, tews {r.get('tews_before')}->"
                f"{r.get('tews_after')}, delta={r.get('delta_tews')}",
                r.get("status") == "FLAG_RAISED" and r.get("delta_tews") == 3
                and r.get("tews_before") == 0 and r.get("tews_after") == 3)
    case("T12 re-check cites both vital sets and never changes the priority",
         "FLAG_RAISED with delta +3 (0->3); second look requested, verdict unchanged", t12)

    # --- guardrails (in-process) -------------------------------------------
    def t13():
        clean, hits = scrub("Working impression: possible malaria with pneumonia cover.", run_id)
        return (f"redacted {len(hits)} term(s); clean='{clean[:60]}...'",
                len(hits) == 2 and "malaria" not in clean and "pneumonia" not in clean)
    case("T13 diagnosis guardrail redacts LLM-style narrative", "2 terms redacted, none remain", t13)

    def t14():
        try:
            assert_no_prescription("Give paracetamol. Prescription: take two tablets.")
            return ("no exception raised", False)
        except ValueError:
            return ("prescription phrasing blocked", True)
    case("T14 prescription-like phrasing is hard-blocked", "guardrail raises", t14)

    # --- borrowed MCP server ------------------------------------------------
    def t15():
        borrowed = MCPClientProxy.borrowed_fetch_server(run_id)
        try:
            btools = borrowed.list_tools()
            return (f"tools={btools}", "fetch" in btools)
        finally:
            borrowed.close()
    try:
        case("T15 borrowed MCP server (official mcp-server-fetch, not our code) is callable",
             "fetch tool available from the official server", t15)
    except Exception as e:
        results.append({"task": "T15 borrowed MCP server",
                        "expected": "fetch tool available",
                        "observed": f"borrowed server unavailable: {e} "
                                    f"(pip install mcp-server-fetch)", "pass": False})

    # --- KNOWN UNFIXED FAILURE ---------------------------------------------
    def f1():
        # heuristic extraction has no negation handling; P-006 DENIES chest pain
        r = srv.call_tool("score_priority", {"patient_ref": "P-006",
                                             "discriminators": "[]"}, "mstari-mcp")
        return r.get("colour")
    try:
        got_colour = f1()
        f1_ok = got_colour == "GREEN"
    except Exception as e:
        got_colour, f1_ok = f"exception: {e}", False
    results.append({
        "task": "F1 KNOWN UNFIXED: negation handling - 'denies chest pain' still matches the "
                "chest-pain keyword, over-triaging P-006 to ORANGE (safe direction, wrong level). "
                "Next attempt: negation-scope pass in the extractor + a second LLM adjudicator "
                "vote. Left unfixed on purpose - see EVALS.md.",
        "expected": "GREEN (no discriminators apply)",
        "observed": f"colour={got_colour}",
        "pass": f1_ok,
        "known_failure": True,
    })

    srv.close()

    # --- report ------------------------------------------------------------
    counted = [r for r in results if not r.get("known_failure")]
    passed = sum(1 for r in counted if r["pass"])
    print(f"\nMstari evals - {passed}/{len(counted)} pass  (run {run_id})")
    print("-" * 100)
    for r in results:
        mark = "FAIL (known, unfixed - by design)" if (r.get("known_failure") and not r["pass"]) \
            else ("PASS" if r["pass"] else "FAIL")
        print(f"[{mark}] {r['task'][:120]}")
        print(f"       expected: {r['expected']}")
        print(f"       observed: {r['observed']}")
    print("-" * 100)
    out_dir = RUNS_DIR / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "eval_results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"results written to {out_dir / 'eval_results.json'}")
    print(f"tool-call audit log: {audit_path(run_id)}")
    return 0 if passed == len(counted) else 1


if __name__ == "__main__":
    sys.exit(main())
