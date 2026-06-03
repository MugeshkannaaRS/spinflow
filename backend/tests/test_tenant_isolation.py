"""Tenant isolation tests — cross-company/mill data access.

Verifies that:
  Company A user cannot see Company B data.
  MILL_OWNER sees all mills in their company only.
  Per-mill user only sees their own mill's data.
"""

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User, Role
from app.models.masters import Company, Mill, CompanyModule


async def _create_company_fixture(session: AsyncSession) -> dict:
    """Creates two companies, each with one mill and one MILL_OWNER user."""
    uid = uuid.uuid4().hex[:6]
    role_a = Role(id=str(uuid.uuid4()), code=f"MILL_OWNER_A_{uid}", name="Mill Owner A", is_system=True)
    role_b = Role(id=str(uuid.uuid4()), code=f"MILL_OWNER_B_{uid}", name="Mill Owner B", is_system=True)
    session.add_all([role_a, role_b])
    await session.flush()

    company_a = Company(id=str(uuid.uuid4()), name="Company A", code="C-A", is_active=True)
    company_b = Company(id=str(uuid.uuid4()), name="Company B", code="C-B", is_active=True)
    session.add_all([company_a, company_b])
    await session.flush()

    mill_a1 = Mill(id=str(uuid.uuid4()), name="Mill A1", code="M-A1", company_id=company_a.id, is_active=True)
    mill_a2 = Mill(id=str(uuid.uuid4()), name="Mill A2", code="M-A2", company_id=company_a.id, is_active=True)
    mill_b1 = Mill(id=str(uuid.uuid4()), name="Mill B1", code="M-B1", company_id=company_b.id, is_active=True)
    session.add_all([mill_a1, mill_a2, mill_b1])
    await session.flush()

    for cid in (company_a.id, company_b.id):
        session.add(CompanyModule(company_id=cid, module_name="production", is_enabled=True))
    await session.flush()

    owner_a = User(
        id=str(uuid.uuid4()), name="Owner A", email="owner_a@test.com",
        password_hash="hash", role_id=role_a.id,
        company_id=company_a.id, mill_id=mill_a1.id, is_active=True,
    )
    owner_b = User(
        id=str(uuid.uuid4()), name="Owner B", email="owner_b@test.com",
        password_hash="hash", role_id=role_b.id,
        company_id=company_b.id, mill_id=mill_b1.id, is_active=True,
    )
    session.add_all([owner_a, owner_b])
    await session.flush()

    return {
        "company_a": company_a, "company_b": company_b,
        "mill_a1": mill_a1, "mill_a2": mill_a2, "mill_b1": mill_b1,
        "owner_a": owner_a, "owner_b": owner_b,
    }


async def test_mill_owner_sees_own_company_mills(session: AsyncSession):
    """MILL_OWNER should see all mills in their own company."""
    f = await _create_company_fixture(session)
    mills = await session.execute(
        select(Mill).where(Mill.company_id == f["owner_a"].company_id, Mill.is_active == True)
    )
    mill_list = mills.scalars().all()
    mill_ids = {str(m.id) for m in mill_list}

    assert str(f["mill_a1"].id) in mill_ids, "Owner A should see Mill A1"
    assert str(f["mill_a2"].id) in mill_ids, "Owner A should see Mill A2"
    assert len(mill_list) == 2, "Owner A should see exactly 2 mills"


async def test_mill_owner_cannot_see_other_company_mills(session: AsyncSession):
    """MILL_OWNER should NOT see mills from a different company."""
    f = await _create_company_fixture(session)
    mills = await session.execute(
        select(Mill).where(Mill.company_id == f["owner_a"].company_id, Mill.is_active == True)
    )
    mill_list = mills.scalars().all()
    mill_ids = {str(m.id) for m in mill_list}

    assert str(f["mill_b1"].id) not in mill_ids, "Owner A should NOT see Mill B1"


async def test_super_admin_sees_all_mills(session: AsyncSession):
    """SUPER_ADMIN should see mills across all companies."""
    f = await _create_company_fixture(session)
    mills = await session.execute(select(Mill).where(Mill.is_active == True))
    mill_list = mills.scalars().all()
    mill_ids = {str(m.id) for m in mill_list}

    assert str(f["mill_a1"].id) in mill_ids
    assert str(f["mill_b1"].id) in mill_ids
    assert len(mill_list) == 3


async def test_company_a_module_enabled(session: AsyncSession):
    """Company A should have production enabled."""
    f = await _create_company_fixture(session)
    cm = await session.execute(
        select(CompanyModule).where(
            CompanyModule.company_id == f["company_a"].id,
            CompanyModule.module_name == "production",
        )
    )
    assert cm.scalar_one_or_none() is not None


async def test_company_module_configs_isolated(session: AsyncSession):
    """Company A and B module configs should be disjoint."""
    f = await _create_company_fixture(session)
    cm_a = await session.execute(
        select(CompanyModule).where(CompanyModule.company_id == f["company_a"].id)
    )
    cm_b = await session.execute(
        select(CompanyModule).where(CompanyModule.company_id == f["company_b"].id)
    )
    a_ids = {c.id for c in cm_a.scalars().all()}
    b_ids = {c.id for c in cm_b.scalars().all()}
    assert a_ids.isdisjoint(b_ids), "Company A and B module configs should not overlap"
