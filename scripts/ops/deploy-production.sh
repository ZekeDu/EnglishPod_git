#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f ".env" ]]; then
  # Load env for prisma migrate and Next build-time NEXT_PUBLIC_* variables.
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

echo ">> 安装依赖（仅第一次或依赖更新时需要）"
npm install --production=false

echo ">> 生成 Prisma Client"
npm run prisma:generate

echo ">> 执行数据库迁移（需要数据库已配置）"
npx prisma migrate deploy --schema apps/api-nest/prisma/schema.prisma

echo ">> 构建后端与前端"
npm run build

echo ">> 构建完成，生成目录："
ls -lh apps/api-nest/dist apps/web-next/.next 2>/dev/null || true
