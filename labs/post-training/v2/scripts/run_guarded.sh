#!/bin/bash
# Usage: scripts/run_guarded.sh <label> <command...>
# Runs a heavy job with the memory watchdog attached; the job's own output goes to logs/<label>.out
cd "$(dirname "$0")/.." || exit 1
LABEL="$1"; shift
export PYTHONDONTWRITEBYTECODE=1 PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.5 PYTORCH_MPS_LOW_WATERMARK_RATIO=0.4 TOKENIZERS_PARALLELISM=false
"$@" > "logs/${LABEL}.out" 2>&1 &
JOB=$!
../.venv/bin/python scripts/watchdog.py "$JOB" "$LABEL" &
WD=$!
wait "$JOB"; CODE=$?
sleep 1; kill "$WD" 2>/dev/null; wait "$WD" 2>/dev/null
echo "[$LABEL] exit code $CODE" | tee -a "logs/${LABEL}.out"
tail -3 "logs/watchdog_${LABEL}.log"
exit $CODE
