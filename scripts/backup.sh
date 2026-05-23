#!/bin/bash
set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

echo "Starting database backup at $(date)..."

docker compose exec -T postgres pg_dump -U spinflow spinflow_db \
  > "$BACKUP_DIR/spinflow_$DATE.sql"

echo "Backup saved to $BACKUP_DIR/spinflow_$DATE.sql"

# Delete backups older than 7 days
find "$BACKUP_DIR" -name "spinflow_*.sql" -mtime +7 -delete
echo "Cleaned up backups older than 7 days."
echo "Backup complete."
