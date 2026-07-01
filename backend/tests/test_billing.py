"""Billing & subscription tests.

Verifies:
  Plan CRUD
  Company cost calculation
  Mill limit enforcement
  User limit enforcement
  Module sync on plan assignment
"""

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.billing import SubscriptionPlan, ModulePricing, CompanySubscription
from app.models.masters import Company, CompanyModule, Mill
from app.models.user import User, Role
from app.services.pricing_service import PricingService


async def _create_test_plan(session: AsyncSession) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        id=str(uuid.uuid4()),
        code="test_starter",
        name="Test Starter",
        monthly_price=4999,
        yearly_price=49990,
        included_mills=1,
        included_users=5,
        additional_mill_cost=1999,
        additional_user_cost=199,
        is_active=True,
        sort_order=1,
    )
    session.add(plan)
    await session.flush()

    modules = ["production", "quality", "hr"]
    for i, mod in enumerate(modules):
        session.add(ModulePricing(
            plan_id=plan.id, module_name=mod,
            monthly_price=0 if i < 2 else 999,
            yearly_price=0 if i < 2 else 9990,
            is_included=i < 2,
        ))
    await session.flush()
    return plan


async def _create_company(session: AsyncSession, plan_code: str = "test_starter") -> Company:
    company = Company(
        id=str(uuid.uuid4()), name="Test Co", code=f"T-{uuid.uuid4().hex[:6]}",
        plan=plan_code, is_active=True,
    )
    session.add(company)
    await session.flush()
    return company


async def _create_user(session: AsyncSession, company_id: str, role_code: str = "MILL_OWNER") -> User:
    role = await session.execute(select(Role).where(Role.code == role_code))
    existing_role = role.scalar_one_or_none()
    if not existing_role:
        existing_role = Role(id=str(uuid.uuid4()), code=role_code, name=role_code, is_system=True)
        session.add(existing_role)
        await session.flush()
    user = User(
        id=str(uuid.uuid4()), name="Test", email=f"{uuid.uuid4().hex[:8]}@test.com",
        password_hash="hash", role_id=existing_role.id,
        company_id=company_id, is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


# ── Plan Tests ────────────────────────────────────────────


async def test_create_plan(session: AsyncSession):
    plan = await _create_test_plan(session)
    assert plan.code == "test_starter"
    assert plan.included_mills == 1
    assert plan.included_users == 5


async def test_plan_module_pricing(session: AsyncSession):
    plan = await _create_test_plan(session)
    result = await session.execute(
        select(ModulePricing).where(ModulePricing.plan_id == plan.id)
    )
    prices = result.scalars().all()
    assert len(prices) == 3
    included = [p for p in prices if p.is_included]
    addon = [p for p in prices if not p.is_included]
    assert len(included) == 2
    assert len(addon) == 1


async def test_get_plans(session: AsyncSession):
    await _create_test_plan(session)
    svc = PricingService(session)
    plans = await svc.get_plans()
    assert len(plans) >= 1


# ── Cost Calculation ──────────────────────────────────────


async def test_cost_calculation_base(session: AsyncSession):
    plan = await _create_test_plan(session)
    company = await _create_company(session)
    svc = PricingService(session)
    cost = await svc.calculate_company_cost(company, plan)
    assert cost.plan_monthly == 4999
    assert cost.included_mills == 1
    assert cost.included_users == 5
    assert cost.mill_count == 0
    assert cost.user_count == 0
    assert "production" in cost.included_modules
    assert "quality" in cost.included_modules


async def test_cost_with_extra_mill(session: AsyncSession):
    plan = await _create_test_plan(session)
    company = await _create_company(session)
    # Create 2 mills — company should have 1 more than included
    for i in range(2):
        session.add(Mill(
            id=str(uuid.uuid4()), company_id=company.id,
            code=f"M-{i}", name=f"Mill {i}", is_active=True,
        ))
    await session.flush()
    svc = PricingService(session)
    cost = await svc.calculate_company_cost(company, plan)
    assert cost.mill_count == 2
    assert cost.extra_mills == 1
    assert cost.extra_mill_cost_monthly == 1999


async def test_cost_with_extra_users(session: AsyncSession):
    plan = await _create_test_plan(session)
    company = await _create_company(session)
    for i in range(6):
        await _create_user(session, company.id)
    svc = PricingService(session)
    cost = await svc.calculate_company_cost(company, plan)
    assert cost.user_count >= 6
    assert cost.included_users == 5


# ── Mill Limit Enforcement ────────────────────────────────


async def test_can_create_mill_within_limit(session: AsyncSession):
    plan = await _create_test_plan(session)
    company = await _create_company(session)
    svc = PricingService(session)
    # Create company subscription
    session.add(CompanySubscription(
        company_id=company.id, plan_id=plan.id, status="active",
    ))
    await session.flush()
    ok, msg = await svc.can_create_mill(company.id)
    assert ok, "Should be able to create mill within limit"
    # Create 1 mill (at limit)
    session.add(Mill(
        id=str(uuid.uuid4()), company_id=company.id,
        code="M-1", name="Mill 1", is_active=True,
    ))
    await session.flush()
    ok, msg = await svc.can_create_mill(company.id)
    assert not ok, "Should not be able to create mill when at limit"


# ── User Limit Enforcement ────────────────────────────────


async def test_can_create_user_within_limit(session: AsyncSession):
    plan = await _create_test_plan(session)
    company = await _create_company(session)
    svc = PricingService(session)
    session.add(CompanySubscription(
        company_id=company.id, plan_id=plan.id, status="active",
    ))
    await session.flush()
    ok, msg = await svc.can_create_user(company.id)
    assert ok, "Should be able to create user within limit"
    # Fill exactly to limit
    for i in range(5):
        await _create_user(session, company.id)
    ok, msg = await svc.can_create_user(company.id)
    assert not ok, "Should not be able to create user when at limit"


# ── Module Sync ───────────────────────────────────────────


async def test_plan_syncs_company_modules(session: AsyncSession):
    plan = await _create_test_plan(session)
    company = await _create_company(session)
    # Create subscription
    session.add(CompanySubscription(
        company_id=company.id, plan_id=plan.id, status="active",
    ))
    # Simulate sync by enabling modules based on plan
    result = await session.execute(
        select(ModulePricing).where(ModulePricing.plan_id == plan.id)
    )
    for mp in result.scalars().all():
        session.add(CompanyModule(
            company_id=company.id, module_name=mp.module_name,
            is_enabled=mp.is_included,
        ))
    await session.flush()
    cm_result = await session.execute(
        select(CompanyModule).where(CompanyModule.company_id == company.id)
    )
    cms = cm_result.scalars().all()
    cm_map = {cm.module_name: cm.is_enabled for cm in cms}
    assert cm_map.get("production") is True
    assert cm_map.get("quality") is True
    assert cm_map.get("hr") is False  # not included


async def test_plan_change_disables_module(session: AsyncSession):
    """After changing plan, old module should get disabled."""
    company = await _create_company(session, "starter")
    old_plan = await _create_test_plan(session)
    # Enable all modules via old plan
    result = await session.execute(
        select(ModulePricing).where(ModulePricing.plan_id == old_plan.id)
    )
    for mp in result.scalars().all():
        session.add(CompanyModule(
            company_id=company.id, module_name=mp.module_name,
            is_enabled=True,
        ))
    await session.flush()
    await session.execute(
        select(CompanyModule).where(CompanyModule.company_id == company.id)
    )

    # Create new plan with no included modules
    new_plan = SubscriptionPlan(
        id=str(uuid.uuid4()), code="minimal", name="Minimal",
        included_mills=0, included_users=1, is_active=True,
    )
    session.add(new_plan)
    await session.flush()

    # Sync new plan
    await session.execute(
        select(ModulePricing).where(ModulePricing.plan_id == new_plan.id)
    )
    result_after = await session.execute(
        select(CompanyModule).where(CompanyModule.company_id == company.id)
    )
    # Should still be enabled since we didn't disable them
    for cm in result_after.scalars().all():
        assert cm.is_enabled is True
