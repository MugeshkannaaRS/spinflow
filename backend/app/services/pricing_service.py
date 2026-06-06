"""Pricing engine — calculates company subscription costs."""

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.models.billing import SubscriptionPlan, ModulePricing, CompanySubscription
from app.models.masters import Company, CompanyModule, Mill
from app.models.user import User


@dataclass
class PlanCostBreakdown:
    plan_monthly: float
    plan_yearly: float
    included_modules: List[str]
    addon_modules: List[Dict]
    addon_module_cost_monthly: float
    addon_module_cost_yearly: float
    included_mills: int
    included_users: int
    extra_mills: int
    extra_users: int
    extra_mill_cost_monthly: float
    extra_user_cost_monthly: float
    total_monthly: float
    total_yearly: float
    mill_count: int
    user_count: int


@dataclass
class SubscriptionStatus:
    plan_id: str
    plan_code: str
    plan_name: str
    status: str
    billing_cycle: str
    started_at: Optional[str]
    expires_at: Optional[str]
    mill_count: int
    mill_limit: int
    user_count: int
    user_limit: int
    mills_exceeded: bool
    users_exceeded: bool
    cost: PlanCostBreakdown


class PricingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_plans(self) -> List[SubscriptionPlan]:
        result = await self.db.execute(
            select(SubscriptionPlan)
            .options(selectinload(SubscriptionPlan.module_prices))
            .where(SubscriptionPlan.is_active == True)
            .order_by(SubscriptionPlan.sort_order)
        )
        return result.scalars().all()

    async def get_plan(self, plan_id: str) -> Optional[SubscriptionPlan]:
        result = await self.db.execute(
            select(SubscriptionPlan)
            .options(selectinload(SubscriptionPlan.module_prices))
            .where(SubscriptionPlan.id == plan_id)
        )
        return result.scalar_one_or_none()

    async def get_plan_by_code(self, code: str) -> Optional[SubscriptionPlan]:
        result = await self.db.execute(
            select(SubscriptionPlan)
            .options(selectinload(SubscriptionPlan.module_prices))
            .where(SubscriptionPlan.code == code, SubscriptionPlan.is_active == True)
        )
        return result.scalar_one_or_none()

    async def calculate_company_cost(
        self, company: Company,
        plan: Optional[SubscriptionPlan] = None,
        company_sub: Optional[CompanySubscription] = None,
    ) -> PlanCostBreakdown:
        if plan is None:
            plan = await self.get_plan_by_code(company.plan or "starter")
            if plan is None:
                plan = await self.get_plan(company.plan)
        if plan is None:
            raise ValueError(f"No active plan found for {company.plan}")

        if company_sub is None:
            company_sub = await self._get_company_subscription(company.id)

        # Eagerly load module_prices to avoid lazy load in async context
        plan_result = await self.db.execute(
            select(SubscriptionPlan)
            .options(selectinload(SubscriptionPlan.module_prices))
            .where(SubscriptionPlan.id == plan.id)
        )
        plan = plan_result.scalar_one()

        included_modules = [
            mp.module_name for mp in (plan.module_prices or [])
            if mp.is_included
        ]
        addon_module_list = []
        addon_module_cost_monthly = 0.0
        addon_module_cost_yearly = 0.0

        addon_modules = {}
        if company_sub and company_sub.addon_modules:
            addon_modules = company_sub.addon_modules

        for mp in (plan.module_prices or []):
            if not mp.is_included:
                is_added = addon_modules.get(mp.module_name, False)
                if is_added:
                    addon_module_list.append({
                        "module_name": mp.module_name,
                        "monthly_price": float(mp.monthly_price),
                        "yearly_price": float(mp.yearly_price),
                    })
                    addon_module_cost_monthly += float(mp.monthly_price)
                    addon_module_cost_yearly += float(mp.yearly_price)

        # Count mills
        mill_result = await self.db.execute(
            select(Mill).where(Mill.company_id == company.id, Mill.is_active == True)
        )
        mill_count = len(mill_result.scalars().all())

        # Count users
        user_result = await self.db.execute(
            select(User).where(User.company_id == company.id, User.is_active == True)
        )
        user_count = len(user_result.scalars().all())

        extra_mills = 0
        extra_users = 0
        if company_sub:
            extra_mills = company_sub.extra_mills
            extra_users = company_sub.extra_users
        else:
            extra_mills = max(0, mill_count - plan.included_mills)
            extra_users = max(0, user_count - plan.included_users)

        extra_mill_cost_monthly = extra_mills * float(plan.additional_mill_cost)
        extra_user_cost_monthly = extra_users * float(plan.additional_user_cost)

        total_monthly = (
            float(plan.monthly_price) +
            addon_module_cost_monthly +
            extra_mill_cost_monthly +
            extra_user_cost_monthly
        )
        total_yearly = (
            float(plan.yearly_price) +
            addon_module_cost_yearly +
            extra_mill_cost_monthly * 12 +
            extra_user_cost_monthly * 12
        )

        return PlanCostBreakdown(
            plan_monthly=float(plan.monthly_price),
            plan_yearly=float(plan.yearly_price),
            included_modules=included_modules,
            addon_modules=addon_module_list,
            addon_module_cost_monthly=addon_module_cost_monthly,
            addon_module_cost_yearly=addon_module_cost_yearly,
            included_mills=plan.included_mills,
            included_users=plan.included_users,
            extra_mills=extra_mills,
            extra_users=extra_users,
            extra_mill_cost_monthly=extra_mill_cost_monthly,
            extra_user_cost_monthly=extra_user_cost_monthly,
            total_monthly=total_monthly,
            total_yearly=total_yearly,
            mill_count=mill_count,
            user_count=user_count,
        )

    async def get_subscription_status(self, company: Company) -> Optional[SubscriptionStatus]:
        plan = await self.get_plan_by_code(company.plan or "starter")
        if plan is None:
            return None
        company_sub = await self._get_company_subscription(company.id)
        cost = await self.calculate_company_cost(company, plan, company_sub)

        mill_result = await self.db.execute(
            select(Mill).where(Mill.company_id == company.id, Mill.is_active == True)
        )
        mill_count = len(mill_result.scalars().all())

        user_result = await self.db.execute(
            select(User).where(User.company_id == company.id, User.is_active == True)
        )
        user_count = len(user_result.scalars().all())

        mill_limit = plan.included_mills + (company_sub.extra_mills if company_sub else 0)
        user_limit = plan.included_users + (company_sub.extra_users if company_sub else 0)

        return SubscriptionStatus(
            plan_id=plan.id,
            plan_code=plan.code,
            plan_name=plan.name,
            status=company_sub.status if company_sub else "active",
            billing_cycle=company_sub.billing_cycle if company_sub else "monthly",
            started_at=str(company_sub.started_at) if company_sub and company_sub.started_at else None,
            expires_at=str(company_sub.expires_at) if company_sub and company_sub.expires_at else None,
            mill_count=mill_count,
            mill_limit=mill_limit,
            user_count=user_count,
            user_limit=user_limit,
            mills_exceeded=mill_count > mill_limit,
            users_exceeded=user_count > user_limit,
            cost=cost,
        )

    async def can_create_mill(self, company_id: str) -> Tuple[bool, str]:
        company = await self.db.get(Company, company_id)
        if not company:
            return False, "Company not found"
        status = await self.get_subscription_status(company)
        if status is None:
            return True, ""
        if status.mill_count >= status.mill_limit:
            return False, "Your subscription does not allow additional mills. Upgrade to add more mills."
        return True, ""

    async def can_create_user(self, company_id: str) -> Tuple[bool, str]:
        company = await self.db.get(Company, company_id)
        if not company:
            return False, "Company not found"
        status = await self.get_subscription_status(company)
        if status is None:
            return True, ""
        if status.user_count >= status.user_limit:
            return False, "Subscription limit reached. Upgrade required to add more users."
        return True, ""

    async def _get_company_subscription(self, company_id: str) -> Optional[CompanySubscription]:
        result = await self.db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == company_id)
        )
        return result.scalar_one_or_none()

    async def seed_default_plans(self):
        """Seed starter/growth/business/enterprise/custom plans if they don't exist."""
        existing = await self.db.execute(select(SubscriptionPlan).limit(1))
        if existing.scalar_one_or_none():
            return

        plans = [
            SubscriptionPlan(
                code="starter",
                name="Starter",
                description="Perfect for small spinning mills getting started.",
                monthly_price=4999,
                yearly_price=49990,
                included_mills=1,
                included_users=25,
                additional_mill_cost=1999,
                additional_user_cost=199,
                is_active=True,
                sort_order=1,
            ),
            SubscriptionPlan(
                code="growth",
                name="Growth",
                description="For growing mills with multiple units.",
                monthly_price=14999,
                yearly_price=149990,
                included_mills=3,
                included_users=100,
                additional_mill_cost=1499,
                additional_user_cost=149,
                is_active=True,
                sort_order=2,
            ),
            SubscriptionPlan(
                code="business",
                name="Business",
                description="For established operations with up to 5 mills.",
                monthly_price=29999,
                yearly_price=299990,
                included_mills=5,
                included_users=250,
                additional_mill_cost=999,
                additional_user_cost=99,
                is_active=True,
                sort_order=3,
            ),
            SubscriptionPlan(
                code="enterprise",
                name="Enterprise",
                description="Unlimited mills and users for large operations.",
                monthly_price=49999,
                yearly_price=499990,
                included_mills=999,
                included_users=9999,
                additional_mill_cost=0,
                additional_user_cost=0,
                is_active=True,
                sort_order=4,
            ),
            SubscriptionPlan(
                code="custom",
                name="Custom",
                description="Custom plan with manual module selection.",
                monthly_price=99999,
                yearly_price=999990,
                included_mills=999,
                included_users=9999,
                additional_mill_cost=0,
                additional_user_cost=0,
                is_active=True,
                sort_order=5,
            ),
        ]
        self.db.add_all(plans)
        await self.db.flush()

        MODULES = [
            "production", "quality", "inventory", "dispatch", "purchase",
            "stores", "hr", "accounts", "maintenance", "payroll", "sales",
            "lotrac", "reports",
        ]
        for plan in plans:
            for mod in MODULES:
                if plan.code == "custom":
                    is_included = False
                    monthly = 0
                    yearly = 0
                else:
                    is_included = plan.code == "enterprise" or (
                        plan.code == "business" and mod in (
                            "production", "quality", "inventory", "dispatch",
                            "purchase", "stores", "hr", "accounts", "maintenance",
                            "payroll", "sales", "lotrac",
                        )
                    ) or (
                        plan.code == "growth" and mod in (
                            "production", "quality", "inventory", "dispatch",
                            "purchase", "stores", "hr", "accounts", "maintenance",
                        )
                    ) or (
                        plan.code == "starter" and mod in (
                            "production", "quality", "inventory", "dispatch",
                        )
                    )
                    monthly = 0 if is_included else 999
                    yearly = 0 if is_included else 9990
                mp = ModulePricing(
                    plan_id=plan.id,
                    module_name=mod,
                    monthly_price=monthly,
                    yearly_price=yearly,
                    is_included=is_included,
                )
                self.db.add(mp)
        await self.db.flush()

    async def process_expirations(self):
        """Check for subscriptions that need status updates.

        - Active subscriptions past expires_at → mark as expired
        - Expired subscriptions past 30-day grace period → mark as suspended
        """
        now = datetime.now(timezone.utc)

        expired = await self.db.execute(
            select(CompanySubscription).where(
                CompanySubscription.status == "active",
                CompanySubscription.expires_at.isnot(None),
                CompanySubscription.expires_at <= now,
            )
        )
        for sub in expired.scalars().all():
            sub.status = "expired"

        grace_date = now - timedelta(days=30)
        expired_subs = await self.db.execute(
            select(CompanySubscription).where(
                CompanySubscription.status == "expired",
                CompanySubscription.expires_at.isnot(None),
                CompanySubscription.expires_at <= grace_date,
            )
        )
        for sub in expired_subs.scalars().all():
            sub.status = "suspended"

        await self.db.flush()
