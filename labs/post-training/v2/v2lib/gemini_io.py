"""One place for every Gemini request in v2: JSON output, cache, rate limit and a hard call cap.

The API key is read at call time by the parent lab (never printed, never stored).
A cached response is reused when the model, purpose and full prompt are identical.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from v2lib import setup

_STATE = {"calls": 0, "cache_hits": 0, "failures": 0, "last_call": 0.0, "model_versions": set(),
          "input_tokens": 0, "output_tokens": 0}


class CallCapReached(RuntimeError):
    pass


def stats() -> dict:
    s = dict(_STATE)
    s["model_versions"] = sorted(s["model_versions"])
    return s


_CLIENT = {}


def _client():
    """One long-lived client: google-genai closes a client once nothing references it."""
    if "c" not in _CLIENT:
        from src import lab  # main lab; reads GEMINI_API_KEY from the environment or .env at call time
        _CLIENT["c"] = lab.gemini_client()
    return _CLIENT["c"]


def call_json(prompt: str, schema: dict, *, purpose: str, cap: int, temperature: float = 0.0,
              model: str | None = None, cache_dir: str | Path | None = None) -> dict | list:
    """Return parsed JSON. Raises CallCapReached instead of exceeding `cap` uncached calls."""
    from google.genai import types
    c = setup.cfg()["judge"]
    model = model or c["model"]
    cache_root = setup.path(cache_dir or c["cache_dir"]) / purpose
    cache_root.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(json.dumps({"model": model, "prompt": prompt, "schema": schema,
                                     "temperature": temperature}, sort_keys=True).encode()).hexdigest()
    path = cache_root / f"{key}.json"
    if path.exists():
        _STATE["cache_hits"] += 1
        return json.loads(path.read_text())["parsed"]
    if _STATE["calls"] >= cap:
        raise CallCapReached(f"{purpose}: uncached Gemini call cap {cap} reached")
    gap = 60.0 / float(c["requests_per_minute"])
    wait = _STATE["last_call"] + gap - time.time()
    if wait > 0:
        time.sleep(wait)
    config = types.GenerateContentConfig(
        temperature=temperature, response_mime_type="application/json", response_json_schema=schema,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
    last_error = None
    for attempt in range(3):
        _STATE["calls"] += 1
        _STATE["last_call"] = time.time()
        try:
            r = _client().models.generate_content(model=model, contents=prompt, config=config)
            parsed = json.loads(r.text)
            if getattr(r, "model_version", None):
                _STATE["model_versions"].add(r.model_version)
            u = getattr(r, "usage_metadata", None)
            if u:
                _STATE["input_tokens"] += u.prompt_token_count or 0
                _STATE["output_tokens"] += (u.candidates_token_count or 0) + (u.thoughts_token_count or 0)
            path.write_text(json.dumps({"purpose": purpose, "model": model, "model_version": getattr(r, "model_version", None),
                                        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"), "parsed": parsed}, ensure_ascii=False))
            return parsed
        except Exception as exc:  # transient: rate limit / overload / malformed JSON
            last_error = exc
            _STATE["failures"] += 1
            msg = str(exc)
            if _STATE["calls"] >= cap:
                break
            time.sleep(30 if ("429" in msg or "RESOURCE_EXHAUSTED" in msg or "503" in msg) else 5)
    raise RuntimeError(f"Gemini request failed for {purpose}: {type(last_error).__name__}: {str(last_error)[:300]}")
