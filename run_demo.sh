#!/usr/bin/env bash
# Mstari Triage Desk - the one command.
#
#   ./run_demo.sh                          -> heuristic mode (fully offline)
#   ./run_demo.sh "Sr. A. Wanjiru (Triage Nurse)"   -> approved publish path
#
# Uses the open-weights lane automatically when Ollama is reachable
# (override the model with MSTARI_LLM_MODEL, e.g. qwen2.5:7b).
set -euo pipefail
cd "$(dirname "$0")"

CLINICIAN="${1:-}"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt

# Prefer the local open-weights lane when Ollama is up (data stays on-device).
if [ -z "${MSTARI_LLM_BASE_URL:-}" ]; then
  if curl -s --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
    export MSTARI_LLM_BASE_URL="http://localhost:11434/v1"
    export MSTARI_LLM_MODEL="${MSTARI_LLM_MODEL:-qwen2.5:7b}"
    echo "[mstari] open-weights lane: $MSTARI_LLM_MODEL via local Ollama"
  else
    echo "[mstari] no LLM endpoint configured - deterministic heuristic mode"
  fi
fi

RUN_ID="demo-$(date +%H%M%S)"
export MSTARI_RUN_ID="$RUN_ID"

python -m mstari.main synth --force
python -m mstari.main evals
if [ -n "$CLINICIAN" ]; then
  python -m mstari.main demo --run "$RUN_ID" --clinician "$CLINICIAN"
else
  # stop at the clinician gate (by design) and show how to complete the run
  python -m mstari.main demo --run "$RUN_ID" --no-llm || true
  echo
  echo "[mstari] the run above stopped at the clinician gate (by design)."
  echo "[mstari] to complete the publish, re-run with a named clinician:"
  echo "         ./run_demo.sh \"Your Name (Role)\""
fi

echo
echo "[mstari] artifacts in runs/$RUN_ID/ and runs/evals-*/"
echo "[mstari] queue board: runs/$RUN_ID/queue_board.md (when published)"
