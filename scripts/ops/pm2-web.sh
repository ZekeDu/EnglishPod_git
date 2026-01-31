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
WEB_PORT=${WEB_PORT:-3000}
export NODE_ENV=${NODE_ENV:-production}

# Note: NEXT_PUBLIC_* is injected at build time. This is mainly a convenience default.
export NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE:-http://127.0.0.1:$API_PORT}

cd apps/web-next
export PORT="$WEB_PORT"
exec npm run start

