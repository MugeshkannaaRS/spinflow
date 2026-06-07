#!/usr/bin/env python3
"""Clean up all LR-1 test data entities.

Run: python -m backend.scripts.cleanup_lr1_data

This script deletes all entities created by lr1_launch_readiness.py:
  - Companies with code LIKE 'LR-%'
  - Associated mills, users, employees, subscriptions, modules, audit logs

Safe to run multiple times — skips if no LR-* entities found.
"""

import asyncio
import logging
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

DELETE_STMTS = [
    "DELETE FROM deletion_logs WHERE entity_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM mills WHERE code LIKE 'LR-%-M%')",
    "DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM users WHERE email LIKE '%@lr-%')",
    "DELETE FROM billing_invoices WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM billing_payments WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM subscription_change_requests WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM overage_pricing WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM company_modules WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM company_subscriptions WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM employees WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM users WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@lr-%')",
    "DELETE FROM mills WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM column_config WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'LR-%')",
    "DELETE FROM companies WHERE code LIKE 'LR-%'",
    "DELETE FROM users WHERE email LIKE '%@lr-%'",
    "DELETE FROM users WHERE name LIKE 'LR-Test-%'",
    "DELETE FROM users WHERE name LIKE 'VERIFY-%'",
]


async def main():
    logger.info("Connecting to database…")
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        # Check if any LR-* data exists
        result = await conn.execute(text("SELECT COUNT(*) FROM companies WHERE code LIKE 'LR-%'"))
        count = result.scalar() or 0
        if count == 0:
            logger.info("No LR-* companies found. Nothing to clean up.")
            return

        logger.info(f"Found {count} LR-* companies. Deleting…")
        for stmt in DELETE_STMTS:
            result = await conn.execute(text(stmt))
            deleted = result.rowcount
            if deleted:
                logger.info(f"  {stmt.split('FROM')[1].split('WHERE')[0].strip()}: {deleted} rows")

    await engine.dispose()
    logger.info("Done. LR-1 test data cleaned up.")


if __name__ == "__main__":
    asyncio.run(main())
