#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "请先在环境变量中设置 DATABASE_URL，例如：" >&2
  echo "  export DATABASE_URL=\"postgresql://user:pass@localhost:5432/englishpod\"" >&2
  exit 1
fi

OUTPUT_DIR=${1:-"backups"}
STAMP=$(date +"%Y%m%d-%H%M%S")
mkdir -p "$OUTPUT_DIR"

FILE="$OUTPUT_DIR/db-backup-$STAMP.sql"

echo ">> 导出数据库到 $FILE"
pg_dump "$DATABASE_URL" > "$FILE"

if [[ -n "${DATA_DIR:-}" && -d "${DATA_DIR}/tts-cache" ]]; then
  TAR="$OUTPUT_DIR/tts-cache-$STAMP.tar.gz"
  echo ">> 备份 TTS 缓存到 $TAR"
  tar -czf "$TAR" -C "$DATA_DIR" tts-cache
fi

echo "完成：$(ls -lh "$OUTPUT_DIR")"
