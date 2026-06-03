#!/bin/bash
# =============================================================================
# SpinFlow ERP — Production Database Restore
# =============================================================================
# Usage:
#   ./scripts/restore_prod.sh <backup_file.sql.gz>
#
# The restore targets the database specified in DATABASE_URL.
# ⚠️  THIS DESTROYS ALL DATA in the target database before restoring.
#
# Environment variables (set in .env or export before running):
#   DATABASE_URL — PostgreSQL connection string (target database)
#   CONFIRM      — set to "yes" to skip the confirmation prompt
# =============================================================================

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo "Example: $0 backups/spinflow_daily_20260101_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set. Export it or add to .env"
  exit 1
fi

DB_URL="${DATABASE_URL//+asyncpg/}"

echo "=============================================="
echo "  SpinFlow ERP — Database Restore"
echo "=============================================="
echo "  Backup file: $BACKUP_FILE"
echo "  Target:      $DB_URL"
echo "  Size:        $(ls -lh "$BACKUP_FILE" | awk '{print $5}')"
echo "=============================================="

if [ "${CONFIRM:-}" != "yes" ]; then
  echo ""
  echo "⚠️  WARNING: This will DESTROY ALL DATA in the target database."
  echo "   Type 'RESTORE' to confirm:"
  read -r CONFIRM_INPUT
  if [ "$CONFIRM_INPUT" != "RESTORE" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "[$(date)] Starting restore..."

if command -v psql &> /dev/null; then
  DECOMPRESSOR="zcat"
  if command -v gunzip &> /dev/null; then
    DECOMPRESSOR="gunzip -c"
  fi
  $DECOMPRESSOR "$BACKUP_FILE" | psql "$DB_URL"
else
  echo "[$(date)] psql not found locally — trying docker..."
  docker run -i --rm postgres:16-alpine psql "$DB_URL" < <(gunzip -c "$BACKUP_FILE")
fi

echo "[$(date)] Restore complete!"
echo "[$(date)] Run 'python -m alembic stamp head' and 'python scripts/seed_pilot.py' if needed."
