"""Dedicated backup service — no deletion side effects."""
import json
import logging
import os
import io
import zipfile
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select

from app.models.retention import BackupJob

logger = logging.getLogger(__name__)

BACKUP_DIR = os.getenv("BACKUP_DIR", "backups")

BACKUP_TABLES = [
    ("companies", "id", None),
    ("mills", "company_id", None),
    ("master_departments", "mill_id", "mill"),
    ("employees", "mill_id", "mill"),
    ("machines", "mill_id", "mill"),
    ("lots", "mill_id", "mill"),
    ("warehouses", "mill_id", "mill"),
    ("customers", "mill_id", "mill"),
    ("suppliers", "mill_id", "mill"),
    ("sales_orders", "mill_id", "mill"),
    ("invoices", "mill_id", "mill"),
    ("company_modules", "company_id", None),
    ("user_modules", "company_id", None),
    ("billing_invoices", "company_id", None),
    ("company_subscriptions", "company_id", None),
]


class BackupService:
    """Creates and manages backup jobs without any deletion logic."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_backup(
        self,
        company_id: Optional[str] = None,
        backup_type: str = "full",
    ) -> tuple[str, Optional[str], int, int]:
        """Generate a ZIP backup of company data.

        Returns (backup_id, file_path, file_size_bytes, rows_backed_up).
        """
        backup_id = str(uuid.uuid4())
        os.makedirs(BACKUP_DIR, exist_ok=True)
        buf = io.BytesIO()

        total_rows = 0
        mill_ids: list[str] = []

        if company_id:
            mills_q = await self.db.execute(
                text("SELECT id FROM mills WHERE company_id = :p"), {"p": company_id}
            )
            mill_ids = [r[0] for r in mills_q.fetchall()]

        mill_expr = ",".join(f"'{m}'" for m in mill_ids) if mill_ids else "''"

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for table, col, scope in BACKUP_TABLES:
                try:
                    if col and scope == "mill" and mill_ids:
                        rows = (
                            await self.db.execute(
                                text(f"SELECT * FROM {table} WHERE {col} IN ({mill_expr})")
                            )
                        ).fetchall()
                    elif col and company_id:
                        rows = (
                            await self.db.execute(
                                text(f"SELECT * FROM {table} WHERE {col} = :p"),
                                {"p": company_id},
                            )
                        ).fetchall()
                    elif col and not company_id:
                        rows = (
                            await self.db.execute(text(f"SELECT * FROM {table}"))
                        ).fetchall()
                    else:
                        continue

                    if rows:
                        zf.writestr(
                            f"{table}.json",
                            json.dumps([dict(r._mapping) for r in rows], default=str),
                        )
                        total_rows += len(rows)
                except Exception as e:
                    logger.warning("Backup table %s: %s", table, e)

        backup_path = os.path.join(BACKUP_DIR, f"backup_{backup_id}.zip")
        with open(backup_path, "wb") as f:
            f.write(buf.getvalue())

        file_size = os.path.getsize(backup_path)
        logger.info("Backup created: %s (%d rows, %d bytes)", backup_path, total_rows, file_size)
        return backup_id, backup_path, file_size, total_rows
