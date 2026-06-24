from __future__ import annotations
import asyncio
import logging
import uuid as _uuid_mod
from datetime import date as _date, datetime as _datetime, timedelta as _timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update as _sa_update, insert as _sa_insert
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, model_validator

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import require_module, get_mill_scope, get_current_user
from app.services.masters_service import MastersService
from app.schemas.masters import (
    CompanyCreate, CompanyUpdate, CompanyOut,
    MillCreate, MillUpdate, MillOut,
    DepartmentCreate, DepartmentUpdate, DepartmentOut,
    YarnCountCreate, YarnCountUpdate, YarnCountOut,
    CustomerCreate, CustomerUpdate, CustomerOut,
    MasterVehicleCreate, MasterVehicleUpdate, MasterVehicleOut,
    RouteCreate, RouteUpdate, RouteOut,
)
from app.models.user import User, Role
from app.models.masters import (
    Company, Mill, Department, YarnCount, Customer, MasterVehicle, Route,
)
from app.models.production import Machine
from app.models.mill_config import MillRecordValue, MillCustomField
from app.core.error_handler import SpinFlowException

router = APIRouter()
MAX_BATCH = 500


async def _resolve_role_code(current_user: User, db: AsyncSession) -> str:
    role_result = await db.execute(
        select(Role).where(Role.id == current_user.role_id)
    )
    role_obj = role_result.scalar_one_or_none()
    return role_obj.code if role_obj else ""


async def _resolve_company_id(current_user: User, db: AsyncSession) -> Optional[str]:
    if current_user.company_id:
        return str(current_user.company_id)
    if current_user.mill_id:
        mill_result = await db.execute(
            select(Mill).where(Mill.id == current_user.mill_id)
        )
        mill_obj = mill_result.scalar_one_or_none()
        if mill_obj:
            return str(mill_obj.company_id)
    return None


# ── Company ─────────────────────────────────────────────

@router.get("/masters/companies")
async def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    include_inactive: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    scope = await get_mill_scope(current_user, db)
    try:
        service = MastersService(db, current_user)
        if scope["company_id"] is not None:
            company = await service.get_company(scope["company_id"])
            data = [CompanyOut.model_validate(company).model_dump()] if company else []
            return {
                "total": len(data),
                "page": 1,
                "page_size": page_size,
                "pages": 1,
                "data": data,
            }
        return await service.list_companies(page=page, page_size=page_size, include_inactive=include_inactive)
    except Exception as e:
        logger.error(f"masters.companies list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}

@router.post("/masters/companies", response_model=CompanyOut)
async def create_company(
    req: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.create_company(req, created_by=current_user.id)

@router.get("/masters/companies/{id}", response_model=CompanyOut)
async def get_company(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    service = MastersService(db, current_user)
    return await service.get_company(id)

@router.patch("/masters/companies/{id}")
async def update_company(
    id: str,
    req: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    try:
        service = MastersService(db, current_user)
        record = await service.update_company(id, req, updated_by=current_user.id)
        await db.refresh(record)
        return CompanyOut.model_validate(record).model_dump()
    except SpinFlowException as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"masters.companies update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Mill ────────────────────────────────────────────────

@router.get("/masters/mills")
async def list_mills(
    company_id: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=5000),
    include_inactive: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    role_code = await _resolve_role_code(current_user, db)
    effective_company_id = await _resolve_company_id(current_user, db)

    query = select(Mill)
    if role_code == "SUPER_ADMIN":
        if company_id:
            query = query.where(Mill.company_id == company_id)
    else:
        if effective_company_id:
            query = query.where(Mill.company_id == effective_company_id)
        else:
            return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}
    if not include_inactive:
        query = query.where(Mill.is_active == True)
    query = query.order_by(Mill.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [MillOut.model_validate(item) for item in items],
        }
    except Exception as e:
        logger.error(f"masters.mills list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}

@router.post("/masters/mills", response_model=MillOut)
async def create_mill(
    req: MillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    # Single-mill build: no mill limit enforced
    service = MastersService(db, current_user)
    return await service.create_mill(req, created_by=current_user.id)

@router.get("/masters/mills/{id}", response_model=MillOut)
async def get_mill(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    service = MastersService(db, current_user)
    return await service.get_mill(id)

@router.patch("/masters/mills/{id}", response_model=MillOut)
async def update_mill(
    id: str,
    req: MillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.update_mill(id, req, updated_by=current_user.id)

# ── Department ──────────────────────────────────────────

@router.get("/masters/departments")
async def list_departments(
    mill_id: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    role_code = await _resolve_role_code(current_user, db)
    effective_company_id = await _resolve_company_id(current_user, db)
    query = select(Department)
    if role_code == "SUPER_ADMIN":
        if mill_id:
            query = query.where(Department.mill_id == mill_id)
    elif effective_company_id:
        query = query.join(Mill, Department.mill_id == Mill.id).where(Mill.company_id == effective_company_id)
    else:
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}
    if not include_inactive:
        query = query.where(Department.is_active == True)
    query = query.order_by(Department.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [DepartmentOut.model_validate(item) for item in items],
        }
    except Exception as e:
        logger.error(f"masters.departments list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}

@router.post("/masters/departments", response_model=DepartmentOut)
async def create_department(
    req: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id") or current_user.mill_id
    if mill_id:
        req.mill_id = mill_id
    service = MastersService(db, current_user)
    return await service.create_department(req, created_by=current_user.id)

@router.get("/masters/departments/{id}", response_model=DepartmentOut)
async def get_department(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    service = MastersService(db, current_user)
    return await service.get_department(id)

@router.patch("/masters/departments/{id}", response_model=DepartmentOut)
async def update_department(
    id: str,
    req: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.update_department(id, req, updated_by=current_user.id)

# ── YarnCount ───────────────────────────────────────────

@router.get("/masters/yarn-counts")
async def list_yarn_counts(
    mill_id: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    role_code = await _resolve_role_code(current_user, db)
    effective_company_id = await _resolve_company_id(current_user, db)
    query = select(YarnCount)
    if role_code == "SUPER_ADMIN":
        if mill_id:
            query = query.where(YarnCount.mill_id == mill_id)
    elif effective_company_id:
        query = query.join(Mill, YarnCount.mill_id == Mill.id).where(Mill.company_id == effective_company_id)
    else:
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}
    if not include_inactive:
        query = query.where(YarnCount.is_active == True)
    query = query.order_by(YarnCount.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [YarnCountOut.model_validate(item) for item in items],
        }
    except Exception as e:
        logger.error(f"masters.yarn-counts list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}

@router.post("/masters/yarn-counts", response_model=YarnCountOut)
async def create_yarn_count(
    req: YarnCountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id") or current_user.mill_id
    if mill_id:
        req.mill_id = mill_id
    service = MastersService(db, current_user)
    return await service.create_yarn_count(req, created_by=current_user.id)

@router.get("/masters/yarn-counts/{id}", response_model=YarnCountOut)
async def get_yarn_count(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    service = MastersService(db, current_user)
    return await service.get_yarn_count(id)

@router.patch("/masters/yarn-counts/{id}", response_model=YarnCountOut)
async def update_yarn_count(
    id: str,
    req: YarnCountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.update_yarn_count(id, req, updated_by=current_user.id)

# ── Customer ────────────────────────────────────────────

@router.get("/masters/customers")
async def list_customers(
    mill_id: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    role_code = await _resolve_role_code(current_user, db)
    effective_company_id = await _resolve_company_id(current_user, db)
    query = select(Customer)
    if role_code == "SUPER_ADMIN":
        if mill_id:
            query = query.where(Customer.mill_id == mill_id)
    elif effective_company_id:
        query = query.join(Mill, Customer.mill_id == Mill.id).where(Mill.company_id == effective_company_id)
    else:
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}
    if not include_inactive:
        query = query.where(Customer.is_active == True)
    query = query.order_by(Customer.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [CustomerOut.model_validate(item) for item in items],
        }
    except Exception as e:
        logger.error(f"masters.customers list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}

@router.post("/masters/customers", response_model=CustomerOut)
async def create_customer(
    req: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id") or current_user.mill_id
    if mill_id:
        req.mill_id = mill_id
    service = MastersService(db, current_user)
    return await service.create_customer(req, created_by=current_user.id)

@router.get("/masters/customers/{id}", response_model=CustomerOut)
async def get_customer(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    service = MastersService(db, current_user)
    return await service.get_customer(id)

@router.patch("/masters/customers/{id}", response_model=CustomerOut)
async def update_customer(
    id: str,
    req: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.update_customer(id, req, updated_by=current_user.id)

@router.delete("/masters/customers/{id}", response_model=CustomerOut)
async def deactivate_customer(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.deactivate_customer(id, user_id=current_user.id)

# ── MasterVehicle ───────────────────────────────────────

@router.get("/masters/vehicles")
async def list_vehicles(
    mill_id: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    role_code = await _resolve_role_code(current_user, db)
    effective_company_id = await _resolve_company_id(current_user, db)
    query = select(MasterVehicle)
    if role_code == "SUPER_ADMIN":
        if mill_id:
            query = query.where(MasterVehicle.mill_id == mill_id)
    elif effective_company_id:
        query = query.join(Mill, MasterVehicle.mill_id == Mill.id).where(Mill.company_id == effective_company_id)
    else:
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}
    if not include_inactive:
        query = query.where(MasterVehicle.is_active == True)
    query = query.order_by(MasterVehicle.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [MasterVehicleOut.model_validate(item) for item in items],
        }
    except Exception as e:
        logger.error(f"masters.vehicles list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}

@router.post("/masters/vehicles", response_model=MasterVehicleOut)
async def create_vehicle(
    req: MasterVehicleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id") or current_user.mill_id
    if mill_id:
        req.mill_id = mill_id
    service = MastersService(db, current_user)
    return await service.create_vehicle(req, created_by=current_user.id)

@router.get("/masters/vehicles/{id}", response_model=MasterVehicleOut)
async def get_vehicle(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    service = MastersService(db, current_user)
    return await service.get_vehicle(id)

@router.patch("/masters/vehicles/{id}", response_model=MasterVehicleOut)
async def update_vehicle(
    id: str,
    req: MasterVehicleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.update_vehicle(id, req, updated_by=current_user.id)

# ── Route ───────────────────────────────────────────────

@router.get("/masters/routes")
async def list_routes(
    mill_id: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    role_code = await _resolve_role_code(current_user, db)
    effective_company_id = await _resolve_company_id(current_user, db)
    query = select(Route)
    if role_code == "SUPER_ADMIN":
        if mill_id:
            query = query.where(Route.mill_id == mill_id)
    elif effective_company_id:
        query = query.join(Mill, Route.mill_id == Mill.id).where(Mill.company_id == effective_company_id)
    else:
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}
    if not include_inactive:
        query = query.where(Route.is_active == True)
    query = query.order_by(Route.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "data": [RouteOut.model_validate(item) for item in items],
        }
    except Exception as e:
        logger.error(f"masters.routes list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}

@router.post("/masters/routes", response_model=RouteOut)
async def create_route(
    req: RouteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id") or current_user.mill_id
    if mill_id:
        req.mill_id = mill_id
    service = MastersService(db, current_user)
    return await service.create_route(req, created_by=current_user.id)

@router.get("/masters/routes/{id}", response_model=RouteOut)
async def get_route(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    service = MastersService(db, current_user)
    return await service.get_route(id)

@router.patch("/masters/routes/{id}", response_model=RouteOut)
async def update_route(
    id: str,
    req: RouteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.update_route(id, req, updated_by=current_user.id)


_BULK_KEY_ALIASES = [
    "items", "machines", "employees", "departments", "customers",
    "vehicles", "routes", "yarn_counts", "shifts", "warehouses",
    "records", "data", "rows",
]


def _make_bulk_validator():
    """Return a Pydantic model_validator that accepts any key alias for 'items'."""
    @model_validator(mode="before")
    @classmethod
    def accept_any_key(cls, values):
        if isinstance(values, dict) and not values.get("items"):
            for key in _BULK_KEY_ALIASES:
                if values.get(key):
                    values["items"] = values[key]
                    break
        return values
    return accept_any_key


class MachineBulkRequest(BaseModel):
    items: List[Dict[str, Any]] = []
    mill_id: Optional[str] = None   # also accepted in body (frontend sends it here)
    accept_any_key = _make_bulk_validator()


class CustomerBulkRequest(BaseModel):
    items: List[Dict[str, Any]] = []
    accept_any_key = _make_bulk_validator()


async def _resolve_mill_id(scope: dict, current_user: User, db: AsyncSession, req_mill_id: Optional[str] = None) -> str:
    """Resolve an effective mill_id for bulk imports, with company fallback."""
    mill_id = req_mill_id or scope.get("mill_id")
    if not mill_id:
        company_id = scope.get("company_id") or (str(current_user.company_id) if current_user.company_id else None)
        if company_id:
            res = await db.execute(
                select(Mill).where(Mill.company_id == company_id, Mill.is_active == True).limit(1)
            )
            first = res.scalar_one_or_none()
            if first:
                mill_id = str(first.id)
    if not mill_id:
        raise HTTPException(400, detail="No mill found for this user. Assign a mill or pass mill_id.")
    return str(mill_id)


async def _build_dept_map(db: AsyncSession, mill_id: str, dept_names: List[str]) -> dict:
    """Build {dept_name_lower: dept_id} for fast lookup during bulk import."""
    if not dept_names:
        return {}
    result = await db.execute(
        select(Department).where(
            Department.mill_id == mill_id,
            func.lower(Department.name).in_([d.lower() for d in dept_names]),
            Department.is_active == True,
        )
    )
    return {d.name.lower(): str(d.id) for d in result.scalars().all()}


# ── Import helper functions ────────────────────────────────────────────

def _safe_date(val: Any) -> Optional[str]:
    if not val:
        return None
    if isinstance(val, _date) and not isinstance(val, _datetime):
        return val.isoformat()
    if isinstance(val, _datetime):
        return val.date().isoformat()
    s = str(val).strip()
    if not s or s.lower() in ("-", "—", "nil", "n/a", "na", "none", ""):
        return None
    for fmt in [
        "%d.%m.%y", "%d.%m.%Y",
        "%d/%m/%Y", "%d/%m/%y",
        "%d-%m-%Y", "%d-%m-%y",
        "%Y-%m-%d", "%m/%d/%Y",
        "%d %b %Y", "%d %B %Y",
    ]:
        try:
            return _datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        serial = float(s)
        if 1000 < serial < 100000:
            return (_date(1899, 12, 30) + _timedelta(days=int(serial))).isoformat()
    except (ValueError, TypeError):
        pass
    return None


def _safe_year(val: Any) -> Optional[int]:
    if not val:
        return None
    try:
        y = int(float(str(val).strip().split(".")[0].replace(",", "")))
        return y if 1900 <= y <= 2035 else None
    except (ValueError, TypeError):
        return None


def _safe_int(val: Any) -> Optional[int]:
    try:
        return int(float(str(val).replace(",", "").strip())) if val else None
    except (ValueError, TypeError):
        return None


def _safe_float(val: Any) -> Optional[float]:
    try:
        return float(str(val).replace(",", "").strip()) if val else None
    except (ValueError, TypeError):
        return None


def _normalize_status_machine(val: Any) -> str:
    if not val:
        return "running"
    v = str(val).strip().lower()
    if v in ("running", "active", "working", "ok", "good", "yes", "1", "true", "run"):
        return "running"
    if v in ("down", "breakdown", "stopped", "no", "0", "false", "stop"):
        return "breakdown"
    if v in ("maintenance", "service", "repair", "under maintenance", "idle"):
        return "idle"
    return "running"


def _normalize_gender(val: Any) -> str:
    if not val:
        return "Male"
    v = str(val).strip().lower()
    if v in ("m", "male", "man", "boy"):
        return "Male"
    if v in ("f", "female", "woman", "girl"):
        return "Female"
    return "Other"


def _normalize_mobile(val: Any) -> Optional[str]:
    if not val:
        return None
    digits = "".join(c for c in str(val) if c.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    return digits[-10:] if len(digits) >= 10 else None


def _is_annotation_row(row_dict: dict, num_headers: int) -> bool:
    """Return True for section-header / brand-annotation / total rows.

    IMPORTANT: When the frontend sends pre-mapped records (with SpinFlow field
    keys like 'code', 'name', 'department'), those are never annotation rows.
    Only raw Excel rows (with original header names) need annotation detection.
    """
    # Fast path: pre-mapped records from the frontend always have 'name' or 'code'
    # as direct keys. If so, skip annotation detection entirely.
    if row_dict.get("name") or row_dict.get("code") or row_dict.get("employee_id"):
        return False

    # Only check scalar (non-dict, non-list) top-level values.
    # Checking str(nested_dict) causes false positives when dicts contain
    # strings like "Brand:- Trutzschler" inside custom_fields.
    values = [
        str(v).strip()
        for v in row_dict.values()
        if v and not isinstance(v, (dict, list)) and str(v).strip()
    ]
    if not values:
        return True

    annotation_patterns = [
        "brand:-", "brand:", "country name:-", "country:",
        "department:", "section:", "note:", "total:", "sub total",
        "grand total", "s.no", "si no", "sr no", "sl no",
    ]
    for val in values:
        vl = val.lower()
        if any(p in vl for p in annotation_patterns):
            return True

    # Rows with ≤2 non-empty values in a wide table = likely a section label
    # (only applies to raw Excel rows, not pre-mapped records)
    if len(values) <= 2 and num_headers > 4:
        return True

    return False


def _extract_brand_country(row_dict: dict) -> tuple:
    """Extract brand and country from annotation-style row values."""
    brand = country = ""
    for val in row_dict.values():
        s = str(val or "")
        sl = s.lower()
        if "brand" in sl:
            parts = s.replace("Brand:-", "").replace("Brand:", "").strip()
            if "Country" in parts:
                brand = parts.split("Country")[0].strip()
                country = parts.split(":-")[-1].strip()
            else:
                brand = parts.split("\n")[0].strip()
        elif "country" in sl:
            country = s.split(":-")[-1].split("\n")[0].strip()
    return brand, country


@router.post("/masters/machines/bulk")
async def bulk_create_machines(
    req: MachineBulkRequest,
    mode: str = Query("update", regex="^(skip|update|create)$"),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    """
    Bulk upsert machines.
    mode=update → update existing by code (default)
    mode=skip   → skip rows whose code already exists
    mode=create → always insert (appends suffix if duplicate)
    Accepts both "items" and "machines" as payload key.

    Handles:
    - Duplicate codes within batch → suffix _02, _03, etc.
    - Null/empty codes → auto-generate from department abbreviation + counter
    - Leading/trailing whitespace in department names → stripped
    - Structured error details with code and name
    """
    scope = await get_mill_scope(current_user, db)
    # Accept mill_id from body when not in query params (frontend sends in body)
    effective_mill_id_param = mill_id or req.mill_id or None
    eff_mill_id = await _resolve_mill_id(scope, current_user, db, effective_mill_id_param)

    raw_items: List[Dict[str, Any]] = req.items
    if len(raw_items) > 1000:
        raise HTTPException(400, detail="Maximum 1000 items per batch")

    # ── Pre-fetch all departments for this mill ────────────────────────
    dept_res = await db.execute(
        select(Department.id, Department.name).where(Department.mill_id == eff_mill_id)
    )
    dept_map: Dict[str, str] = {}
    for r in dept_res:
        key = str(r.name).strip().lower() if r.name else ""
        if key:
            dept_map[key] = str(r.id)

    # ── Pre-fetch existing machine codes ──────────────────────────────
    existing_res = await db.execute(
        select(Machine.code, Machine.id).where(Machine.mill_id == eff_mill_id)
    )
    existing_map: Dict[str, str] = {}
    for r in existing_res:
        key = str(r.code).strip().lower() if r.code else ""
        if key:
            existing_map[key] = str(r.id)

    num_headers = len(raw_items[0]) if raw_items else 0

    # ── Pass 1: filter annotation rows, extract brand/country context ─
    valid_items: List[Dict[str, Any]] = []
    current_brand = current_country = ""

    for row in raw_items:
        if _is_annotation_row(row, num_headers):
            b, c = _extract_brand_country(row)
            if b:
                current_brand = b
            if c:
                current_country = c
            continue
        # Inherit brand/country from preceding annotation rows
        if current_brand and not row.get("brand") and not row.get("make"):
            row["_brand"] = current_brand
        if current_country and not row.get("country"):
            row["_country"] = current_country
        # Strip leading/trailing whitespace from department names
        if row.get("department"):
            row["department"] = str(row["department"]).strip()
        valid_items.append(row)

    # ── Pass 2: assign serial numbers + collect per-dept counters ─────
    valid_items.sort(key=lambda r: str(r.get("department") or "").lower())
    for sno, row in enumerate(valid_items, start=1):
        row["_serial_no"] = sno

    # Per-department counter for auto-generating machine codes
    dept_counters: Dict[str, int] = {}
    # Track codes seen within this batch to avoid duplicates
    seen_in_batch: Dict[str, int] = {}

    created = updated = skipped = 0
    errors: List[Dict[str, Any]] = []
    auto_created_depts: List[str] = []
    saved_machines: List[Dict[str, Any]] = []

    # Build system field set for machines (from field_aliases)
    MACHINE_SYSTEM_ALIASES: set = set()
    try:
        from app.core.field_aliases import FIELD_ALIASES_BY_MODULE
        for aliases in FIELD_ALIASES_BY_MODULE.get("machines", {}).values():
            for a in aliases:
                MACHINE_SYSTEM_ALIASES.add(a.lower().replace(" ", "_"))
                MACHINE_SYSTEM_ALIASES.add(a.lower())
    except ImportError:
        pass
    MACHINE_SYSTEM_ALIASES.update({"_serial_no", "_brand", "_country", "brand", "country", "make", "remarks"})

    for row in valid_items:
        try:
            raw_code = str(
                row.get("code") or row.get("mc code") or row.get("Mc Code") or
                row.get("mc_code") or row.get("MC Code") or row.get("Machine Code") or ""
            ).strip()
            dept_name = str(row.get("department") or "").strip()
            si_no = _safe_int(row.get("si_no") or row.get("SI No") or row.get("Sl No"))

            # ── Code: auto-generate if null/empty ──────────────────
            if not raw_code:
                # Abbreviation: first letter of each word, max 5 chars
                words = [w for w in dept_name.replace("-"," ").replace("."," ").replace("/"," ").split() if w]
                abbr = "".join(w[0].upper() for w in words)[:5] if words else "MC"
                counter = dept_counters.get(abbr, 1)
                while True:
                    candidate = f"{abbr}_{counter:03d}"
                    if (candidate.lower() not in existing_map and
                            candidate.lower() not in seen_in_batch):
                        break
                    counter += 1
                dept_counters[abbr] = counter + 1
                raw_code = candidate
            code = raw_code

            # ── Code: deduplicate within batch ─────────────────────
            code_lower = code.lower()
            seen_in_batch[code_lower] = seen_in_batch.get(code_lower, 0) + 1
            occurrence = seen_in_batch[code_lower]
            if occurrence > 1:
                code = f"{code}_{occurrence:02d}"
                code_lower = code.lower()

            # ── Name (required) ───────────────────────────────────
            name = str(
                row.get("name") or row.get("Name Of Item") or
                row.get("name_of_item") or ""
            ).strip()
            if not name:
                errors.append({
                    "row": row["_serial_no"],
                    "code": code,
                    "name": "",
                    "error": "Name is required"
                })
                skipped += 1
                continue

            # ── Department → ID (auto-create if missing) ──────────
            dept_id: Optional[str] = dept_map.get(dept_name.lower()) if dept_name else None
            if dept_name and not dept_id:
                dept_code = dept_name[:6].upper().replace(" ", "").replace(".", "")
                if not dept_code:
                    dept_code = f"D{len(dept_map)+1:03d}"
                try:
                    new_dept = Department(
                        id=str(_uuid_mod.uuid4()),
                        mill_id=eff_mill_id,
                        code=dept_code,
                        name=dept_name,
                        department_type="general",
                        is_active=True,
                    )
                    db.add(new_dept)
                    await db.flush()
                    dept_id = str(new_dept.id)
                    dept_map[dept_name.lower()] = dept_id
                    auto_created_depts.append(dept_name)
                except Exception as dept_err:
                    await db.rollback()
                    logger.warning(f"Dept auto-create failed for '{dept_name}': {dept_err}")
                    existing_dept = await db.execute(
                        select(Department).where(
                            Department.mill_id == eff_mill_id,
                            func.lower(Department.name) == dept_name.lower(),
                        )
                    )
                    existing_d = existing_dept.scalar_one_or_none()
                    if existing_d:
                        dept_id = str(existing_d.id)
                        dept_map[dept_name.lower()] = dept_id

            # ── Brand / country → make field ──────────────────────
            brand = str(
                row.get("brand") or row.get("make") or row.get("_brand") or ""
            ).strip()
            country = str(row.get("country") or row.get("_country") or "").strip()
            make_val = brand or None
            if make_val and country:
                make_val = f"{brand} ({country})"

            # ── Type/model ────────────────────────────────────────
            machine_type = str(
                row.get("machine_type") or row.get("type_no") or
                row.get("Type No") or row.get("model") or ""
            ).strip() or None

            # ── Installation date ─────────────────────────────────
            inst_date_str = _safe_date(
                row.get("installation_date") or row.get("comm_date") or
                row.get("Comm Date") or row.get("commission_date")
            )
            inst_date = None
            if inst_date_str:
                try:
                    from datetime import date as dt_date
                    inst_date = dt_date.fromisoformat(inst_date_str)
                except Exception:
                    pass

            # ── Manufacturing year ──────────────────────────────
            mfg_year = _safe_year(
                row.get("manufacturing_year") or row.get("Manufacturing Year")
                or row.get("mfg_year")
            )
            model_val = str(row.get("model_no") or row.get("Type No") or "").strip() or None
            if mfg_year and not model_val:
                model_val = str(mfg_year)
            elif mfg_year and model_val:
                model_val = f"{model_val} ({mfg_year})"

            spindles = _safe_int(
                row.get("spindles") or row.get("no_of_delivery_head") or
                row.get("No Of Delivery Head") or row.get("heads")
            )

            current_status = _normalize_status_machine(
                row.get("current_status") or row.get("status") or row.get("Status")
            )

            global_serial = str(row["_serial_no"])

            field_values: Dict[str, Any] = dict(
                name=name,
                department_id=dept_id,
                department=dept_name or None,
                machine_type=machine_type,
                make=make_val,
                model=model_val,
                spindles=spindles,
                installation_date=inst_date,
                current_status=current_status,
                serial_no=global_serial,
                status=True,
            )

            # ── Upsert logic ──────────────────────────────────────
            existing_id = existing_map.get(code_lower)
            machine_id: Optional[str] = None
            if existing_id:
                if mode == "skip":
                    skipped += 1
                    continue
                elif mode == "update":
                    await db.execute(
                        _sa_update(Machine)
                        .where(Machine.id == existing_id)
                        .values(**field_values)
                    )
                    machine_id = existing_id
                    updated += 1
                else:  # create mode → append suffix
                    code = f"{code}_{row['_serial_no']}"

            if not machine_id:
                machine_id = str(_uuid_mod.uuid4())
                db.add(Machine(
                    id=machine_id,
                    mill_id=eff_mill_id,
                    code=code,
                    **field_values,
                ))
                created += 1

            # Collect custom field values for this machine
            # Serial-number columns are never useful as stored values — skip them
            _SERIAL_KEYS = frozenset({"sl_no","si_no","sr_no","s_no","slno","sno","serial_no","serial","sl.no","si.no"})
            if machine_id:
                custom_values: list = []
                for col_header, val in row.items():
                    col_key = str(col_header).strip()
                    if col_key.startswith("_"):
                        continue
                    col_norm = col_key.lower().replace(" ", "_").replace(".", "_")
                    col_lower = col_key.lower()
                    # Skip serial-number placeholder columns
                    if col_norm in _SERIAL_KEYS or col_lower in _SERIAL_KEYS:
                        continue
                    if col_norm in MACHINE_SYSTEM_ALIASES or col_lower in MACHINE_SYSTEM_ALIASES:
                        continue
                    if val is None or str(val).strip() == "":
                        continue
                    custom_values.append({
                        "mill_id": eff_mill_id,
                        "module": "machines",
                        "record_id": machine_id,
                        "field_key": col_norm,
                        "value_text": str(val).strip(),
                    })
                if custom_values:
                    saved_machines.append({"id": machine_id, "custom_values": custom_values})

            # ── Commit every 20 records so Render timeout can't erase progress ──
            if (created + updated + skipped) % 20 == 0:
                try:
                    await db.commit()
                except Exception:
                    await db.rollback()

        except Exception as e:
            logger.warning(f"Machine row error (row {row.get('_serial_no','?')}): {e}")
            err_code = str(row.get("code") or row.get("mc code") or row.get("Mc Code") or row.get("mc_code") or "")
            err_name = str(row.get("name") or row.get("Name Of Item") or row.get("name_of_item") or "")
            err_dept = str(row.get("department") or "")
            errors.append({
                "row": row.get("_serial_no", "?"),
                "code": err_code,
                "name": err_name,
                "dept": err_dept,
                "error": str(e)[:200],
            })
            skipped += 1
            continue  # always continue — never abort the whole batch

    # ── Final commit for remaining records ────────────────────────────
    try:
        await db.commit()
    except Exception as commit_err:
        await db.rollback()
        logger.warning(f"Final commit warning: {commit_err}")

    # ── Store custom field values (best-effort, non-blocking) ─────────
    try:
        all_custom_values = []
        for sm in saved_machines:
            all_custom_values.extend(sm["custom_values"])
        if all_custom_values:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(MillRecordValue).values(all_custom_values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["mill_id", "module", "record_id", "field_key"],
                set_={"value_text": stmt.excluded.value_text},
            )
            await db.execute(stmt)
            await db.commit()
    except Exception as cv_err:
        logger.warning(f"Custom field values storage failed (non-critical): {cv_err}")

    # ── sync_mill_masters removed from request path (too slow for Render) ──
    # Departments and custom fields are auto-created inline above.

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
        "auto_created_departments": list(dict.fromkeys(auto_created_depts)),
    }


@router.post("/masters/customers/bulk")
async def bulk_create_customers(
    req: CustomerBulkRequest,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    if len(req.items) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    scope = await get_mill_scope(current_user, db)
    eff_mill_id = await _resolve_mill_id(scope, current_user, db, mill_id)

    created = 0
    skipped = 0
    errors: List[str] = []

    for i, row in enumerate(req.items):
        try:
            code = str(row.get("code") or "").strip()
            name = str(row.get("name") or "").strip()
            if not name:
                skipped += 1
                errors.append(f"Row {i + 1}: missing name")
                continue
            if not code:
                code = f"CUST{(i + 1):04d}"

            existing = await db.execute(
                select(Customer).where(Customer.code == code, Customer.mill_id == eff_mill_id)
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            customer = Customer(
                mill_id=eff_mill_id,
                code=code,
                name=name,
                gstin=str(row.get("gstin") or "").strip() or None,
                city=str(row.get("city") or "").strip() or None,
                phone=str(row.get("phone") or "").strip() or None,
                credit_limit=float(row.get("credit_limit") or 0),
                is_active=True,
            )
            db.add(customer)
            created += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Row {i + 1}: {str(e)}")

    await db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}


# ── Mill Owner: Create Mill (auto-assigns company_id) ─────────────

class MillOwnerCreateRequest(BaseModel):
    name: str
    code: str
    city: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


@router.post("/mills")
async def mill_owner_create_mill(
    req: MillOwnerCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new mill under the current user's company.
    MILL_OWNER and SUPER_ADMIN only.
    """
    from app.core.deps import get_mill_scope
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Mill Owner or Super Admin only")

    company_id = str(current_user.company_id) if current_user.company_id else None
    if not company_id:
        if current_user.mill_id:
            m = await db.get(Mill, current_user.mill_id)
            if m:
                company_id = str(m.company_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company associated with this user")
    # Single-mill build: no mill limit enforced

    # Unique code check
    existing = await db.execute(select(Mill).where(Mill.code == req.code.strip()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Mill code '{req.code}' already exists")

    mill = Mill(
        company_id=company_id,
        code=req.code.strip().upper(),
        name=req.name.strip(),
        city=req.city,
        state=req.state,
        phone=req.phone,
        address=req.address,
        is_active=True,
    )
    db.add(mill)
    await db.commit()
    await db.refresh(mill)
    return MillOut.model_validate(mill).model_dump()


# ---------------------------------------------------------------------------
# DELETE endpoints (soft-delete via is_active=False)
# ---------------------------------------------------------------------------

@router.delete("/masters/departments/{dept_id}")
async def delete_department(
    dept_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Department).where(Department.id == dept_id)
    if scope.get("mill_id"):
        stmt = stmt.where(Department.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        stmt = stmt.join(Mill, Department.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    dept.is_active = False
    await db.commit()
    return {"message": "Department deactivated", "id": dept_id}


@router.delete("/masters/yarn-counts/{yarn_id}")
async def delete_yarn_count(
    yarn_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(YarnCount).where(YarnCount.id == yarn_id)
    if scope.get("mill_id"):
        stmt = stmt.where(YarnCount.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        stmt = stmt.join(Mill, YarnCount.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    yc = result.scalar_one_or_none()
    if not yc:
        raise HTTPException(status_code=404, detail="Yarn count not found")
    yc.is_active = False
    await db.commit()
    return {"message": "Yarn count deactivated", "id": yarn_id}


@router.delete("/masters/vehicles/{vehicle_id}")
async def delete_vehicle(
    vehicle_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(MasterVehicle).where(MasterVehicle.id == vehicle_id)
    if scope.get("mill_id"):
        stmt = stmt.where(MasterVehicle.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        stmt = stmt.join(Mill, MasterVehicle.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    vehicle.is_active = False
    await db.commit()
    return {"message": "Vehicle deactivated", "id": vehicle_id}


@router.delete("/masters/routes/{route_id}")
async def delete_route(
    route_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Route).where(Route.id == route_id)
    if scope.get("mill_id"):
        stmt = stmt.where(Route.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        stmt = stmt.join(Mill, Route.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    route.is_active = False
    await db.commit()
    return {"message": "Route deactivated", "id": route_id}


# ── Bulk /masters/all — single round-trip for the Masters page ─────────────────

@router.get("/masters/all")
async def get_all_masters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all master collections in one response to eliminate N parallel calls."""
    from app.models.production import Shift, Machine as ProdMachine
    from app.models.inventory import Warehouse

    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    company_id = scope.get("company_id")

    def _mill_filter(stmt, model):
        if mill_id:
            return stmt.where(model.mill_id == mill_id)
        if company_id:
            from app.models.masters import Mill as MillModel
            return stmt.join(MillModel, model.mill_id == MillModel.id).where(
                MillModel.company_id == company_id
            )
        return stmt

    async def _fetch_companies():
        stmt = select(Company)
        if company_id:
            stmt = stmt.where(Company.id == company_id)
        r = await db.execute(stmt.order_by(Company.name))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "is_active": x.is_active, "city": x.city, "state": x.state,
             "phone": x.phone, "email": x.email, "gstin": x.gstin}
            for x in r.scalars().all()
        ]

    async def _fetch_mills():
        stmt = select(Mill)
        if mill_id:
            stmt = stmt.where(Mill.id == mill_id)
        elif company_id:
            stmt = stmt.where(Mill.company_id == company_id)
        r = await db.execute(stmt.order_by(Mill.name))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "is_active": x.is_active, "city": x.city, "state": x.state,
             "phone": x.phone, "company_id": str(x.company_id) if x.company_id else None}
            for x in r.scalars().all()
        ]

    async def _fetch_departments():
        stmt = select(Department)
        stmt = _mill_filter(stmt, Department)
        r = await db.execute(stmt.order_by(Department.name))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "is_active": x.is_active, "department_type": x.department_type,
             "mill_id": str(x.mill_id) if x.mill_id else None}
            for x in r.scalars().all()
        ]

    async def _fetch_yarn_counts():
        stmt = select(YarnCount)
        stmt = _mill_filter(stmt, YarnCount)
        r = await db.execute(stmt.order_by(YarnCount.count_value))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "count_value": x.count_value, "is_active": x.is_active,
             "mill_id": str(x.mill_id) if x.mill_id else None}
            for x in r.scalars().all()
        ]

    async def _fetch_customers():
        stmt = select(Customer)
        stmt = _mill_filter(stmt, Customer)
        r = await db.execute(stmt.order_by(Customer.name))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "is_active": x.is_active, "city": x.city, "state": x.state,
             "phone": x.phone, "email": x.email, "gstin": x.gstin,
             "mill_id": str(x.mill_id) if x.mill_id else None}
            for x in r.scalars().all()
        ]

    async def _fetch_vehicles():
        stmt = select(MasterVehicle)
        stmt = _mill_filter(stmt, MasterVehicle)
        r = await db.execute(stmt.order_by(MasterVehicle.code))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "is_active": x.is_active, "vehicle_type": x.vehicle_type,
             "capacity_kg": x.capacity_kg,
             "mill_id": str(x.mill_id) if x.mill_id else None}
            for x in r.scalars().all()
        ]

    async def _fetch_routes():
        stmt = select(Route)
        stmt = _mill_filter(stmt, Route)
        r = await db.execute(stmt.order_by(Route.name))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "is_active": x.is_active, "distance_km": x.distance_km,
             "mill_id": str(x.mill_id) if x.mill_id else None}
            for x in r.scalars().all()
        ]

    async def _fetch_shifts():
        from sqlalchemy import or_ as _or_
        stmt = select(Shift)
        if mill_id:
            stmt = stmt.where(_or_(Shift.mill_id == mill_id, Shift.mill_id.is_(None)))
        r = await db.execute(stmt.order_by(Shift.start_time))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "start_time": x.start_time, "end_time": x.end_time,
             "mill_id": str(x.mill_id) if x.mill_id else None}
            for x in r.scalars().all()
        ]

    async def _fetch_warehouses():
        stmt = select(Warehouse)
        if mill_id:
            stmt = stmt.where(Warehouse.mill_id == mill_id)
        r = await db.execute(stmt.order_by(Warehouse.name))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "is_active": x.is_active,
             "mill_id": str(x.mill_id) if x.mill_id else None}
            for x in r.scalars().all()
        ]

    async def _fetch_machines():
        stmt = select(ProdMachine)
        if mill_id:
            stmt = stmt.where(ProdMachine.mill_id == mill_id)
        r = await db.execute(stmt.order_by(ProdMachine.code).limit(1000))
        return [
            {"id": str(x.id), "code": x.code, "name": x.name,
             "machine_type": x.machine_type, "department": x.department,
             "department_id": str(x.department_id) if x.department_id else None,
             "is_active": getattr(x, "is_active", True),
             "mill_id": str(x.mill_id) if x.mill_id else None}
            for x in r.scalars().all()
        ]

    # Run all fetches in parallel
    (
        companies, mills, departments, yarn_counts, customers,
        vehicles, routes, shifts, warehouses, machines
    ) = await asyncio.gather(
        _fetch_companies(), _fetch_mills(), _fetch_departments(),
        _fetch_yarn_counts(), _fetch_customers(), _fetch_vehicles(),
        _fetch_routes(), _fetch_shifts(), _fetch_warehouses(), _fetch_machines(),
        return_exceptions=True,
    )

    def _safe(val, name):
        if isinstance(val, Exception):
            logger.warning(f"masters/all: {name} failed: {val}")
            return []
        return val

    return {
        "companies":    _safe(companies, "companies"),
        "mills":        _safe(mills, "mills"),
        "departments":  _safe(departments, "departments"),
        "yarn_counts":  _safe(yarn_counts, "yarn_counts"),
        "customers":    _safe(customers, "customers"),
        "vehicles":     _safe(vehicles, "vehicles"),
        "routes":       _safe(routes, "routes"),
        "shifts":       _safe(shifts, "shifts"),
        "warehouses":   _safe(warehouses, "warehouses"),
        "machines":     _safe(machines, "machines"),
    }
