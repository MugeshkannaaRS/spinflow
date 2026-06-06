import logging
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("spinflow")

from app.services.base import BaseService
from app.core.error_handler import SpinFlowException
from app.schemas.masters import (
    CompanyCreate, CompanyUpdate, CompanyOut,
    MillCreate, MillUpdate, MillOut,
    DepartmentCreate, DepartmentUpdate, DepartmentOut,
    YarnCountCreate, YarnCountUpdate, YarnCountOut,
    CustomerCreate, CustomerUpdate, CustomerOut,
    MasterVehicleCreate, MasterVehicleUpdate, MasterVehicleOut,
    RouteCreate, RouteUpdate, RouteOut,
)
from app.models.masters import (
    Company, Mill, Department, YarnCount, Customer, MasterVehicle, Route,
    CompanyModule, MillSettings,
)
from app.models.billing import SubscriptionPlan, CompanySubscription
from app.models.audit import AuditLog


ALL_MODULES = [
    "dashboard", "production", "quality", "inventory", "dispatch",
    "purchase", "stores", "hr", "accounts", "maintenance",
    "users", "audit", "reports", "masters", "stock", "sales", "lotrac",
    "payroll",
]

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


class MastersService(BaseService):
    def __init__(self, db: AsyncSession, current_user=None):
        super().__init__(db, current_user)

    async def _paginate(self, stmt, page, page_size):
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0
        items_stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(items_stmt)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return total, items, pages

    # ── Company ──────────────────────────────────────────────

    async def list_companies(self, page: int = 1, page_size: int = 20, include_inactive: bool = False):
        stmt = select(Company).order_by(Company.created_at.desc())
        if not include_inactive:
            stmt = stmt.where(Company.is_active == True)
        total, items, pages = await self._paginate(stmt, page, page_size)
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [CompanyOut.model_validate(item) for item in items],
        }

    async def get_company(self, id: str):
        return await self.get_or_404(Company, id)

    async def create_company(self, dto: CompanyCreate, created_by: Optional[str] = None):
        logger.info("Creating company: name=%s code=%s plan=%s", dto.name, dto.code, dto.plan)
        try:
            record = Company(**dto.model_dump())
            self.db.add(record)
            await self.db.flush()
        except IntegrityError:
            logger.warning("Company creation failed: code '%s' already exists (name=%s)", dto.code, dto.name)
            raise SpinFlowException.conflict(f"Company with code '{dto.code}' already exists")

        for module_name in ALL_MODULES:
            cm = CompanyModule(
                company_id=record.id,
                module_name=module_name,
                is_enabled=True,
                enabled_by=self.current_user.id if self.current_user else None,
            )
            self.db.add(cm)
        await self.db.flush()

        plan = await self.db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.code == dto.plan, SubscriptionPlan.is_active == True)
        )
        plan_record = plan.scalar_one_or_none()
        if plan_record:
            company_sub = CompanySubscription(
                company_id=record.id,
                plan_id=plan_record.id,
                billing_cycle="monthly",
                status="active",
                started_at=datetime.now(),
            )
            self.db.add(company_sub)
            await self.db.flush()

        log = AuditLog(
            user_id=self.current_user.id if self.current_user else "SYSTEM",
            user_name=self.current_user.name if self.current_user else "System",
            role=self.current_user.role_rel.code if self.current_user and self.current_user.role_rel else "SUPER_ADMIN",
            action="COMPANY_CREATED",
            entity="Company",
            entity_id=record.id,
            details=f"Created company: {record.name} (plan: {dto.plan})",
        )
        self.db.add(log)
        await self.db.flush()
        return record

    async def update_company(self, id: str, dto: CompanyUpdate, updated_by: Optional[str] = None):
        record = await self.get_or_404(Company, id)
        update_data = dto.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(record, key, value)
        await self.db.flush()
        await self._audit(action="update", entity="Company", entity_id=record.id, details=f"Updated company: {record.name}")
        return record

    # ── Mill ─────────────────────────────────────────────────

    async def list_mills(self, company_id: Optional[str] = None, page: int = 1, page_size: int = 20, include_inactive: bool = False):
        stmt = select(Mill).order_by(Mill.created_at.desc())
        if not include_inactive:
            stmt = stmt.where(Mill.is_active == True)
        if company_id is not None:
            stmt = stmt.where(Mill.company_id == company_id)
        total, items, pages = await self._paginate(stmt, page, page_size)
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [MillOut.model_validate(item) for item in items],
        }

    async def get_mill(self, id: str):
        return await self.get_or_404(Mill, id)

    async def create_mill(self, dto: MillCreate, created_by: Optional[str] = None, create_defaults: bool = True):
        try:
            record = Mill(**dto.model_dump())
            self.db.add(record)
            await self.db.flush()
        except IntegrityError:
            raise SpinFlowException.conflict(f"Mill with code '{dto.code}' already exists")

        ms = MillSettings(
            mill_id=record.id,
        )
        self.db.add(ms)

        if create_defaults:
            for dep_type, dep_name in DEFAULT_DEPARTMENTS:
                dep = Department(
                    mill_id=record.id,
                    code=dep_type,
                    name=dep_name,
                    department_type=dep_type,
                    is_active=True,
                )
                self.db.add(dep)
        await self.db.flush()

        log = AuditLog(
            user_id=self.current_user.id if self.current_user else "SYSTEM",
            user_name=self.current_user.name if self.current_user else "System",
            role=self.current_user.role_rel.code if self.current_user and self.current_user.role_rel else "SUPER_ADMIN",
            action="MILL_CREATED",
            entity="Mill",
            entity_id=record.id,
            details=f"Created mill: {record.name}",
        )
        self.db.add(log)
        await self.db.flush()
        return record

    async def update_mill(self, id: str, dto: MillUpdate, updated_by: Optional[str] = None):
        record = await self.get_or_404(Mill, id)
        update_data = dto.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(record, key, value)
        await self.db.flush()
        await self._audit(action="update", entity="Mill", entity_id=record.id, details=f"Updated mill: {record.name}")
        return record

    # ── Department ───────────────────────────────────────────

    async def list_departments(self, mill_id: Optional[str] = None, page: int = 1, page_size: int = 20, include_inactive: bool = False):
        stmt = select(Department).order_by(Department.created_at.desc())
        if not include_inactive:
            stmt = stmt.where(Department.is_active == True)
        if mill_id is not None:
            stmt = stmt.where(Department.mill_id == mill_id)
        total, items, pages = await self._paginate(stmt, page, page_size)
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [DepartmentOut.model_validate(item) for item in items],
        }

    async def get_department(self, id: str):
        return await self.get_or_404(Department, id)

    async def create_department(self, dto: DepartmentCreate, created_by: Optional[str] = None):
        try:
            record = Department(**dto.model_dump())
            self.db.add(record)
            await self.db.flush()
        except IntegrityError:
            raise SpinFlowException.conflict(f"Department with code '{dto.code}' already exists in this mill")
        await self._audit(action="create", entity="Department", entity_id=record.id, details=f"Created department: {record.name}")
        return record

    async def update_department(self, id: str, dto: DepartmentUpdate, updated_by: Optional[str] = None):
        record = await self.get_or_404(Department, id)
        update_data = dto.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(record, key, value)
        await self.db.flush()
        await self._audit(action="update", entity="Department", entity_id=record.id, details=f"Updated department: {record.name}")
        return record

    # ── YarnCount ────────────────────────────────────────────

    async def list_yarn_counts(self, mill_id: Optional[str] = None, page: int = 1, page_size: int = 20, include_inactive: bool = False):
        stmt = select(YarnCount).order_by(YarnCount.created_at.desc())
        if not include_inactive:
            stmt = stmt.where(YarnCount.is_active == True)
        if mill_id is not None:
            stmt = stmt.where(YarnCount.mill_id == mill_id)
        total, items, pages = await self._paginate(stmt, page, page_size)
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [YarnCountOut.model_validate(item) for item in items],
        }

    async def get_yarn_count(self, id: str):
        return await self.get_or_404(YarnCount, id)

    async def create_yarn_count(self, dto: YarnCountCreate, created_by: Optional[str] = None):
        try:
            record = YarnCount(**dto.model_dump())
            self.db.add(record)
            await self.db.flush()
        except IntegrityError:
            raise SpinFlowException.conflict(f"Yarn count '{dto.count}' already exists")
        await self._audit(action="create", entity="YarnCount", entity_id=record.id, details=f"Created yarn count: {record.count}")
        return record

    async def update_yarn_count(self, id: str, dto: YarnCountUpdate, updated_by: Optional[str] = None):
        record = await self.get_or_404(YarnCount, id)
        update_data = dto.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(record, key, value)
        await self.db.flush()
        await self._audit(action="update", entity="YarnCount", entity_id=record.id, details=f"Updated yarn count: {record.count}")
        return record

    # ── Customer ─────────────────────────────────────────────

    async def list_customers(self, mill_id: Optional[str] = None, page: int = 1, page_size: int = 20, include_inactive: bool = False):
        stmt = select(Customer).order_by(Customer.created_at.desc())
        if not include_inactive:
            stmt = stmt.where(Customer.is_active == True)
        if mill_id is not None:
            stmt = stmt.where(Customer.mill_id == mill_id)
        total, items, pages = await self._paginate(stmt, page, page_size)
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [CustomerOut.model_validate(item) for item in items],
        }

    async def get_customer(self, id: str):
        return await self.get_or_404(Customer, id)

    async def create_customer(self, dto: CustomerCreate, created_by: Optional[str] = None):
        try:
            record = Customer(**dto.model_dump())
            self.db.add(record)
            await self.db.flush()
        except IntegrityError:
            raise SpinFlowException.conflict(f"Customer with code '{dto.code}' already exists")
        await self._audit(action="create", entity="Customer", entity_id=record.id, details=f"Created customer: {record.name}")
        return record

    async def update_customer(self, id: str, dto: CustomerUpdate, updated_by: Optional[str] = None):
        record = await self.get_or_404(Customer, id)
        update_data = dto.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(record, key, value)
        await self.db.flush()
        await self._audit(action="update", entity="Customer", entity_id=record.id, details=f"Updated customer: {record.name}")
        return record

    async def deactivate_customer(self, id: str, user_id: str):
        record = await self.get_or_404(Customer, id)
        if hasattr(record, "is_active"):
            record.is_active = False
        await self.db.flush()
        await self._audit(action="deactivate", entity="Customer", entity_id=record.id, details=f"Deactivated customer: {record.name}")
        return record

    # ── MasterVehicle ────────────────────────────────────────

    async def list_vehicles(self, mill_id: Optional[str] = None, page: int = 1, page_size: int = 20, include_inactive: bool = False):
        stmt = select(MasterVehicle).order_by(MasterVehicle.created_at.desc())
        if not include_inactive:
            stmt = stmt.where(MasterVehicle.is_active == True)
        if mill_id is not None:
            stmt = stmt.where(MasterVehicle.mill_id == mill_id)
        total, items, pages = await self._paginate(stmt, page, page_size)
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [MasterVehicleOut.model_validate(item) for item in items],
        }

    async def get_vehicle(self, id: str):
        return await self.get_or_404(MasterVehicle, id)

    async def create_vehicle(self, dto: MasterVehicleCreate, created_by: Optional[str] = None):
        try:
            record = MasterVehicle(**dto.model_dump())
            self.db.add(record)
            await self.db.flush()
        except IntegrityError:
            raise SpinFlowException.conflict(f"Vehicle with number '{dto.vehicle_no}' already exists")
        await self._audit(action="create", entity="MasterVehicle", entity_id=record.id, details=f"Created vehicle: {record.vehicle_no}")
        return record

    async def update_vehicle(self, id: str, dto: MasterVehicleUpdate, updated_by: Optional[str] = None):
        record = await self.get_or_404(MasterVehicle, id)
        update_data = dto.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(record, key, value)
        await self.db.flush()
        await self._audit(action="update", entity="MasterVehicle", entity_id=record.id, details=f"Updated vehicle: {record.vehicle_no}")
        return record

    # ── Route ────────────────────────────────────────────────

    async def list_routes(self, mill_id: Optional[str] = None, page: int = 1, page_size: int = 20, include_inactive: bool = False):
        stmt = select(Route).order_by(Route.created_at.desc())
        if not include_inactive:
            stmt = stmt.where(Route.is_active == True)
        if mill_id is not None:
            stmt = stmt.where(Route.mill_id == mill_id)
        total, items, pages = await self._paginate(stmt, page, page_size)
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [RouteOut.model_validate(item) for item in items],
        }

    async def get_route(self, id: str):
        return await self.get_or_404(Route, id)

    async def create_route(self, dto: RouteCreate, created_by: Optional[str] = None):
        try:
            record = Route(**dto.model_dump())
            self.db.add(record)
            await self.db.flush()
        except IntegrityError:
            raise SpinFlowException.conflict(f"Route with code '{dto.code}' already exists")
        await self._audit(action="create", entity="Route", entity_id=record.id, details=f"Created route: {record.name}")
        return record

    async def update_route(self, id: str, dto: RouteUpdate, updated_by: Optional[str] = None):
        record = await self.get_or_404(Route, id)
        update_data = dto.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(record, key, value)
        await self.db.flush()
        await self._audit(action="update", entity="Route", entity_id=record.id, details=f"Updated route: {record.name}")
        return record
