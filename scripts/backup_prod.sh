#!/bin/bash
# =============================================================================
# SpinFlow ERP — Production Database Backup
# =============================================================================
# Usage:
#   ./scripts/backup_prod.sh                  # daily backup (default)
#   ./scripts/backup_prod.sh weekly           # weekly backup (kept 30 days)
#   ./scripts/backup_prod.sh manual           # manual backup (kept forever)
#
# Environment variables (set in .env or export before running):
#   DATABASE_URL  — PostgreSQL connection string (production Supabase URL)
#   BACKUP_DIR    — where to store backups (default: ../backups)
#   AWS_S3_BUCKET — if set, also uploads to S3 (optional)
# =============================================================================

set -euo pipefail

MODE="${1:-daily}"
DATE=$(date +%Y%m%d_%H%M%S)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$SCRIPT_DIR")/backups}"
mkdir -p "$BACKUP_DIR"

# Source .env if available
if [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set. Export it or add to .env"
  exit 1
fi

# Extract connection parts from DATABASE_URL (format: postgresql://user:pass@host:port/db)
# Handle both asyncpg and regular pg URLs
DB_URL="${DATABASE_URL//+asyncpg/}"  # strip +asyncpg suffix

echo "[$(date)] === SpinFlow Database Backup ($MODE) ==="
echo "[$(date)] Backup dir: $BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/spinflow_${MODE}_${DATE}.sql.gz"
GZIPPED=true

# ── Perform Backup ──────────────────────────────────────────────────────────
echo "[$(date)] Running pg_dump..."
if command -v pg_dump &> /dev/null; then
  pg_dump "$DB_URL" --no-owner --no-acl | gzip > "$BACKUP_FILE"
else
  echo "[$(date)] pg_dump not found locally — trying docker..."
  docker run --rm postgres:16-alpine pg_dump "$DB_URL" --no-owner --no-acl | gzip > "$BACKUP_FILE"
fi

echo "[$(date)] Backup written: $BACKUP_FILE"
ls -lh "$BACKUP_FILE"

# ── Retention Policy ────────────────────────────────────────────────────────
case "$MODE" in
  daily)
    # Keep daily backups for 7 days
    find "$BACKUP_DIR" -name "spinflow_daily_*.sql.gz" -mtime +7 -delete
    echo "[$(date)] Daily retention: kept 7 days"
    ;;
  weekly)
    # Keep weekly backups for 30 days
    find "$BACKUP_DIR" -name "spinflow_weekly_*.sql.gz" -mtime +30 -delete
    echo "[$(date)] Weekly retention: kept 30 days"
    ;;
  manual)
    echo "[$(date)] Manual backup — kept indefinitely"
    ;;
esac

# ── S3 Upload (optional) ────────────────────────────────────────────────────
if [ -n "${AWS_S3_BUCKET:-}" ]; then
  if command -v aws &> /dev/null; then
    echo "[$(date)] Uploading to S3: s3://$AWS_S3_BUCKET/backups/"
    aws s3 cp "$BACKUP_FILE" "s3://$AWS_S3_BUCKET/backups/$(basename "$BACKUP_FILE")"
    echo "[$(date)] S3 upload complete"
  else
    echo "[$(date)] WARNING: AWS CLI not found — skipping S3 upload"
  fi
fi

echo "[$(date)] === Backup complete ==="
