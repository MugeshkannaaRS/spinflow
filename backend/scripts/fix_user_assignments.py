#!/usr/bin/env python3
"""Fix user assignments: assign mill_id and company_id to all existing users with null values.

Usage:
    DATABASE_URL="postgresql+asyncpg://..." python3 scripts/fix_user_assignments.py
"""

import asyncio
import os
import sys

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker


async def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL environment variable is required")
        print("Usage: DATABASE_URL=\"postgresql+asyncpg://...\" python3 scripts/fix_user_assignments.py")
        sys.exit(1)

    engine = create_async_engine(db_url, echo=False, pool_size=5)
    async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session_factory() as session:
        # Find the first mill
        mill_result = await session.execute(select(text("id, company_id")).select_from(text("mills")).limit(1))
        mill_row = mill_result.first()

        if not mill_row:
            print("ERROR: No mills found in the database. Create a mill first.")
            sys.exit(1)

        default_mill_id = mill_row[0]
        default_company_id = mill_row[1]
        print(f"Found mill: {default_mill_id} (company: {default_company_id})")

        # Update users with null mill_id
        update_sql = text(
            "UPDATE users SET mill_id = :mill_id, company_id = :company_id "
            "WHERE mill_id IS NULL AND deleted_at IS NULL"
        )
        result = await session.execute(
            update_sql,
            {"mill_id": default_mill_id, "company_id": default_company_id},
        )
        await session.commit()

        print(f"Updated {result.rowcount} users with mill_id and company_id")

        # Verify
        verify_result = await session.execute(
            select(func.count()).select_from(text("users")).where(text("mill_id IS NULL AND deleted_at IS NULL"))
        )
        still_null = verify_result.scalar() or 0
        print(f"Users still without mill_id: {still_null}")

        # FIX 7: Seed modules for companies that are missing them
        print("\n--- Seeding modules for companies missing them ---")
        modules = [
            "dashboard", "production", "quality", "stock", "inventory",
            "dispatch", "purchase", "stores", "hr", "accounts",
            "maintenance", "payroll", "reports", "audit", "masters",
            "lotrac", "users",
        ]
        module_values = ", ".join(f"('{m}')" for m in modules)
        seed_sql = text(f"""
            INSERT INTO company_modules (id, company_id, module_name, is_enabled)
            SELECT gen_random_uuid()::text, c.id, m.module_name, true
            FROM companies c
            CROSS JOIN (VALUES {module_values}) AS m(module_name)
            WHERE NOT EXISTS (
                SELECT 1 FROM company_modules cm
                WHERE cm.company_id = c.id AND cm.module_name = m.module_name
            )
        """)
        result = await session.execute(seed_sql)
        await session.commit()
        print(f"Seeded modules for {result.rowcount} company-module pairs")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
