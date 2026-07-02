"""Pricing service — stubbed for single-mill build.

All limit checks pass through unconditionally.
Plan lookups remain real DB queries because billing endpoints and
onboarding still read SubscriptionPlan rows.
"""
from typing import List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.billing import ModulePricing, SubscriptionPlan


class PricingService:
    """No-op pricing service for single-mill ERP.

    Every `can_create_*` method returns (True, "") so creation is
    never blocked by subscription limits. Plan lookups are real queries.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_plans(self, include_inactive: bool = False) -> List[SubscriptionPlan]:
        """Return subscription plans (active only by default), with module prices."""
        stmt = (
            select(SubscriptionPlan)
            .options(selectinload(SubscriptionPlan.module_prices))
            .order_by(SubscriptionPlan.sort_order)
        )
        if not include_inactive:
            stmt = stmt.where(SubscriptionPlan.is_active == True)  # noqa: E712
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_plan_by_code(self, code: str) -> Optional[SubscriptionPlan]:
        """Return an active plan by its code, or None."""
        result = await self.db.execute(
            select(SubscriptionPlan)
            .options(selectinload(SubscriptionPlan.module_prices))
            .where(SubscriptionPlan.code == code, SubscriptionPlan.is_active == True)  # noqa: E712
        )
        return result.scalars().first()

    async def get_modules_for_plan(self, plan_code: str) -> List[str]:
        """Return module names included in a plan (used by onboarding)."""
        plan = await self.get_plan_by_code(plan_code)
        if not plan:
            return []
        result = await self.db.execute(
            select(ModulePricing.module_name).where(
                ModulePricing.plan_id == plan.id,
                ModulePricing.is_included == True,  # noqa: E712
            )
        )
        return [row[0] for row in result.all()]

    async def can_create_employee(self, company_id: str) -> Tuple[bool, str]:
        return True, ""

    async def can_create_mill(self, company_id: str) -> Tuple[bool, str]:
        return True, ""

    async def can_create_user(self, company_id: str) -> Tuple[bool, str]:
        return True, ""

    async def can_enable_module(self, company_id: str, module: str) -> Tuple[bool, str]:
        return True, ""

    async def get_effective_limits(self, company_id: str):
        return None

    async def get_subscription_status(self, company_id: str):
        return None

    async def calculate_plan_cost(self, *args, **kwargs):
        return None
