import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import require_module, get_mill_scope
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
from app.models.user import User
from app.models.masters import (
    Company, Mill, Department, YarnCount, Customer, MasterVehicle, Route,
)

router = APIRouter()

# ── Company ─────────────────────────────────────────────

@router.get("/masters/companies")
async def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
):
    scope = await get_mill_scope(current_user)
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

@router.patch("/masters/companies/{id}", response_model=CompanyOut)
async def update_company(
    id: str,
    req: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    service = MastersService(db, current_user)
    return await service.update_company(id, req, updated_by=current_user.id)

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
    scope = await get_mill_scope(current_user)
    query = select(Mill)
    if scope["company_id"]:
        query = query.where(Mill.company_id == scope["company_id"])
    elif scope["mill_id"]:
        query = query.where(Mill.id == scope["mill_id"])
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
    scope = await get_mill_scope(current_user)
    query = select(Department)
    if scope["mill_id"]:
        query = query.where(Department.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        query = query.join(Mill, Department.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
    scope = await get_mill_scope(current_user)
    query = select(YarnCount)
    if scope["mill_id"]:
        query = query.where(YarnCount.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        query = query.join(Mill, YarnCount.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
    scope = await get_mill_scope(current_user)
    query = select(Customer)
    if scope["mill_id"]:
        query = query.where(Customer.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        query = query.join(Mill, Customer.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
    scope = await get_mill_scope(current_user)
    query = select(MasterVehicle)
    if scope["mill_id"]:
        query = query.where(MasterVehicle.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        query = query.join(Mill, MasterVehicle.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
    scope = await get_mill_scope(current_user)
    query = select(Route)
    if scope["mill_id"]:
        query = query.where(Route.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        query = query.join(Mill, Route.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
