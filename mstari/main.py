"""Mstari command line.

  python -m mstari.main synth     [--force]        generate bundled synthetic intake cards
  python -m mstari.main serve                      run the MCP server (stdio)
  python -m mstari.main demo      [options]        full agent run over the queue
  python -m mstari.main evals                      run the evaluation suite
"""
import argparse
import datetime
import sys
import uuid

from .config import load_dotenv
from .guardrails import SCOPE_BANNER

load_dotenv()


def cmd_synth(args):
    from .synth import generate
    paths = generate(force=args.force)
    print(f"synthetic intake cards ready ({len(paths)} files, all marked synthetic:true)")
    for p in paths:
        print(" ", p)


def cmd_serve(_args):
    from .mcp_server import mcp
    mcp.run()  # stdio


def cmd_demo(args):
    from .graph import run as run_graph
    import os
    run_id = args.run or ("demo-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
                          + "-" + uuid.uuid4().hex[:4])
    use_llm = args.llm if args.llm is not None else bool(os.environ.get("MSTARI_LLM_BASE_URL"))
    refs = [r.strip() for r in args.patients.split(",")] if args.patients else [
        "P-001", "P-002", "P-003", "P-004", "P-005",
        "P-006", "P-007", "P-008", "P-009", "P-010", "P-011", "P-012"]
    print(SCOPE_BANNER)
    print(f"run_id={run_id}  patients={len(refs)}  llm={'on' if use_llm else 'off (heuristic mode)'}\n")
    final = run_graph(
        patient_refs=refs, run_id=run_id, facility=args.facility,
        clinician=args.clinician, interactive=args.interactive, use_llm=use_llm)
    print("\n--- SUMMARY ---")
    print(final.get("summary", ""))
    if final.get("errors"):
        print("\nerrors:")
        for e in final["errors"]:
            print(" -", e)
    print("\nartifacts:")
    import pathlib
    run_dir = pathlib.Path("runs") / run_id
    for rel in ("queue_board.md", "draft_board.md", "audit_log.jsonl", "gate_ledger.json"):
        p = run_dir / rel
        if p.exists():
            print(" ", p)
    if not (final.get("clinician") or "").strip():
        print("\nRun stopped at the clinician gate (by design). Re-run with e.g.:")
        print(f'  python -m mstari.main demo --run {run_id} --clinician "Sr. A. Wanjiru (Triage Nurse)"')
    return 0


def cmd_evals(_args):
    from .evals import main as evals_main
    return evals_main()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="mstari", description="Mstari Triage Desk")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("synth", help="generate bundled synthetic intake cards")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_synth)

    p = sub.add_parser("serve", help="run the MCP server (stdio)")
    p.set_defaults(fn=cmd_serve)

    p = sub.add_parser("demo", help="full agent run over the synthetic queue")
    p.add_argument("--run", default="", help="run id (default: auto)")
    p.add_argument("--clinician", default="", help="approving clinician name+role")
    p.add_argument("--facility", default="Kitui County Referral Hospital - OPD triage desk (demo)")
    p.add_argument("--patients", default="", help="comma-separated patient refs (default: all)")
    p.add_argument("--interactive", action="store_true", help="prompt at the clinician gate")
    p.add_argument("--llm", dest="llm", action="store_true", default=None,
                   help="force LLM extraction (needs MSTARI_LLM_BASE_URL)")
    p.add_argument("--no-llm", dest="llm", action="store_false",
                   help="force heuristic extraction")
    p.set_defaults(fn=cmd_demo)

    p = sub.add_parser("evals", help="run the evaluation suite")
    p.set_defaults(fn=cmd_evals)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
