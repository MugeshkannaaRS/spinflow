from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.deps import require_module
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
    service = MastersService(db, current_user)
    return await service.list_companies(page=page, page_size=page_size, include_inactive=include_inactive)

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
    service = MastersService(db, current_user)
    return await service.list_mills(company_id=company_id, page=page, page_size=page_size, include_inactive=include_inactive)

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
    service = MastersService(db, current_user)
    return await service.list_departments(mill_id=mill_id, page=page, page_size=page_size, include_inactive=include_inactive)

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
    service = MastersService(db, current_user)
    return await service.list_yarn_counts(mill_id=mill_id, page=page, page_size=page_size, include_inactive=include_inactive)

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
    service = MastersService(db, current_user)
    return await service.list_customers(mill_id=mill_id, page=page, page_size=page_size, include_inactive=include_inactive)

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
    service = MastersService(db, current_user)
    return await service.list_vehicles(mill_id=mill_id, page=page, page_size=page_size, include_inactive=include_inactive)

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
    service = MastersService(db, current_user)
    return await service.list_routes(mill_id=mill_id, page=page, page_size=page_size, include_inactive=include_inactive)

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
