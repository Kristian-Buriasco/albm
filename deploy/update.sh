#!/usr/bin/env bash
# Bare-metal update helper. Backs up the DB, swaps in a freshly built
# standalone bundle (preserving DATA_DIR), and restarts the service.
#
# Usage (from a checkout of the new version):
#   DATA_DIR=/opt/gallery/data APP_DIR=/opt/gallery SERVICE=gallery ./deploy/update.sh
#
# Assumes `npm ci && npm run build` succeeds in the current directory.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gallery}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
SERVICE="${SERVICE:-gallery}"

# The swap below deletes everything under APP_DIR: refuse obviously unsafe paths.
case "$APP_DIR" in
  ""|"/"|"$HOME"|"$HOME/") echo "Refusing to run: unsafe APP_DIR='$APP_DIR'" >&2; exit 1 ;;
esac
if [ "$(printf '%s' "$APP_DIR" | awk -F/ '{print NF}')" -lt 3 ]; then
  echo "Refusing to run: APP_DIR='$APP_DIR' is too shallow" >&2; exit 1
fi

echo ">> Building..."
npm ci
npm run build

echo ">> Backing up database..."
# The DB runs in WAL mode: a plain `cp` of gallery.db misses uncheckpointed
# writes. Use SQLite's online backup, or (after the service is stopped below)
# fall back to copying the db plus its -wal/-shm sidecars.
BACKUP_DONE=0
if [ -f "$DATA_DIR/gallery.db" ]; then
  mkdir -p "$DATA_DIR/backups"
  BACKUP="$DATA_DIR/backups/gallery-$(date +%Y%m%d-%H%M%S).db"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DATA_DIR/gallery.db" ".backup '$BACKUP'"
    BACKUP_DONE=1
  fi
fi

echo ">> Stopping $SERVICE..."
systemctl stop "$SERVICE" || true

if [ "$BACKUP_DONE" = 0 ] && [ -f "$DATA_DIR/gallery.db" ]; then
  echo ">> sqlite3 not found; copying db + WAL sidecars (service is stopped)..."
  BACKUP="${BACKUP:-$DATA_DIR/backups/gallery-$(date +%Y%m%d-%H%M%S).db}"
  mkdir -p "$DATA_DIR/backups"
  for ext in "" "-wal" "-shm"; do
    [ -f "$DATA_DIR/gallery.db$ext" ] && cp "$DATA_DIR/gallery.db$ext" "$BACKUP$ext"
  done
fi

echo ">> Swapping app files (preserving data)..."
# Remove old app files but keep the data directory if it lives under APP_DIR.
find "$APP_DIR" -mindepth 1 -maxdepth 1 \
  ! -name "$(basename "$DATA_DIR")" ! -name gallery.env -exec rm -rf {} +
cp -R .next/standalone/. "$APP_DIR/"
mkdir -p "$APP_DIR/.next"
cp -R .next/static "$APP_DIR/.next/static"

echo ">> Starting $SERVICE (migrations apply on boot)..."
systemctl start "$SERVICE"
echo ">> Done."
