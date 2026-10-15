"""Mstari agent - LangGraph orchestration over MCP tools.

Graph shape (linear with one gate):

    plan -> intake -> extract -> score -> human_gate
                                        -> publish -> rank -> summarize   (if approved)
                                        -> summarize                      (if blocked)

Why an agent and not a script: the extract node decides what to do from each
card's actual complaint text (LLM discriminator extraction with a heuristic
fallback), failures are caught per node and degrade gracefully, and the gate
node genuinely stops the run before the irreversible publish.

Division of labour (the compliance core of this design):
    LLM (open-weights, e.g. Qwen via Ollama)  -> reads the complaint, emits
                                                 SATS discriminator codes
    scale.py (deterministic, cited)           -> computes TEWS + colour
    clinician (named human, gate)             -> confirms any priority before
                                                 it reaches the queue

The agent scores and sequences the queue. It never diagnoses, never
prescribes, never decides who gets seen.
"""
import json
import threading

from langgraph.graph import StateGraph, START, END
from typing import TypedDict

from .mcp_client import MCPClientProxy
from .audit import log_event
from . import llm
from .guardrails import SCOPE_BANNER, assert_no_prescription


class MstariState(TypedDict, total=False):
    run_id: str
    facility: str
    patient_refs: list[str]
    clinician: str              # empty = not approved -> gate blocks
    interactive: bool           # prompt at the gate if approval missing
    use_llm: bool

    plan: list[str]
    plan_source: str
    cards: list[dict]           # parsed intake cards
    extractions: list[dict]     # per-patient discriminator extraction
    scored: list[dict]          # score_priority tool results
    published: list[dict]       # confirm_priority tool results
    board: dict
    summary: str
    extraction_backend: str
    errors: list[str]
    stopped_at_gate: bool


# ----------------------------------------------------------------- helpers

class OwnServer:
    """One shared stdio connection to our MCP server, lazily created."""

    _instance = None
    _lock = threading.Lock()

    @classmethod
    def get(cls, run_id: str) -> MCPClientProxy:
        with cls._lock:
            if cls._instance is None:
                cls._instance = MCPClientProxy.own_server(run_id)
        return cls._instance


# ------------------------------------------------------------------- nodes

def plan_node(state: MstariState) -> dict:
    run_id = state["run_id"]
    n = len(state["patient_refs"])
    heuristic_plan = [
        f"parse_intake_record x{n} (synthetic cards)",
        "extract discriminators from each complaint (open-weights LLM task; heuristic fallback)",
        "score_priority xN -> DRAFT triage cards with citations",
        "human_gate -> named clinician approves publishing (agent stops if refused)",
        "confirm_priority xN -> priorities reach the queue",
        "rank_queue -> board ordered RED/ORANGE/YELLOW/GREEN with citations",
        "summarize",
    ]
    plan, plan_source = heuristic_plan, "heuristic"
    if state.get("use_llm"):
        out = llm.chat([
            {"role": "system", "content": "You are the planner of a hospital triage-queue "
             "agent. Reply with a numbered plan of tool calls only, max 7 lines, no prose."},
            {"role": "user", "content": json.dumps({
                "patients": state["patient_refs"], "facility": state.get("facility"),
                "available_tools": ["parse_intake_record", "score_priority",
                                    "confirm_priority (gated)", "rank_queue",
                                    "raise_recheck_flag (gated)", "list_discriminators"]})},
        ], max_tokens=250)
        if out and out.strip():
            plan = [ln.strip() for ln in out.strip().splitlines() if ln.strip()][:7]
            plan_source = "llm"
    log_event(run_id, "plan", {"plan_source": plan_source, "plan": plan})
    return {"plan": plan, "plan_source": plan_source}


def intake_node(state: MstariState) -> dict:
    srv = OwnServer.get(state["run_id"])
    cards, errors = [], []
    for ref in state["patient_refs"]:
        try:
            r = srv.call_tool("parse_intake_record", {"patient_ref": ref}, "mstari-mcp")
            if r.get("status") == "OK":
                cards.append(r["card"])
            else:
                errors.append(f"{ref}: {r.get('error', r.get('status'))}")
        except Exception as e:
            errors.append(f"{ref}: parse_intake_record failed: {e}")
    return {"cards": cards, "errors": errors}


def extract_node(state: MstariState) -> dict:
    """THE open-weights task: complaint text -> SATS discriminator codes.

    With use_llm the extraction runs on the configured open-weights model
    (Ollama by default). Without it, or if the model fails, the deterministic
    keyword fallback is used and labelled honestly in every downstream card."""
    extractions, errors = [], list(state.get("errors", []))
    backend = "keyword_fallback"
    for card in state.get("cards", []):
        ref = card.get("patient_ref")
        age = card.get("age_years")
        if isinstance(age, (int, float)) and age <= 12:
            extractions.append({"patient_ref": ref, "discriminators": [],
                                "source": "skipped_out_of_scope"})
            continue
        got = None
        if state.get("use_llm"):
            got = llm.extract_discriminators(card.get("complaint_text", ""), age)
        if got is not None:
            backend = got.get("backend", "llm")
            extractions.append({"patient_ref": ref, "discriminators": got["discriminators"],
                                "summary": got.get("summary", ""), "source": "llm"})
        else:
            extractions.append({"patient_ref": ref,
                                "discriminators": card.get("discriminators_reported", []),
                                "source": "reported_on_card"})
    log_event(state["run_id"], "extraction", {"backend": backend, "n": len(extractions)})
    return {"extractions": extractions, "errors": errors,
            "extraction_backend": backend if state.get("use_llm") else "keyword_fallback/reported"}


def score_node(state: MstariState) -> dict:
    srv = OwnServer.get(state["run_id"])
    scored, errors = [], []
    by_ref = {e["patient_ref"]: e for e in state.get("extractions", [])}
    for card in state.get("cards", []):
        ref = card["patient_ref"]
        ex = by_ref.get(ref, {"discriminators": [], "source": "unknown"})
        try:
            r = srv.call_tool("score_priority", {
                "patient_ref": ref,
                "discriminators": json.dumps(ex.get("discriminators", [])),
                "extraction_source": ex.get("source", "unknown"),
            }, "mstari-mcp")
            scored.append(r)
        except Exception as e:
            errors.append(f"{ref}: score_priority failed: {e}")
            scored.append({"status": "ERROR", "patient_ref": ref, "error": str(e)})
    return {"scored": scored, "errors": errors}


def human_gate_node(state: MstariState) -> dict:
    """Named clinician approves before the irreversible publish. Blocks otherwise."""
    run_id = state["run_id"]
    clinician = (state.get("clinician") or "").strip()
    if not clinician and state.get("interactive"):
        try:
            print("\n[GATE] confirm_priority publishes priority levels to the live queue.")
            print("[GATE] A named clinician must approve this irreversible step.")
            clinician = input("[GATE] Approving clinician (name + role, empty to refuse): ").strip()
        except (EOFError, KeyboardInterrupt):
            clinician = ""
    return {"clinician": clinician}


def route_after_gate(state: MstariState) -> str:
    return "publish" if (state.get("clinician") or "").strip() else "summarize"


def publish_node(state: MstariState) -> dict:
    srv = OwnServer.get(state["run_id"])
    published, errors = [], []
    for s in state.get("scored", []):
        ref = s.get("patient_ref")
        if s.get("status") != "DRAFT_WRITTEN":
            continue
        try:
            r = srv.call_tool("confirm_priority",
                              {"patient_ref": ref, "clinician_name": state.get("clinician", "")},
                              "mstari-mcp")
            published.append(r)
        except Exception as e:
            errors.append(f"{ref}: confirm_priority failed: {e}")
    return {"published": published, "errors": errors}


def rank_node(state: MstariState) -> dict:
    srv = OwnServer.get(state["run_id"])
    try:
        board = srv.call_tool("rank_queue",
                              {"facility_id": state.get("facility", "OPD-triage-desk")},
                              "mstari-mcp")
        return {"board": board}
    except Exception as e:
        return {"board": {"status": "ERROR", "reason": str(e)},
                "errors": list(state.get("errors", [])) + [f"rank_queue failed: {e}"]}


def summarize_node(state: MstariState) -> dict:
    run_id = state["run_id"]
    scored = state.get("scored", [])
    n_ok = sum(1 for s in scored if s.get("status") == "DRAFT_WRITTEN")
    n_pub = sum(1 for p in state.get("published", []) if p.get("status") == "CONFIRMED")
    escalated = [s.get("patient_ref") for s in scored
                 if s.get("status") in ("OUT_OF_SCOPE_ADULT_CHART", "INCOMPLETE", "ERROR")]
    base = (
        f"Facility: {state.get('facility')}. Cards parsed: {len(state.get('cards', []))}. "
        f"Draft priorities scored: {n_ok} (extraction backend: "
        f"{state.get('extraction_backend')}). Confirmed by clinician: {n_pub}. "
        f"Escalated, not scored: {escalated or 'none'}. "
    )
    if not (state.get("clinician") or "").strip():
        text = base + ("The agent stopped at the human gate: no named clinician approved, "
                       "so nothing reached the queue. Draft cards remain clearly marked DRAFT.")
    else:
        board = state.get("board") or {}
        text = base + (f"Queue board written to {board.get('board_file', 'n/a')} "
                       f"({board.get('confirmed_count', 0)} confirmed). " + SCOPE_BANNER)
    if state.get("use_llm"):
        refined = llm.chat([
            {"role": "system", "content": "Summarize this triage-queue run in 3 sentences "
             "for a triage nurse. Plain, factual. You must not diagnose, prescribe or "
             "decide who gets seen."},
            {"role": "user", "content": text}], max_tokens=250)
        if refined:
            text = refined
    try:
        assert_no_prescription(text)
    except ValueError as e:
        text = f"[guardrail] {e}"
    return {"summary": text}


# ------------------------------------------------------------------- graph

def build_graph() -> StateGraph:
    g = StateGraph(MstariState)
    g.add_node("plan", plan_node)
    g.add_node("intake", intake_node)
    g.add_node("extract", extract_node)
    g.add_node("score", score_node)
    g.add_node("human_gate", human_gate_node)
    g.add_node("publish", publish_node)
    g.add_node("rank", rank_node)
    g.add_node("summarize", summarize_node)

    g.add_edge(START, "plan")
    g.add_edge("plan", "intake")
    g.add_edge("intake", "extract")
    g.add_edge("extract", "score")
    g.add_edge("score", "human_gate")
    g.add_conditional_edges("human_gate", route_after_gate,
                            {"publish": "publish", "summarize": "summarize"})
    g.add_edge("publish", "rank")
    g.add_edge("rank", "summarize")
    g.add_edge("summarize", END)
    return g


def run(patient_refs: list[str], run_id: str, facility: str = "OPD-triage-desk",
        clinician: str = "", interactive: bool = False, use_llm: bool = False) -> MstariState:
    state: MstariState = {
        "run_id": run_id, "facility": facility, "patient_refs": patient_refs,
        "clinician": clinician, "interactive": interactive, "use_llm": use_llm,
        "errors": [],
    }
    app = build_graph().compile()
    final = app.invoke(state)
    log_event(run_id, "run_end", {"summary": final.get("summary", ""),
                                  "errors": final.get("errors", [])})
    return final
