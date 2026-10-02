"""Locate the v2 folder and the read-only parent lab, and make both importable.

The parent package is called `src`; this one is `v2lib`, so the two never collide.
Importing this module also applies the memory-safety environment variables, which
must be set before torch is imported.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _find_v2_root(start: Path | None = None) -> Path:
    here = (start or Path.cwd()).resolve()
    for candidate in (here, *here.parents):
        if (candidate / "configs" / "v2.yaml").is_file():
            return candidate
    # Fallback: this file lives at <V2_ROOT>/v2lib/setup.py
    return Path(__file__).resolve().parents[1]


V2_ROOT = _find_v2_root()
PARENT = V2_ROOT.parent
for path in (str(PARENT), str(V2_ROOT)):
    if path in sys.path:
        sys.path.remove(path)
sys.path.insert(0, str(PARENT))   # parent `src` package (read-only)
sys.path.insert(0, str(V2_ROOT))  # this experiment's `v2lib`

# Never write .pyc files into the parent's src/__pycache__.
os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
sys.dont_write_bytecode = True


def cfg() -> dict:
    import yaml
    return yaml.safe_load((V2_ROOT / "configs" / "v2.yaml").read_text())


def path(value: str | Path) -> Path:
    """Resolve a config path relative to the v2 folder ('../x' reaches the parent)."""
    p = Path(value).expanduser()
    return p if p.is_absolute() else (V2_ROOT / p).resolve()


def apply_memory_safety(config: dict | None = None) -> None:
    """Cap PyTorch's MPS allocator so an oversized job fails cleanly instead of swapping the Mac."""
    c = (config or cfg())["memory_safety"]
    os.environ.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", str(c["mps_high_watermark_ratio"]))
    os.environ.setdefault("PYTORCH_MPS_LOW_WATERMARK_RATIO", str(c["mps_low_watermark_ratio"]))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    if Path("/workspace").is_dir():           # RunPod: keep model downloads on the network volume
        os.environ.setdefault("HF_HOME", "/workspace/hf")


apply_memory_safety()


def read_json(p):
    return json.loads(Path(p).read_text())


def write_json(p, value):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False))
    tmp.replace(p)
    return p


def read_jsonl(p):
    return [json.loads(line) for line in Path(p).read_text().splitlines() if line.strip()]


def write_jsonl(p, rows):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    return p


def progress(name: str, message: str) -> None:
    """Append a timestamped line to logs/progress_<name>.log (visible while a notebook runs headless)."""
    import time as _t
    log = V2_ROOT / "logs" / f"progress_{name}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a") as fh:
        fh.write(f"{_t.strftime('%H:%M:%S')} {message}\n")
