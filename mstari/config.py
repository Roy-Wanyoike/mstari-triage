"""Shared paths and configuration for Mstari."""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
PATIENTS_DIR = DATA_DIR / "synthetic" / "patients"
REFS_DIR = DATA_DIR / "references"
RUNS_DIR = REPO_ROOT / "runs"

# LLM lanes (both OpenAI-compatible).
#   Sovereign open-weights lane (required by the track for one full task):
#     MSTARI_LLM_BASE_URL=http://localhost:11434/v1   (Ollama serving Qwen/Llama/...)
#     MSTARI_LLM_MODEL=qwen2.5:7b
#   Frontier lane, synthetic data only (all Mstari data is synthetic):
#     MSTARI_LLM_BASE_URL=https://api-inference.modelscope.ai/v1
#     MSTARI_LLM_API_KEY=...
# Patient data never leaves the machine by default: no endpoint configured
# means the agent runs in deterministic heuristic mode and says so honestly.
LLM_BASE_URL = os.environ.get("MSTARI_LLM_BASE_URL")
LLM_MODEL = os.environ.get("MSTARI_LLM_MODEL")
LLM_API_KEY = os.environ.get("MSTARI_LLM_API_KEY", "")

RUN_ID = os.environ.get("MSTARI_RUN_ID", "adhoc")


def load_dotenv(path: Path | None = None) -> None:
    """Tiny .env loader (no external dependency). Never overrides real env."""
    p = path or (REPO_ROOT / ".env")
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v
    # re-read resolved settings
    global LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, RUN_ID
    LLM_BASE_URL = os.environ.get("MSTARI_LLM_BASE_URL")
    LLM_MODEL = os.environ.get("MSTARI_LLM_MODEL")
    LLM_API_KEY = os.environ.get("MSTARI_LLM_API_KEY", "")
    RUN_ID = os.environ.get("MSTARI_RUN_ID", "adhoc")
