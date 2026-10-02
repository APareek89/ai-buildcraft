#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env.local ]]; then echo 'Run python3 scripts/setup-local.py first.'; exit 1; fi
set -a
source .env.local
set +a
if [[ ! -x api/.venv/bin/python || ! -d web/node_modules ]]; then echo 'Install API and web dependencies from README.md first.'; exit 1; fi
# Preview validation forbids any real provider key in the environment.
"$PLOTLINE_PG_CTL" -D "$PWD/.local/postgres" -l "$PWD/.local/postgres.log" -o "-h 127.0.0.1 -p $PLOTLINE_PG_PORT -k $PWD/.local" -w start
children=()
cleanup() {
  for pid in "${children[@]}"; do kill "$pid" 2>/dev/null || true; done
  "$PLOTLINE_PG_CTL" -D "$PWD/.local/postgres" -m fast -w stop >/dev/null || true
}
trap cleanup EXIT INT TERM
(cd api && exec .venv/bin/python -m uvicorn devrag.server:app --host 127.0.0.1 --port 8790) & children+=("$!")
(cd api && exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8600) & children+=("$!")
(cd web && exec node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 -p 3100) & children+=("$!")
while true; do
  for pid in "${children[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then echo "A preview service stopped; shutting down the preview."; exit 1; fi
  done
  sleep 1
done
