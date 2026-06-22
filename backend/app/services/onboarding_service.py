"""OnboardingService — single-transaction company onboarding.

Creates a complete company in one atomic transaction:
  Company → CompanySubscription → Modules → Mills → Departments → Owner User
"""

import logging
from datetime import datetime
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.error_handler import SpinFlowException
from app.core.module_registry import ALL_MODULE_CODES
from app.core.security import hash_password
from app.models.masters import Company, CompanyModule, Mill, Department
from app.models.billing import SubscriptionPlan, CompanySubscription
from app.models.user import User, Role
from app.models.audit import AuditLog
from app.schemas.onboarding import OnboardingRequest, OnboardingResult, OnboardingMill, OnboardingOwner
from app.services.pricing_service import PricingService

logger = logging.getLogger("spinflow")

DEFAULT_DEPARTMENTS = [
    ("blowroom", "Blowroom"),
    ("carding", "Carding"),
    ("drawing", "Drawing"),
    ("simplex", "Simplex"),
    ("ring_frame", "Ring Frame"),
    ("winding", "Winding"),
    ("quality", "Quality Control"),
    ("admin", "Administration"),
]


class OnboardingService:
    def __init__(self, db: AsyncSession, current_user: Optional[User] = None):
        self.db = db
        self.current_user = current_user
        self.pricing = PricingService(db)

    async def onboard(self, dto: OnboardingRequest) -> OnboardingResult:
        logger.info("Onboarding company: name=%s code=%s plan=%s", dto.company_name, dto.company_code, dto.plan_code)

        # ── 1. Validate plan ──────────────────────────────────
        plan = await self.pricing.get_plan_by_code(dto.plan_code)
        if not plan:
            raise SpinFlowException.bad_request(f"Plan '{dto.plan_code}' not found or inactive")

        # ── 2. Check uniqueness (proactive — avoid IntegrityError breaking session) ──
        existing_company = (
            await self.db.execute(select(Company).where(Company.code == dto.company_code))
        ).scalar_one_or_none()
        if existing_company:
            raise SpinFlowException.conflict(f"Company with code '{dto.company_code}' already exists")

        for m in dto.mills:
            existing_mill = (
                await self.db.execute(select(Mill).where(Mill.code == m.code))
            ).scalar_one_or_none()
            if existing_mill:
                raise SpinFlowException.conflict(f"Mill with code '{m.code}' already exists")

        existing_user = (
            await self.db.execute(select(User).where(User.email == dto.owner.email))
        ).scalar_one_or_none()
        if existing_user:
            raise SpinFlowException.conflict(f"User with email '{dto.owner.email}' already exists")

        # ── 3. Create Company ─────────────────────────────────
        company = Company(
            code=dto.company_code,
            name=dto.company_name,
            gstin=dto.gstin,
            address=dto.address,
            phone=dto.phone,
            email=dto.email,
            plan=dto.plan_code,
            max_users=dto.max_users,
            max_employees=dto.max_employees,
            status="active",
            is_active=True,
        )
        self.db.add(company)
        await self.db.flush()

        # ── 4. Create CompanySubscription ─────────────────────
        company_sub = CompanySubscription(
            company_id=company.id,
            plan_id=plan.id,
            billing_cycle="monthly",
            status="active",
            started_at=datetime.utcnow(),
        )
        self.db.add(company_sub)

        # ── 5. Enable modules based on plan ───────────────────
        if dto.plan_code == "custom" and dto.modules:
            selected_modules = dto.modules
        else:
            selected_modules = await self.pricing.get_modules_for_plan(dto.plan_code)

        for module_name in ALL_MODULE_CODES:
            is_enabled = module_name in selected_modules
            cm = CompanyModule(
                company_id=company.id,
                module_name=module_name,
                is_enabled=is_enabled,
                enabled_by=self.current_user.id if self.current_user else None,
            )
            self.db.add(cm)
        await self.db.flush()

        # ── 6. Create Mills + Departments ─────────────────────
        mill_ids: List[str] = []
        for m in dto.mills:
            mill = Mill(
                company_id=company.id,
                code=m.code,
                name=m.name,
                city=m.city,
                state=m.state,
                is_active=True,
            )
            self.db.add(mill)
            await self.db.flush()
            mill_ids.append(mill.id)

            for dept_code, dept_name in DEFAULT_DEPARTMENTS:
                dept = Department(
                    mill_id=mill.id,
                    code=dept_code,
                    name=dept_name,
                    department_type=dept_code,
                )
                self.db.add(dept)
            await self.db.flush()

        # ── 7. Create MILL_OWNER user ─────────────────────────
        role_result = await self.db.execute(
            select(Role).where(Role.code == "MILL_OWNER")
        )
        mill_owner_role = role_result.scalar_one_or_none()
        if not mill_owner_role:
            raise SpinFlowException.bad_request("MILL_OWNER role not found")

        owner_user = User(
            name=dto.owner.full_name,
            email=dto.owner.email,
            password_hash=hash_password(dto.owner.password),
            company_id=company.id,
            mill_id=mill_ids[0] if mill_ids else None,
            role_id=mill_owner_role.id,
            is_active=True,
            must_change_password=True,
        )
        self.db.add(owner_user)
        await self.db.flush()

        # ── 8. Audit log ──────────────────────────────────────
        self.db.add(AuditLog(
            user_id=self.current_user.id if self.current_user else None,
            user_name=self.current_user.name if self.current_user else "System",
            role=self.current_user.role_rel.code if self.current_user and self.current_user.role_rel else "SUPER_ADMIN",
            action="COMPANY_ONBOARDED",
            entity="Company",
            entity_id=company.id,
            details=f"Onboarded company: {company.name} ({dto.plan_code}, {len(dto.mills)} mills)",
        ))

        await self.db.commit()
        logger.info("Onboarding complete: company=%s mills=%d owner=%s", company.code, len(mill_ids), dto.owner.email)
        return OnboardingResult(
            company_id=company.id,
            company_code=company.code,
            company_name=company.name,
            mill_ids=mill_ids,
            owner_id=owner_user.id,
            owner_email=owner_user.email,
            plan_code=dto.plan_code,
            modules_enabled=selected_modules,
        )
