from __future__ import annotations
import logging
import uuid as _uuid_mod
from datetime import date as _date, datetime as _datetime, timedelta as _timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update as _sa_update
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
    page_size: int = Query(20, ge=1, le=100),
    include_inactive: bool = Query(False),
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
                "page_size": 20,
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
    page_size: int = Query(20, ge=1, le=100),
    include_inactive: bool = Query(False),
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
    from app.services.pricing_service import PricingService
    svc = PricingService(db)
    ok, msg = await svc.can_create_mill(req.company_id)
    if not ok:
        raise HTTPException(status_code=403, detail=msg)
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
    page_size: int = Query(20, ge=1, le=100),
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
    page_size: int = Query(20, ge=1, le=100),
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
    page_size: int = Query(20, ge=1, le=100),
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
    page_size: int = Query(20, ge=1, le=100),
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
    page_size: int = Query(20, ge=1, le=100),
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
    """Return True for section-header / brand-annotation / total rows."""
    values = [str(v).strip() for v in row_dict.values() if v and str(v).strip()]
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
    # Rows with ≤2 values in a wide table = section label
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
    """
    scope = await get_mill_scope(current_user, db)
    eff_mill_id = await _resolve_mill_id(scope, current_user, db, mill_id)

    raw_items: List[Dict[str, Any]] = req.items
    if len(raw_items) > 1000:
        raise HTTPException(400, detail="Maximum 1000 items per batch")

    # ── Pre-fetch all departments for this mill ────────────────────────
    dept_res = await db.execute(
        select(Department.id, Department.name).where(Department.mill_id == eff_mill_id)
    )
    dept_map: Dict[str, str] = {r.name.strip().lower(): str(r.id) for r in dept_res}

    # ── Pre-fetch existing machine codes ──────────────────────────────
    existing_res = await db.execute(
        select(Machine.code, Machine.id).where(Machine.mill_id == eff_mill_id)
    )
    existing_map: Dict[str, str] = {r.code.strip().lower(): str(r.id) for r in existing_res}

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
        valid_items.append(row)

    # ── Pass 2: sort by department + assign GLOBAL serial numbers ─────
    valid_items.sort(key=lambda r: str(r.get("department") or "").lower())
    for sno, row in enumerate(valid_items, start=1):
        row["_serial_no"] = sno

    created = updated = skipped = 0
    errors: List[Dict[str, Any]] = []
    auto_created_depts: List[str] = []

    for row in valid_items:
        try:
            # ── Code ──────────────────────────────────────────────────
            raw_code = (
                row.get("code") or row.get("mc code") or row.get("Mc Code")
                or row.get("mc_code") or ""
            )
            dept_name = str(row.get("department") or "").strip()
            si_no = _safe_int(row.get("si_no") or row.get("SI No") or row.get("Sl No"))

            if not str(raw_code).strip():
                dept_abbr = dept_name[:2].upper().replace(" ", "") if dept_name else "MC"
                raw_code = (
                    f"{dept_abbr}{si_no:03d}" if si_no
                    else f"MC{row['_serial_no']:04d}"
                )
            code = str(raw_code).strip()

            # ── Name (required) ───────────────────────────────────────
            name = str(
                row.get("name") or row.get("Name Of Item") or
                row.get("name_of_item") or ""
            ).strip()
            if not name:
                errors.append({"row": row["_serial_no"], "error": "name is required"})
                skipped += 1
                continue

            # ── Department → ID (auto-create if missing) ──────────────
            dept_id: Optional[str] = dept_map.get(dept_name.lower()) if dept_name else None
            if dept_name and not dept_id:
                dept_code = dept_name[:6].upper().replace(" ", "")
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

            # ── Brand / country → make field ──────────────────────────
            brand = str(
                row.get("brand") or row.get("make") or row.get("_brand") or ""
            ).strip()
            country = str(row.get("country") or row.get("_country") or "").strip()
            make_val = brand or None
            if make_val and country:
                make_val = f"{brand} ({country})"

            # ── Type/model ────────────────────────────────────────────
            machine_type = str(
                row.get("machine_type") or row.get("type_no") or
                row.get("Type No") or row.get("model") or ""
            ).strip() or None

            # ── Installation date ─────────────────────────────────────
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

            # ── Manufacturing year → stored in model field ─────────────
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

            # ── Upsert logic ──────────────────────────────────────────
            existing_id = existing_map.get(code.lower())
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
                    updated += 1
                    continue
                else:  # create mode → append suffix
                    code = f"{code}_{row['_serial_no']}"

            db.add(Machine(
                id=str(_uuid_mod.uuid4()),
                mill_id=eff_mill_id,
                code=code,
                **field_values,
            ))
            created += 1

            if (created + updated) % 50 == 0:
                await db.flush()

        except Exception as e:
            errors.append({"row": row.get("_serial_no", "?"), "error": str(e)})
            skipped += 1

    await db.commit()
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
    from app.services.pricing_service import PricingService

    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Mill Owner or Super Admin only")

    company_id = str(current_user.company_id) if current_user.company_id else None
    if not company_id:
        # Fallback: derive from mill_id
        if current_user.mill_id:
            m = await db.get(Mill, current_user.mill_id)
            if m:
                company_id = str(m.company_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company associated with this user")

    # Pricing / plan limit check
    svc = PricingService(db)
    ok, msg = await svc.can_create_mill(company_id)
    if not ok:
        raise HTTPException(status_code=403, detail=msg)

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
