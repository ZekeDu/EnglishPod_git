#!/usr/bin/env bash
# EnglishPod 365 backup helper
# Usage: DATABASE_URL=postgres://... [DATA_DIR=/path/to/data] tools/db/backup.sh [output_dir]

set -euo pipefail

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[backup] pg_dump not found in PATH" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup] DATABASE_URL is required" >&2
  exit 1
fi

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="${OUT_DIR}/englishpod-${STAMP}.dump"
ARCHIVE_CREATED=false

echo "[backup] dumping Postgres to ${DB_FILE}"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$DB_FILE"

if [[ -n "${DATA_DIR:-}" ]]; then
  if [[ -d "${DATA_DIR}/uploads" ]]; then
    AUDIO_ARCHIVE="${OUT_DIR}/uploads-${STAMP}.tar.gz"
    echo "[backup] archiving uploads/ to ${AUDIO_ARCHIVE}"
    tar -czf "$AUDIO_ARCHIVE" -C "$DATA_DIR" uploads
    ARCHIVE_CREATED=true
  fi
  if [[ -d "${DATA_DIR}/tts-cache" ]]; then
    TTS_ARCHIVE="${OUT_DIR}/tts-cache-${STAMP}.tar.gz"
    echo "[backup] archiving tts-cache/ to ${TTS_ARCHIVE}"
    tar -czf "$TTS_ARCHIVE" -C "$DATA_DIR" tts-cache
    ARCHIVE_CREATED=true
  fi
fi

echo "[backup] done."
echo "  database dump : ${DB_FILE}"
if [[ "${ARCHIVE_CREATED}" == "true" ]]; then
  echo "  asset archives: $(ls "${OUT_DIR}"/uploads-"${STAMP}".tar.gz 2>/dev/null || true) $(ls "${OUT_DIR}"/tts-cache-"${STAMP}".tar.gz 2>/dev/null || true)"
else
  echo "  asset archives: (skipped, DATA_DIR/uploads or DATA_DIR/tts-cache not found)"
fi
