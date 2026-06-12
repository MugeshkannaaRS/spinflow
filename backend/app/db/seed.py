"""Seed script to populate the database with initial data."""
import os
import asyncio

from sqlalchemy import select

from app.db.session import engine, async_session_factory
from app.db.base import Base
from app.core.security import hash_password
from app.models.user import Role, User
from app.models.masters import Company, Mill


ROLES_DATA = [
    {"code": "SUPER_ADMIN", "name": "Super Admin", "is_system": True},
    {"code": "MILL_OWNER", "name": "Mill Owner", "is_system": True},
    {"code": "GENERAL_MANAGER", "name": "General Manager", "is_system": True},
    {"code": "PRODUCTION_MANAGER", "name": "Production Manager", "is_system": True},
    {"code": "QUALITY_MANAGER", "name": "Quality Manager", "is_system": True},
    {"code": "DISPATCH_MANAGER", "name": "Dispatch Manager", "is_system": True},
    {"code": "STORE_MANAGER", "name": "Store Manager", "is_system": True},
    {"code": "HR_MANAGER", "name": "HR Manager", "is_system": True},
    {"code": "ACCOUNTANT", "name": "Accountant", "is_system": True},
    {"code": "MAINTENANCE_MANAGER", "name": "Maintenance Manager", "is_system": True},
    {"code": "SUPERVISOR", "name": "Supervisor", "is_system": True},
    {"code": "MACHINE_OPERATOR", "name": "Machine Operator", "is_system": True},
    {"code": "SECURITY_GATE", "name": "Security Gate", "is_system": True},
    {"code": "AUDITOR", "name": "Auditor (Read-only)", "is_system": True},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as db:
        roles = {}
        for rd in ROLES_DATA:
            existing = await db.scalar(select(Role).where(Role.code == rd["code"]))
            if not existing:
                role = Role(**rd)
                db.add(role)
                roles[rd["code"]] = role
            else:
                roles[rd["code"]] = existing
        if roles.get("SUPER_ADMIN"):
            await db.flush()

        company = await db.scalar(select(Company).limit(1))
        if not company:
            company_name = os.environ.get("MILL_NAME", "SpinFlow Textiles Pvt. Ltd.")
            company_code = company_name[:50].upper().replace(" ", "_").replace(".", "")
            company = Company(code=company_code, name=company_name)
            db.add(company)
            await db.flush()

        mill = await db.scalar(select(Mill).limit(1))
        if not mill:
            mill = Mill(
                code="MILL-01",
                name=company.name,
                company_id=company.id,
                city="",
                state="",
            )
            db.add(mill)
            await db.flush()

        superadmin = await db.scalar(select(User).where(User.name == "superadmin"))
        if not superadmin:
            password = os.environ.get("SUPERADMIN_PASSWORD")
            if not password:
                raise RuntimeError("SUPERADMIN_PASSWORD environment variable is required for seeding")
            superadmin = User(
                name="superadmin",
                email="admin@mill.spinflow",
                password_hash=hash_password(password),
                role_id=roles["SUPER_ADMIN"].id,
                department="Management",
                mill_id=mill.id,
                mill_name=company.name,
                is_active=True,
            )
            db.add(superadmin)
            await db.flush()
            import sys
            print("WARNING: Superadmin account created", file=sys.stderr)
            print(f"  Email: admin@mill.spinflow", file=sys.stderr)
            print(f"  Password: [set via SUPERADMIN_PASSWORD env var]", file=sys.stderr)
            print("  Change this password immediately after first login.", file=sys.stderr)

        await db.commit()
        print("System ready. Login as superadmin to begin setup.")
        print("First steps: 1) Add departments 2) Add machines 3) Add users for each role")
        print()


async def main():
    await seed()


if __name__ == "__main__":
    asyncio.run(main())
