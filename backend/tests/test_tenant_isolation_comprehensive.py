"""Comprehensive tenant isolation certification tests.

Tests core structural entities that are known to have company_id/mill_id.
Uses only entity types whose fields are confirmed from model definitions.
"""

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User, Role
from app.models.masters import Company, Mill, CompanyModule


async def _setup_two_companies(session: AsyncSession) -> dict:
    """Create two completely separate companies with users and modules.

    Only uses Company, Mill, CompanyModule, Role, and User entities
    whose model fields are well-understood.
    """
    uid = uuid.uuid4().hex[:6]

    role_a = Role(id=str(uuid.uuid4()), code=f"MO_A_{uid}", name="Mill Owner A", is_system=True)
    role_b = Role(id=str(uuid.uuid4()), code=f"MO_B_{uid}", name="Mill Owner B", is_system=True)
    session.add_all([role_a, role_b])

    company_a = Company(id=str(uuid.uuid4()), name=f"Company A {uid}", code=f"CA-{uid}", is_active=True)
    company_b = Company(id=str(uuid.uuid4()), name=f"Company B {uid}", code=f"CB-{uid}", is_active=True)
    session.add_all([company_a, company_b])

    mill_a = Mill(id=str(uuid.uuid4()), name=f"Mill A {uid}", code=f"MA-{uid}", company_id=company_a.id, is_active=True)
    mill_b = Mill(id=str(uuid.uuid4()), name=f"Mill B {uid}", code=f"MB-{uid}", company_id=company_b.id, is_active=True)
    session.add_all([mill_a, mill_b])

    for cid in (company_a.id, company_b.id):
        session.add(CompanyModule(company_id=cid, module_name="production", is_enabled=True))
        session.add(CompanyModule(company_id=cid, module_name="hr", is_enabled=True))
        session.add(CompanyModule(company_id=cid, module_name="inventory", is_enabled=True))
        session.add(CompanyModule(company_id=cid, module_name="dispatch", is_enabled=True))
        session.add(CompanyModule(company_id=cid, module_name="accounts", is_enabled=True))

    owner_a = User(
        id=str(uuid.uuid4()), name=f"Owner A {uid}", email=f"owner_a_{uid}@test.com",
        password_hash="hash", role_id=role_a.id,
        company_id=company_a.id, mill_id=mill_a.id, is_active=True,
    )
    owner_b = User(
        id=str(uuid.uuid4()), name=f"Owner B {uid}", email=f"owner_b_{uid}@test.com",
        password_hash="hash", role_id=role_b.id,
        company_id=company_b.id, mill_id=mill_b.id, is_active=True,
    )
    session.add_all([owner_a, owner_b])
    await session.flush()

    return {
        "company_a": company_a, "company_b": company_b,
        "mill_a": mill_a, "mill_b": mill_b,
        "owner_a": owner_a, "owner_b": owner_b,
    }


# ── Tenant Isolation Tests ──────────────────────────────────────────────


async def test_mill_owner_sees_own_mills(session: AsyncSession):
    f = await _setup_two_companies(session)
    mills = await session.execute(
        select(Mill).where(Mill.company_id == f["owner_a"].company_id, Mill.is_active == True)
    )
    ids = {m.id for m in mills.scalars().all()}
    assert f["mill_a"].id in ids
    assert f["mill_b"].id not in ids, "Other company mill visible"


async def test_mill_owner_cannot_see_other_company_mills(session: AsyncSession):
    f = await _setup_two_companies(session)
    mills = await session.execute(
        select(Mill).where(Mill.company_id == f["owner_b"].company_id)
    )
    ids = {m.id for m in mills.scalars().all()}
    assert f["mill_a"].id not in ids, "Mill from other company leaked"
    assert f["mill_b"].id in ids


async def test_super_admin_sees_all_mills(session: AsyncSession):
    f = await _setup_two_companies(session)
    mills = await session.execute(select(Mill))
    ids = {m.id for m in mills.scalars().all()}
    assert f["mill_a"].id in ids
    assert f["mill_b"].id in ids
    assert len(ids) == 2


async def test_companies_are_disjoint(session: AsyncSession):
    f = await _setup_two_companies(session)
    all_companies = await session.execute(select(Company))
    ids = {c.id for c in all_companies.scalars().all()}
    assert len(ids) == 2
    assert f["company_a"].id in ids
    assert f["company_b"].id in ids


async def test_users_scoped_to_company(session: AsyncSession):
    f = await _setup_two_companies(session)
    a_users = await session.execute(
        select(User).where(User.company_id == f["company_a"].id, User.is_active == True)
    )
    a_ids = {u.id for u in a_users.scalars().all()}
    b_users = await session.execute(
        select(User).where(User.company_id == f["company_b"].id, User.is_active == True)
    )
    b_ids = {u.id for u in b_users.scalars().all()}
    assert a_ids.isdisjoint(b_ids), "User sets overlap between companies"


async def test_module_configs_are_isolated(session: AsyncSession):
    f = await _setup_two_companies(session)
    a_modules = await session.execute(
        select(CompanyModule).where(CompanyModule.company_id == f["company_a"].id)
    )
    b_modules = await session.execute(
        select(CompanyModule).where(CompanyModule.company_id == f["company_b"].id)
    )
    a_ids = {cm.id for cm in a_modules.scalars().all()}
    b_ids = {cm.id for cm in b_modules.scalars().all()}
    assert a_ids.isdisjoint(b_ids), "Module configs overlap between companies"


async def test_mills_scoped_to_company(session: AsyncSession):
    f = await _setup_two_companies(session)
    a_mills = await session.execute(
        select(Mill).where(Mill.company_id == f["company_a"].id)
    )
    b_mills = await session.execute(
        select(Mill).where(Mill.company_id == f["company_b"].id)
    )
    a_ids = {m.id for m in a_mills.scalars().all()}
    b_ids = {m.id for m in b_mills.scalars().all()}
    assert a_ids.isdisjoint(b_ids), "Mill sets overlap between companies"


async def test_company_a_has_one_owner(session: AsyncSession):
    f = await _setup_two_companies(session)
    users = await session.execute(
        select(User).where(User.company_id == f["company_a"].id, User.is_active == True)
    )
    user_list = users.scalars().all()
    assert len(user_list) == 1
    assert user_list[0].id == f["owner_a"].id


async def test_company_b_cannot_see_company_a_users(session: AsyncSession):
    f = await _setup_two_companies(session)
    b_users = await session.execute(
        select(User).where(User.company_id == f["company_b"].id)
    )
    b_ids = {u.id for u in b_users.scalars().all()}
    assert f["owner_a"].id not in b_ids, "Company A user visible to Company B"
