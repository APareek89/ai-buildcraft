"""Shared plumbing for the post-training lab.

Deliberately thin. Anything that teaches a concept lives in the notebooks,
visible in the cells. This module only handles paths, configuration, API keys,
device selection and metrics so the notebooks stay readable.
"""
from __future__ import annotations
import json, os, re, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
GEN = DATA / "generated"
EVALS = ROOT / "evals"
RUNS = ROOT / "runs"
ADAPTERS = ROOT / "adapters"
MODELS = ROOT / "models"
CONFIGS = ROOT / "configs"
ENV_FILE = ROOT / ".env"

for _p in (RAW, GEN, EVALS, RUNS, ADAPTERS):
    _p.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------- API keys
# Keys are read from environment variables first, then from a git-ignored .env
# file in the project root (copy .env.example). Values are returned in memory
# only: never print them, never write them to a notebook output or a file.
KNOWN_KEYS = ("HF_TOKEN", "GEMINI_API_KEY", "OPENAI_API_KEY")


def _dotenv() -> dict:
    values = {}
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"^(?:export\s+)?([A-Za-z0-9_.\-]+)\s*=\s*(.*)$", line)
            if m:
                values[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return values


def load_secret(name: str) -> str:
    """Return one API key from the environment or .env. Raises KeyError if absent."""
    value = os.environ.get(name) or _dotenv().get(name)
    if not value:
        raise KeyError(f"{name} is not set. Export it in your shell, or add it to "
                       f"{ENV_FILE.name} in the project root (see .env.example).")
    return value


def has_secret(name: str) -> bool:
    try:
        return bool(load_secret(name))
    except KeyError:
        return False


def list_secret_names() -> list[str]:
    """Names of the known keys that are set. Never returns values."""
    return [k for k in KNOWN_KEYS if has_secret(k)]


def gemini_client():
    """Return a configured Gemini client. Key is read at call time."""
    from google import genai
    return genai.Client(api_key=load_secret("GEMINI_API_KEY"))


def hf_token() -> str | None:
    """Hugging Face token if set, else None. Public models do not need one."""
    return load_secret("HF_TOKEN") if has_secret("HF_TOKEN") else None


# ---------------------------------------------------------------- device
def resolve_device(preference: str | None = "auto") -> str:
    """'auto' picks CUDA, then Apple MPS, then CPU. An explicit choice must exist."""
    import torch
    pref = (preference or "auto").lower()
    if pref == "auto":
        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
        return "cpu"
    if pref == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("device 'mps' requested but Apple MPS is unavailable; use 'auto' or 'cpu'")
    if pref.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("device 'cuda' requested but CUDA is unavailable; use 'auto' or 'cpu'")
    return pref


def device() -> str:
    return cfg()["device"]["torch"]


def empty_cache() -> None:
    """Release cached accelerator memory after deleting a model."""
    import gc, torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()


# ---------------------------------------------------------------- config
def cfg() -> dict:
    """Load configs/config.yaml with paths and device resolved.

    model.base_path may be relative to the project root. Set the environment
    variable PTL_BASE_MODEL_PATH to use a copy of the model stored elsewhere.
    device.torch 'auto' is resolved to cuda, mps or cpu.
    """
    import yaml
    c = yaml.safe_load((CONFIGS / "config.yaml").read_text())
    override = os.environ.get("PTL_BASE_MODEL_PATH") or _dotenv().get("PTL_BASE_MODEL_PATH")
    base = Path(override or c["model"]["base_path"]).expanduser()
    c["model"]["base_path"] = str(base if base.is_absolute() else ROOT / base)
    c.setdefault("device", {})
    c["device"]["torch"] = resolve_device(c["device"].get("torch", "auto"))
    return c


# ---------------------------------------------------------------- data
def facts() -> dict:
    return json.loads((RAW / "facts.json").read_text())


def fact_index() -> dict:
    return {f["id"]: f for f in facts()["facts"]}


def eval_set(name: str = "heldout") -> list[dict]:
    return json.loads((EVALS / f"{name}.json").read_text())


# ---------------------------------------------------------------- metrics
def normalise(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[,₹$]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def contains_value(answer: str, value, unit: str | None = None) -> bool:
    """Did the answer state this value? Numeric-aware, not exact-match."""
    a = normalise(answer)
    if isinstance(value, (int, float)):
        for tok in re.findall(r"\d+(?:\.\d+)?", a.replace(",", "")):
            try:
                if abs(float(tok) - float(value)) < 1e-6:
                    return True
            except ValueError:
                continue
        return False
    return normalise(str(value)) in a


REFUSAL_MARKERS = (
    "don't know", "do not know", "not sure", "cannot answer", "can't answer",
    "no information", "not in the", "not stated", "unable to", "not specified",
    "i don't have", "i do not have", "not covered",
)


def looks_like_refusal(answer: str) -> bool:
    a = answer.lower()
    return any(m in a for m in REFUSAL_MARKERS)


def score_answer(answer: str, item: dict, fidx: dict) -> dict:
    """Deterministic scoring against ground truth.

    Returns correct / hallucinated / refused. Note the asymmetry that matters:
    refusing an answerable question is a miss, but refusing an UNANSWERABLE
    question is the correct behaviour. Those are tracked separately on purpose.
    """
    refused = looks_like_refusal(answer)
    if item["answerable"]:
        f = fidx[item["fact_id"]]
        correct = contains_value(answer, f["value"], f.get("unit"))
        return {
            "answerable": True,
            "correct": bool(correct and not refused),
            "refused": refused,
            "hallucinated": bool(not correct and not refused),
        }
    return {
        "answerable": False,
        "correct": refused,          # correct behaviour here IS refusing
        "refused": refused,
        "hallucinated": not refused, # inventing an answer to an unanswerable Q
    }


def summarise(rows: list[dict]) -> dict:
    ans = [r for r in rows if r["answerable"]]
    una = [r for r in rows if not r["answerable"]]
    n = lambda xs: max(len(xs), 1)
    return {
        "n_total": len(rows),
        "n_answerable": len(ans),
        "n_unanswerable": len(una),
        "accuracy_answerable": round(sum(r["correct"] for r in ans) / n(ans), 4),
        "hallucination_rate_answerable": round(sum(r["hallucinated"] for r in ans) / n(ans), 4),
        "over_refusal_rate": round(sum(r["refused"] for r in ans) / n(ans), 4),
        "appropriate_refusal_rate": round(sum(r["refused"] for r in una) / n(una), 4),
        "hallucination_rate_unanswerable": round(sum(r["hallucinated"] for r in una) / n(una), 4),
    }


# ---------------------------------------------------------------- runs
def save_run(name: str, payload: dict) -> Path:
    RUNS.mkdir(exist_ok=True)
    p = RUNS / f"{name}.json"
    payload = dict(payload)
    payload.setdefault("saved_at", time.strftime("%Y-%m-%d %H:%M:%S"))
    p.write_text(json.dumps(payload, indent=2))
    return p


def load_runs() -> dict:
    return {p.stem: json.loads(p.read_text()) for p in sorted(RUNS.glob("*.json"))}
