"""Pricing service — stubbed for single-mill build.

All limit checks pass through unconditionally.
No billing model imports required.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Tuple


class PricingService:
    """No-op pricing service for single-mill ERP.

    Every `can_create_*` method returns (True, "") so creation is
    never blocked by subscription limits.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

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
