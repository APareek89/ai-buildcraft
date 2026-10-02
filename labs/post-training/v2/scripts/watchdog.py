"""Memory watchdog for long jobs on a 24 GB Mac.

Usage: python scripts/watchdog.py <pid> <label>
Every 15 s it records system free %, swap used and the physical footprint of <pid>
plus all its child processes (the Jupyter kernel runs as a child of nbconvert).
It stops the job (SIGTERM, then SIGKILL) when any limit from configs/v2.yaml is
crossed for two consecutive checks, and exits when the job ends.
"""
import json
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import yaml  # noqa: E402

LIMITS = yaml.safe_load((ROOT / "configs/v2.yaml").read_text())["memory_safety"]


def sh(*args, timeout=20):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def free_percent():
    m = re.search(r"free percentage:\s*(\d+)%", sh("memory_pressure"))
    return int(m.group(1)) if m else None


def swap_gb():
    m = re.search(r"used = ([\d.]+)M", sh("sysctl", "-n", "vm.swapusage"))
    return float(m.group(1)) / 1024 if m else None


def tree(pid):
    pids, frontier = [pid], [pid]
    while frontier:
        nxt = []
        for p in frontier:
            nxt += [int(x) for x in sh("pgrep", "-P", str(p)).split()]
        pids += nxt
        frontier = nxt
    return pids


def footprint_gb(pid):
    m = re.search(r"Footprint:\s*([\d.]+)\s*([KMG])B", sh("footprint", "-p", str(pid)))
    if not m:
        return 0.0
    return float(m.group(1)) * {"K": 1 / 1048576, "M": 1 / 1024, "G": 1}[m.group(2)]


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def main():
    pid, label = int(sys.argv[1]), sys.argv[2]
    log = ROOT / "logs" / f"watchdog_{label}.log"
    swap0 = swap_gb() or 0.0
    strikes, peak = 0, {"job_gb": 0.0, "min_free": 100, "swap_growth": 0.0}
    with log.open("a") as fh:
        fh.write(json.dumps({"event": "start", "pid": pid, "label": label, "swap_start_gb": round(swap0, 2),
                             "limits": LIMITS, "t": time.strftime("%H:%M:%S")}) + "\n")
        while alive(pid):
            procs = tree(pid)
            job = sum(footprint_gb(p) for p in procs)
            free, swap = free_percent(), swap_gb()
            growth = (swap - swap0) if swap is not None else 0.0
            peak["job_gb"] = max(peak["job_gb"], job)
            peak["min_free"] = min(peak["min_free"], free if free is not None else 100)
            peak["swap_growth"] = max(peak["swap_growth"], growth)
            reasons = []
            if free is not None and free < LIMITS["min_free_percent"]:
                reasons.append(f"system free {free}% < {LIMITS['min_free_percent']}%")
            if growth > LIMITS["max_swap_growth_gb"]:
                reasons.append(f"swap grew {growth:.1f} GB > {LIMITS['max_swap_growth_gb']} GB")
            if job > LIMITS["max_job_footprint_gb"]:
                reasons.append(f"job footprint {job:.1f} GB > {LIMITS['max_job_footprint_gb']} GB")
            strikes = strikes + 1 if reasons else 0
            fh.write(json.dumps({"t": time.strftime("%H:%M:%S"), "job_gb": round(job, 2), "free_pct": free,
                                 "swap_gb": round(swap or 0, 2), "swap_growth_gb": round(growth, 2),
                                 "procs": len(procs), "warn": reasons}) + "\n")
            fh.flush()
            if strikes >= 2:
                fh.write(json.dumps({"event": "STOPPING JOB", "reasons": reasons, "t": time.strftime("%H:%M:%S")}) + "\n")
                fh.flush()
                for p in reversed(procs):
                    try:
                        os.kill(p, signal.SIGTERM)
                    except OSError:
                        pass
                time.sleep(10)
                for p in reversed(procs):
                    if alive(p):
                        try:
                            os.kill(p, signal.SIGKILL)
                        except OSError:
                            pass
                break
            time.sleep(15)
        fh.write(json.dumps({"event": "end", "peak": {k: round(v, 2) for k, v in peak.items()},
                             "t": time.strftime("%H:%M:%S")}) + "\n")


if __name__ == "__main__":
    main()
