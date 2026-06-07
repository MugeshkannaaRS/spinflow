#!/usr/bin/env python3
"""Clean up all LR-1 test data entities from the database.

Run: python -m backend.scripts.cleanup_lr1_data

Deletes entities whose company code starts with 'LR-'.
Safe to re-run. Handles missing tables gracefully.
"""

import asyncio
import logging
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

DELETE_STMTS = [
    # ── Audit & deletion logs ──────────────────────────
    "DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM mills WHERE code LIKE 'LR-%-M%')",
    "DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM users WHERE email LIKE '%@lr-%')",

    # ── Billing tables (company_id) ────────────────────
    "DELETE FROM billing_invoices WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM billing_payments WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM subscription_change_requests WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM overage_pricing WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",

    # ── Company-scoped tables ──────────────────────────
    "DELETE FROM company_modules WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM company_subscriptions WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",

    # ── Employees (scoped through mill, NOT company_id) ─
    "DELETE FROM employees WHERE mill_id IN (SELECT id FROM mills WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%'))",

    # ── Users (company_id) ─────────────────────────────
    "DELETE FROM users WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@lr-%')",

    # ── Mills ──────────────────────────────────────────
    "DELETE FROM mills WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM column_configs WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",

    # ── Companies ──────────────────────────────────────
    "DELETE FROM companies WHERE code LIKE 'LR-%'",
    "DELETE FROM companies WHERE code LIKE 'TEST-%'",
    "DELETE FROM companies WHERE code LIKE 'DEMO-%'",
    "DELETE FROM companies WHERE code LIKE 'PSPL-%'",

    # ── Orphan users (no company FK) ───────────────────
    "DELETE FROM users WHERE email LIKE '%@lr-%'",
    "DELETE FROM users WHERE name LIKE 'LR-Test-%'",
    "DELETE FROM users WHERE name LIKE 'VERIFY-%'",
    "DELETE FROM users WHERE name LIKE 'TEST-%'",
    "DELETE FROM users WHERE name LIKE 'DEMO-%'",
]


async def safe_exec(conn, stmt: str, label: str) -> int:
    """Execute a DELETE, returning rowcount. Returns 0 on missing-table errors."""
    try:
        r = await conn.execute(text(stmt))
        return r.rowcount
    except OperationalError as e:
        if "does not exist" in str(e) or "no such table" in str(e):
            return 0
        raise


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM companies WHERE code LIKE 'LR-%'"))
        count = result.scalar() or 0
        if count == 0:
            logger.info("No LR-* companies found. Nothing to clean up.")
            return

        logger.info(f"Found {count} LR-* companies. Deleting…")
        for stmt in DELETE_STMTS:
            label = stmt.split("FROM")[1].split("WHERE")[0].strip()
            deleted = await safe_exec(conn, stmt, label)
            if deleted:
                logger.info(f"  {label}: {deleted} rows")
        logger.info("Done.")
        # Verify
        remaining = (await conn.execute(text("SELECT COUNT(*) FROM companies WHERE code LIKE 'LR-%'"))).scalar() or 0
        if remaining:
            logger.warning(f"  WARNING: {remaining} LR-* companies still remain!")
        else:
            logger.info("  Verified: 0 LR-* companies remain.")


if __name__ == "__main__":
    asyncio.run(main())
