from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
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


@router.post("/masters/machines/bulk")
async def bulk_create_machines(
    req: MachineBulkRequest,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    if len(req.items) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    scope = await get_mill_scope(current_user, db)
    eff_mill_id = await _resolve_mill_id(scope, current_user, db, mill_id)

    # Pre-build department name → id map (case-insensitive, single query)
    dept_names = list({str(r.get("department") or "").strip() for r in req.items if r.get("department")})
    dept_map = await _build_dept_map(db, eff_mill_id, dept_names)

    created = 0
    skipped = 0
    errors: List[str] = []

    for i, row in enumerate(req.items):
        try:
            code = str(row.get("code") or "").strip()
            if not code:
                # Auto-generate code
                code = f"MC{(i + 1):04d}"

            existing = await db.execute(
                select(Machine).where(Machine.code == code, Machine.mill_id == eff_mill_id)
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            dept_name = str(row.get("department") or "").strip()
            dept_id = row.get("department_id") or dept_map.get(dept_name.lower()) or None

            # Coerce status
            raw_status = str(row.get("current_status") or row.get("status") or "running").lower().strip()
            status_map = {"active": "running", "inactive": "idle", "down": "breakdown"}
            current_status = status_map.get(raw_status, raw_status)
            if current_status not in ("running", "idle", "breakdown", "maintenance"):
                current_status = "running"

            machine = Machine(
                code=code,
                name=str(row.get("name") or "").strip() or None,
                machine_type=str(row.get("machine_type") or row.get("type_no") or "").strip() or None,
                department_id=dept_id,
                department=dept_name or None,
                target_kg=float(row.get("target_kg") or 0),
                spindles=int(float(row.get("spindles") or 0)) if row.get("spindles") else None,
                current_status=current_status,
                status=True,
                mill_id=eff_mill_id,
            )
            db.add(machine)
            created += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Row {i + 1}: {str(e)}")

    await db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}


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
