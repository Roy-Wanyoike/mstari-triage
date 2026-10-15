"""LLM lane for Mstari.

Two OpenAI-compatible lanes, selected by env:

  1. Sovereign open-weights lane (required by the track for one full task):
       MSTARI_LLM_BASE_URL=http://localhost:11434/v1   (Ollama, e.g. qwen2.5:7b)
       MSTARI_LLM_MODEL=qwen2.5:7b
     Patient data cannot leave the country: this lane runs on the operator's
     own machine. It is the default demo lane.

  2. Frontier lane, synthetic data only:
       MSTARI_LLM_BASE_URL=https://api-inference.modelscope.ai/v1
       MSTARI_LLM_API_KEY=...   MSTARI_LLM_MODEL=Qwen-Ambassador/Qwen3.7-Max

If no endpoint is configured or reachable, the agent runs in deterministic
heuristic mode so the repository always executes end-to-end (the README says
honestly which mode a run used).

What the LLM does and does not do:
  DOES   - read the free-text complaint and return structured discriminator
           codes from the cited SATS list, plus a plain-language summary.
  DOESNT - compute the score (deterministic scale.py), diagnose (guardrails
           scrub applies), or decide anything (clinician gate).
"""
import os
import httpx

from .guardrails import scrub

DEFAULT_TIMEOUT = 25.0


def llm_config() -> dict | None:
    base = os.environ.get("MSTARI_LLM_BASE_URL")
    model = os.environ.get("MSTARI_LLM_MODEL")
    key = os.environ.get("MSTARI_LLM_API_KEY", "")
    if not base or not model:
        return None
    return {"base_url": base.rstrip("/"), "model": model, "api_key": key}


def chat(messages: list[dict], max_tokens: int = 700) -> str | None:
    """One chat completion; returns None on any failure (agent degrades to heuristics)."""
    cfg = llm_config()
    if cfg is None:
        return None
    headers = {"Content-Type": "application/json"}
    if cfg["api_key"]:
        headers["Authorization"] = f"Bearer {cfg['api_key']}"
    try:
        r = httpx.post(
            f"{cfg['base_url']}/chat/completions",
            headers=headers,
            json={"model": cfg["model"], "messages": messages, "max_tokens": max_tokens,
                  "temperature": 0.2},
            timeout=DEFAULT_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        # narrative guardrail before anything downstream sees model output
        clean, _hits = scrub(content)
        return clean
    except Exception:
        return None


def extract_discriminators(complaint_text: str, age_years: int | None) -> dict | None:
    """THE open-weights task: intake understanding.

    Asks the model to map a presenting complaint onto the SATS discriminator
    list (codes only, JSON). Returns dict or None on any failure.
    """
    cfg = llm_config()
    if cfg is None:
        return None
    system = (
        "You are the intake reader at a triage desk. Map the patient's presenting "
        "complaint onto this EXACT list of discriminator codes only: sob_acute, "
        "coughing_blood, haemorrhage_uncontrolled, haemorrhage_controlled, "
        "seizure_current, seizure_postictal, loc_reduced, fracture_compound, "
        "burn_face_inhalation, poisoning_overdose, vomiting_fresh_blood, "
        "pregnancy_pv_bleed, pregnancy_trauma_or_pain, chest_pain, abdominal_pain, "
        "psychosis_aggression, pain_severe, pain_moderate, pain_mild, all_other. "
        "Pay attention to negation: 'denies chest pain' means chest_pain is NOT "
        "present. Reply with strict JSON: {\"discriminators\": [codes], "
        "\"summary\": \"one factual sentence, no diagnosis, no medication\"}. "
        "You must not diagnose, prescribe, or invent codes outside the list.")
    user = f"Patient age: {age_years} years.\nPresenting complaint: {complaint_text}"
    raw = chat([
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ], max_tokens=300)
    if not raw:
        return None
    import json
    try:
        start, end = raw.find("{"), raw.rfind("}")
        parsed = json.loads(raw[start:end + 1])
        codes = [c for c in parsed.get("discriminators", [])
                 if c in {"sob_acute", "coughing_blood", "haemorrhage_uncontrolled",
                          "haemorrhage_controlled", "seizure_current", "seizure_postictal",
                          "loc_reduced", "fracture_compound", "burn_face_inhalation",
                          "poisoning_overdose", "vomiting_fresh_blood", "pregnancy_pv_bleed",
                          "pregnancy_trauma_or_pain", "chest_pain", "abdominal_pain",
                          "psychosis_aggression", "pain_severe", "pain_moderate",
                          "pain_mild", "all_other"}]
        return {"discriminators": codes,
                "summary": parsed.get("summary", ""),
                "backend": f"{cfg['model']}"}
    except Exception:
        return None
