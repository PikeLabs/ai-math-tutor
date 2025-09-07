#!/usr/bin/env bash
# backend/scripts/start_backend.sh
# Universal entrypoint for dev (Compose) and prod (App Runner).
# Behavior is controlled by environment variables (see table below).

set -euo pipefail

# Script dir = /app/backend/scripts → app dir = /app/backend
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# ── Prisma config ────────────────────────────────────────────────────────────
export PRISMA_SCHEMA="${PRISMA_SCHEMA:-/app/backend/prisma/schema.prisma}"
PRISMA_MIGRATE_MODE="${PRISMA_MIGRATE_MODE:-deploy}"        # deploy | dev
PRISMA_USE_NODEJS_BIN="${PRISMA_USE_NODEJS_BIN:-1}"         # use nodejs-bin from pip
PRISMA_FRESH="${PRISMA_FRESH:-0}"                           # 1 to wipe migrations and re-init
PRISMA_GENERATE_ON_BOOT="${PRISMA_GENERATE_ON_BOOT:-auto}"  # auto|0|1  (auto => only in dev)
PRISMA_DIR="$(dirname "$PRISMA_SCHEMA")"
MIGRATIONS_DIR="$PRISMA_DIR/migrations"

echo "▶ Using PRISMA_SCHEMA:      $PRISMA_SCHEMA"
echo "▶ PRISMA_MIGRATE_MODE:      $PRISMA_MIGRATE_MODE"
echo "▶ PRISMA_FRESH:        $PRISMA_FRESH"
echo "▶ PRISMA_GENERATE_ON_BOOT: $PRISMA_GENERATE_ON_BOOT"

# Optional: nuke migrations to start clean (dev convenience)
if [[ "$PRISMA_FRESH" == "1" ]]; then
  echo "⚠️  PRISMA_FRESH=1: removing $MIGRATIONS_DIR for a clean baseline"
  rm -rf "$MIGRATIONS_DIR"
fi

# Generate client only when it’s helpful:
# - dev: schema may have changed via bind mounts
# - or explicitly forced with PRISMA_GENERATE_ON_BOOT=1
if [ "$PRISMA_GENERATE_ON_BOOT" = "1" ] || \
   { [ "$PRISMA_GENERATE_ON_BOOT" = "auto" ] && [ "$PRISMA_MIGRATE_MODE" = "dev" ]; }; then
  echo "🛠  Running 'prisma generate' on boot..."
  python -m prisma generate --schema "$PRISMA_SCHEMA" || {
    echo "⚠️ prisma generate failed; continuing (site-packages client may already be present)";
  }
else
  echo "⏭  Skipping 'prisma generate' on boot (use PRISMA_GENERATE_ON_BOOT=1 to force)."
fi

# ── Migrations ───────────────────────────────────────────────────────────────
if [ "$PRISMA_MIGRATE_MODE" = "deploy" ]; then
  echo "🚀 'prisma migrate deploy'..."
  python -m prisma migrate deploy --schema "$PRISMA_SCHEMA"
elif [ "$PRISMA_MIGRATE_MODE" = "dev" ]; then
  echo "🧪 'prisma migrate dev' (dev only)..."
  python -m prisma migrate dev --schema "$PRISMA_SCHEMA" --name auto || true
  python -m prisma migrate deploy --schema "$PRISMA_SCHEMA" || true
else
  echo "⚠️ Unknown PRISMA_MIGRATE_MODE='$PRISMA_MIGRATE_MODE' (expected 'deploy' or 'dev'); skipping migrations."
fi

# ── Gunicorn settings ────────────────────────────────────────────────────────
PORT="${PORT:-5001}"                # App Runner injects PORT
GUNICORN_WORKERS="${GUNICORN_WORKERS:-2}"
GUNICORN_THREADS="${GUNICORN_THREADS:-8}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-120}"

EXTRA=""
if [ "${GUNICORN_RELOAD:-0}" = "1" ]; then
  EXTRA="--reload"
  echo "▶ Gunicorn reload enabled (dev)"
fi

echo "▶ Starting Gunicorn :$PORT (workers=$GUNICORN_WORKERS threads=$GUNICORN_THREADS timeout=$GUNICORN_TIMEOUT)"
exec gunicorn \
  --bind "0.0.0.0:${PORT}" \
  --workers "${GUNICORN_WORKERS}" \
  --threads "${GUNICORN_THREADS}" \
  --timeout "${GUNICORN_TIMEOUT}" \
  --log-level info \
  --access-logfile - \
  --error-logfile - \
  $EXTRA \
  wsgi:app