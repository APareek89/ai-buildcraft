"""Device, dtype, base-model path and a small memory read-out for notebooks."""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

from v2lib import setup


def device() -> str:
    want = os.environ.get("LAB_DEVICE") or setup.cfg()["device"]["torch"]
    if want != "auto":
        return want
    import torch
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def dtype():
    import torch
    name = os.environ.get("LAB_DTYPE") or setup.cfg()["device"]["dtype"]
    if name == "auto":
        return torch.bfloat16 if device() == "cuda" else torch.float32
    return {"float32": torch.float32, "bfloat16": torch.bfloat16, "float16": torch.float16}[name]


def base_model_path() -> str:
    """PTL_BASE_MODEL_PATH (or LAB_BASE_MODEL) > the local download > the Hugging Face id."""
    c = setup.cfg()["model"]
    for var in ("PTL_BASE_MODEL_PATH", "LAB_BASE_MODEL"):
        if os.environ.get(var):
            return os.environ[var]
    local = setup.path(c["local_path"])
    return str(local) if local.is_dir() else c["hf_id"]


def empty_cache() -> None:
    import gc
    import torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()


def memory_report(label: str = "") -> dict:
    """System free %, swap and this process's footprint. macOS only; returns {} elsewhere."""
    out = {}
    try:
        text = subprocess.run(["memory_pressure"], capture_output=True, text=True, timeout=10).stdout
        m = re.search(r"free percentage:\s*(\d+)%", text)
        out["system_free_percent"] = int(m.group(1)) if m else None
        swap = subprocess.run(["sysctl", "-n", "vm.swapusage"], capture_output=True, text=True).stdout
        m = re.search(r"used = ([\d.]+)M", swap)
        out["swap_used_gb"] = round(float(m.group(1)) / 1024, 2) if m else None
        fp = subprocess.run(["footprint", "-p", str(os.getpid())], capture_output=True, text=True, timeout=20).stdout
        m = re.search(r"Footprint:\s*([\d.]+)\s*([KMG])B", fp)
        if m:
            scale = {"K": 1 / 1048576, "M": 1 / 1024, "G": 1}[m.group(2)]
            out["process_footprint_gb"] = round(float(m.group(1)) * scale, 2)
    except Exception:
        pass
    try:
        import torch
        if torch.backends.mps.is_available():
            out["mps_driver_gb"] = round(torch.mps.driver_allocated_memory() / 1e9, 2)
    except Exception:
        pass
    print(f"[memory{(' · ' + label) if label else ''}]", out)
    return out
