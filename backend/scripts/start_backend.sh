#!/usr/bin/env bash
# Docker's entrypoint script to start the backend service and run migrations

set -euo pipefail

# Script dir = /app/backend/scripts → app dir = /app/backend
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# ── Prisma env ────────────────────────────────────────────────────────────────
# Prisma schema lives under backend/prisma
export PRISMA_SCHEMA="${PRISMA_SCHEMA:-/app/backend/prisma/schema.prisma}"
PRISMA_DIR="$(dirname "$PRISMA_SCHEMA")"
MIGRATIONS_DIR="$PRISMA_DIR/migrations"

# Controls (local Docker only)
PRISMA_MIGRATE_MODE="${PRISMA_MIGRATE_MODE:-dev}"  # dev|deploy
PRISMA_FRESH="${PRISMA_FRESH:-0}"                  # 1 to wipe migrations and re-init

echo "▶ Using PRISMA_SCHEMA: $PRISMA_SCHEMA"
echo "▶ PRISMA_MIGRATE_MODE: $PRISMA_MIGRATE_MODE"
echo "▶ PRISMA_FRESH:        $PRISMA_FRESH"

# Optional: nuke migrations to start clean (dev convenience)
if [[ "$PRISMA_FRESH" == "1" ]]; then
  echo "⚠️  PRISMA_FRESH=1: removing $MIGRATIONS_DIR for a clean baseline"
  rm -rf "$MIGRATIONS_DIR"
fi

# Generate client (idempotent)
python -m prisma generate --schema "$PRISMA_SCHEMA"

# Migrations
if [[ ! -d "$MIGRATIONS_DIR" || -z "$(ls -A "$MIGRATIONS_DIR" 2>/dev/null)" ]]; then
  echo "🆕 No migrations found. Creating baseline 'init' migration…"
  python -m prisma migrate dev --schema "$PRISMA_SCHEMA" --name init
else
  if [[ "$PRISMA_MIGRATE_MODE" == "deploy" ]]; then
    echo "🚀 Running 'prisma migrate deploy'…"
    python -m prisma migrate deploy --schema "$PRISMA_SCHEMA"
  else
    echo "🧪 Running 'prisma migrate dev'…"
    python -m prisma migrate dev --schema "$PRISMA_SCHEMA" --name auto || true
    python -m prisma migrate deploy --schema "$PRISMA_SCHEMA" || true
  fi
fi

# Re-generate (cheap & safe)
python -m prisma generate --schema "$PRISMA_SCHEMA"

# Launch Gunicorn (backend/app.py:app)
exec gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 2 --timeout 120 wsgi:app
