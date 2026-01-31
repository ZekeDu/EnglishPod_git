#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

API_PORT=${PORT:-4000}
export PORT="$API_PORT"
export NODE_ENV=${NODE_ENV:-production}

exec node apps/api-nest/dist/main.js

