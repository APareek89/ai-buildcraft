#!/usr/bin/env bash
# Local development launcher. Configure .env.local as described in README.md.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/node_modules/next/dist/bin/next" dev "$DIR" --hostname 127.0.0.1 -p "${PORT:-8986}"
