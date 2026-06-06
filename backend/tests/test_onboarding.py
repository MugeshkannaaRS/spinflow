import pytest
import pytest_asyncio
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.masters import Company, CompanyModule, Mill, Department
from app.models.user import User, Role
from app.models.billing import SubscriptionPlan, CompanySubscription, ModulePricing
from app.models.audit import AuditLog
from app.core.module_registry import ALL_MODULE_CODES
from app.services.onboarding_service import OnboardingService
from typing import Optional, List
from app.schemas.onboarding import (
    OnboardingRequest, OnboardingMill, OnboardingOwner,
)


@pytest_asyncio.fixture
async def super_admin_role(session: AsyncSession) -> Role:
    role = Role(id=str(uuid.uuid4()), code="SUPER_ADMIN", name="Super Admin", is_system=True)
    session.add(role)
    await session.flush()
    return role


@pytest_asyncio.fixture
async def super_admin_user(session: AsyncSession, super_admin_role: Role) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="Admin",
        email="admin@onboard-test.com",
        password_hash="dummy_hash",
        role_id=super_admin_role.id,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


def _make_plan(session: AsyncSession, code: str, name: str, sort: int, modules: list[str]):
    """Create a plan + ModulePricing entries for given modules."""
    plan = SubscriptionPlan(
        id=str(uuid.uuid4()),
        code=code,
        name=name,
        monthly_price=999,
        yearly_price=9990,
        included_mills=5,
        included_users=50,
        is_active=True,
        sort_order=sort,
    )
    session.add(plan)
    # add all modules as included by default; test overrides where needed
    for i, mod in enumerate(ALL_MODULE_CODES):
        mp = ModulePricing(
            id=str(uuid.uuid4()),
            plan_id=plan.id,
            module_name=mod,
            is_included=mod in modules,
            monthly_price=0,
        )
        session.add(mp)
    return plan


@pytest_asyncio.fixture
async def plans(session: AsyncSession) -> dict[str, SubscriptionPlan]:
    """Seed all 5 plans with their typical module sets."""
    # Seed MILL_OWNER role (needed by OnboardingService)
    existing = (await session.execute(select(Role).where(Role.code == "MILL_OWNER"))).scalar_one_or_none()
    if not existing:
        r = Role(id=str(uuid.uuid4()), code="MILL_OWNER", name="Mill Owner", is_system=True)
        session.add(r)

    plans = {}
    core = {"dashboard", "production", "quality", "inventory", "dispatch", "purchase", "stores",
            "hr", "accounts", "maintenance", "users", "masters", "column_config", "audit",
            "reports", "stock", "sales"}
    plans["starter"] = _make_plan(session, "starter", "Starter", 1, list(core))
    plans["growth"] = _make_plan(session, "growth", "Growth", 2, list(core | {"lotrac", "payroll"}))
    plans["business"] = _make_plan(session, "business", "Business", 3, list(core | {"lotrac", "payroll", "uploads"}))
    plans["enterprise"] = _make_plan(session, "enterprise", "Enterprise", 4, list(ALL_MODULE_CODES))
    plans["custom"] = _make_plan(session, "custom", "Custom", 5, [])
    await session.flush()
    return plans


def _make_dto(
    company_code: str = "TESTCO",
    company_name: str = "Test Company",
    plan_code: str = "starter",
    modules: Optional[List[str]] = None,
    owner_email: str = "owner@test.com",
    owner_name: str = "Test Owner",
    mill_code: str = "TESTMILL",
) -> OnboardingRequest:
    return OnboardingRequest(
        company_name=company_name,
        company_code=company_code,
        plan_code=plan_code,
        mills=[OnboardingMill(name="Test Mill", code=mill_code, city="City", state="State")],
        owner=OnboardingOwner(full_name=owner_name, email=owner_email, password="Test@1234"),
        modules=modules,
    )


class TestOnboarding:
    """Integration tests for single-transaction company onboarding."""

    @pytest.mark.asyncio
    async def test_onboard_starter(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        result = await svc.onboard(_make_dto(company_code="STARTER1", plan_code="starter"))

        assert result.company_code == "STARTER1"
        assert result.plan_code == "starter"

        # Verify company
        company = await session.get(Company, result.company_id)
        assert company is not None
        assert company.status == "active"
        assert company.plan == "starter"

        # Verify subscription
        sub = (await session.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == company.id)
        )).scalar_one_or_none()
        assert sub is not None
        assert sub.status == "active"

        # Verify correct modules enabled (core only)
        cm_result = await session.execute(
            select(CompanyModule).where(CompanyModule.company_id == company.id)
        )
        enabled = {cm.module_name for cm in cm_result.scalars().all() if cm.is_enabled}
        core = {"dashboard", "production", "quality", "inventory", "dispatch", "purchase", "stores",
                "hr", "accounts", "maintenance", "users", "masters", "column_config", "audit",
                "reports", "stock", "sales"}
        assert enabled == core

        # Verify modules NOT enabled for non-core
        assert "lotrac" not in enabled
        assert "payroll" not in enabled

        # Verify mill
        assert len(result.mill_ids) == 1
        mill = await session.get(Mill, result.mill_ids[0])
        assert mill is not None
        assert mill.company_id == company.id

        # Verify default departments
        depts = (await session.execute(
            select(Department).where(Department.mill_id == mill.id)
        )).scalars().all()
        assert len(depts) == 8

        # Verify owner
        owner = await session.get(User, result.owner_id)
        assert owner is not None
        assert owner.email == "owner@test.com"
        assert owner.company_id == company.id

        # Verify audit log
        audit = (await session.execute(
            select(AuditLog).where(AuditLog.entity_id == company.id)
        )).scalars().all()
        assert len(audit) >= 1
        assert audit[0].action == "COMPANY_ONBOARDED"

    @pytest.mark.asyncio
    async def test_onboard_growth(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        result = await svc.onboard(_make_dto(company_code="GROWTH1", plan_code="growth"))

        cm_result = await session.execute(
            select(CompanyModule).where(CompanyModule.company_id == result.company_id)
        )
        enabled = {cm.module_name for cm in cm_result.scalars().all() if cm.is_enabled}
        assert "lotrac" in enabled
        assert "payroll" in enabled
        assert "uploads" not in enabled

    @pytest.mark.asyncio
    async def test_onboard_business(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        result = await svc.onboard(_make_dto(company_code="BIZ1", plan_code="business"))

        cm_result = await session.execute(
            select(CompanyModule).where(CompanyModule.company_id == result.company_id)
        )
        enabled = {cm.module_name for cm in cm_result.scalars().all() if cm.is_enabled}
        assert "lotrac" in enabled
        assert "payroll" in enabled
        assert "uploads" in enabled
        assert "whatsapp" not in enabled
        assert "lc_tracking" not in enabled
        assert "analytics" not in enabled

    @pytest.mark.asyncio
    async def test_onboard_enterprise(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        result = await svc.onboard(_make_dto(company_code="ENTER1", plan_code="enterprise"))

        cm_result = await session.execute(
            select(CompanyModule).where(CompanyModule.company_id == result.company_id)
        )
        all_enabled = all(cm.is_enabled for cm in cm_result.scalars().all())
        assert all_enabled

    @pytest.mark.asyncio
    async def test_onboard_custom_with_modules(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        selected = ["production", "quality", "lotrac", "hr"]
        result = await svc.onboard(_make_dto(
            company_code="CUSTOM1", plan_code="custom", modules=selected
        ))

        cm_result = await session.execute(
            select(CompanyModule).where(CompanyModule.company_id == result.company_id)
        )
        enabled = {cm.module_name for cm in cm_result.scalars().all() if cm.is_enabled}
        assert enabled == set(selected)
        assert "dashboard" not in enabled  # not in custom selection

    @pytest.mark.asyncio
    async def test_onboard_custom_no_modules_creates_all_disabled(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        result = await svc.onboard(_make_dto(
            company_code="CUSTOM2", plan_code="custom", modules=[]
        ))

        cm_result = await session.execute(
            select(CompanyModule).where(CompanyModule.company_id == result.company_id)
        )
        enabled = {cm.module_name for cm in cm_result.scalars().all() if cm.is_enabled}
        assert enabled == set()  # no modules enabled

    @pytest.mark.asyncio
    async def test_onboard_duplicate_company_code_rolls_back(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        await svc.onboard(_make_dto(company_code="DUPCO1"))

        from app.core.error_handler import SpinFlowException
        with pytest.raises(SpinFlowException, match="already exists"):
            await svc.onboard(_make_dto(company_code="DUPCO1"))

        # Verify only one company with that code exists
        companies = (await session.execute(
            select(Company).where(Company.code == "DUPCO1")
        )).scalars().all()
        assert len(companies) == 1

    @pytest.mark.asyncio
    async def test_onboard_duplicate_email_rolls_back(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        await svc.onboard(_make_dto(company_code="DUPEMAIL1", owner_email="dup@test.com"))

        from app.core.error_handler import SpinFlowException
        with pytest.raises(SpinFlowException, match="already exists"):
            await svc.onboard(_make_dto(company_code="DUPEMAIL2", owner_email="dup@test.com"))

        # Verify second company was NOT created
        companies = (await session.execute(
            select(Company).where(Company.code == "DUPEMAIL2")
        )).scalars().all()
        assert len(companies) == 0

    @pytest.mark.asyncio
    async def test_onboard_duplicate_mill_code_rolls_back(self, session: AsyncSession, plans, super_admin_user: User):
        svc = OnboardingService(session, super_admin_user)
        await svc.onboard(_make_dto(company_code="DUPML1", mill_code="DUPML"))

        from app.core.error_handler import SpinFlowException
        with pytest.raises(SpinFlowException, match="already exists"):
            await svc.onboard(_make_dto(company_code="DUPML2", mill_code="DUPML"))

        # Verify second company was NOT created
        companies = (await session.execute(
            select(Company).where(Company.code == "DUPML2")
        )).scalars().all()
        assert len(companies) == 0
