#!/usr/bin/env python3
"""SpinFlow ERP — Staging Environment Seed Script.

Seeds foundational data into a fresh database AFTER `alembic upgrade head`.
Idempotent — safe to re-run.

Usage:
    python -m scripts.seed_staging

Requires DATABASE_URL in environment (or .env file).
"""
import asyncio
import time
import os
import sys

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import os
from app.core.security import hash_password
SEED_ADMIN_PWD = os.environ.get("SEED_ADMIN_PASSWORD", "Admin@1234")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.core.rbac import ROLES
from app.models.user import Role, User
from app.models.billing import SubscriptionPlan


class StagingSeeder:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.timings: dict[str, float] = {}
        self.counts: dict[str, int] = {}

    async def seed_roles(self) -> dict[str, Role]:
        t0 = time.time()
        existing = {r.code: r for r in (await self.db.execute(select(Role))).scalars().all()}
        created = 0
        for code in ROLES:
            if code not in existing:
                r = Role(
                    id=uuid4_str(),
                    code=code,
                    name=code.replace("_", " ").title(),
                    is_system=True,
                )
                self.db.add(r)
                existing[code] = r
                created += 1
        await self.db.flush()
        self.timings["seed_roles"] = time.time() - t0
        self.counts["roles"] = len(existing)
        print(f"  Roles: {len(existing)} ({created} created, {len(existing) - created} existing)")
        return existing

    async def seed_plans(self) -> dict[str, SubscriptionPlan]:
        t0 = time.time()
        existing = await self.db.execute(select(SubscriptionPlan).limit(1))
        if existing.scalar_one_or_none():
            result = await self.db.execute(select(SubscriptionPlan))
            plans = {p.code: p for p in result.scalars().all()}
            self.timings["seed_plans"] = time.time() - t0
            self.counts["plans"] = len(plans)
            print(f"  Plans: {len(plans)} (already exist)")
            return plans

        from app.services.pricing_service import PricingService
        svc = PricingService(self.db)
        await svc.seed_default_plans()
        result = await self.db.execute(select(SubscriptionPlan))
        plans = {p.code: p for p in result.scalars().all()}
        self.timings["seed_plans"] = time.time() - t0
        self.counts["plans"] = len(plans)
        print(f"  Plans: {len(plans)} with ModulePricing")
        return plans

    async def seed_admin(self, roles: dict[str, Role]) -> User:
        t0 = time.time()
        existing = await self.db.execute(
            select(User).where(User.email == "admin@mill.spinflow")
        )
        admin = existing.scalar_one_or_none()
        if admin:
            self.timings["seed_admin"] = time.time() - t0
            print(f"  Admin: already exists ({admin.email})")
            return admin

        admin = User(
            id=uuid4_str(),
            name="Super Admin",
            email="admin@mill.spinflow",
            password_hash=hash_password(SEED_ADMIN_PWD),
            role_id=roles["SUPER_ADMIN"].id,
            is_active=True,
            must_change_password=False,
        )
        self.db.add(admin)
        await self.db.flush()
        self.timings["seed_admin"] = time.time() - t0
        self.counts["admin"] = 1
        print(f"  Admin: created ({admin.email} / {SEED_ADMIN_PWD})")
        return admin

    async def seed(self):
        print("=" * 55)
        print("  SpinFlow ERP — Staging Seed")
        print("=" * 55)
        print()

        roles = await self.seed_roles()
        plans = await self.seed_plans()
        admin = await self.seed_admin(roles)
        await self.db.commit()

        print()
        print(f"  Seeded {self.counts.get('roles', 0)} roles, "
              f"{self.counts.get('plans', 0)} plans, "
              f"{self.counts.get('admin', 0)} admin user")
        print()

    def summary(self):
        print("  Timing:")
        for k, v in self.timings.items():
            print(f"    {k}: {v:.2f}s")


def uuid4_str() -> str:
    import uuid
    return str(uuid.uuid4())


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        seeder = StagingSeeder(db)
        await seeder.seed()
        seeder.summary()

    await engine.dispose()
    print()
    print("  Staging seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
