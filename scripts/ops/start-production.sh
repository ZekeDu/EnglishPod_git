#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_PORT=${PORT:-4000}
WEB_PORT=${WEB_PORT:-3000}

cd "$ROOT"

if [[ ! -d "apps/api-nest/dist" || ! -d "apps/web-next/.next" ]]; then
  echo "未找到构建产物，请先运行 scripts/ops/deploy-production.sh" >&2
  exit 1
fi

echo ">> 启动 API 服务 (port=$API_PORT)"
node apps/api-nest/dist/main.js --port="$API_PORT" &
API_PID=$!

cleanup() {
  echo ">> 停止服务"
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo ">> 启动 Web 服务 (port=$WEB_PORT)"
cd apps/web-next
PORT="$WEB_PORT" NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE:-http://localhost:$API_PORT} npm run start
