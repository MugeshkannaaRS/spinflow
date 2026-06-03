import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Any, Dict

from sqlalchemy import select, func
from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.production import Machine, Shift, ProductionEntry, DowntimeLog
from app.models.masters import Mill, Department, YarnCount
from app.schemas.production import (
    MachineCreate, MachineResponse, ProductionEntryResponse, ProductionEntryCreate,
    DowntimeResponse, DowntimeCreate, ShiftCreate, ShiftOut,
    ProductionBulkCreate, ProductionBulkResponse,
)
from app.services.production_service import ProductionService

router = APIRouter()
MAX_BATCH = 500


@router.get("/production/machines")
async def get_machines(
    department: Optional[str] = Query(None),
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    query = select(Machine).where(Machine.status == True)
    if effective_mill_id:
        query = query.where(Machine.mill_id == effective_mill_id)
    elif scope["company_id"]:
        query = query.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if department:
        query = query.join(Department, Machine.department_id == Department.id).where(Department.name == department)
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "data": [MachineResponse.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"production.machines list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/production/machines", response_model=MachineResponse)
async def create_machine(
    req: MachineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    machine = Machine(**req.model_dump())
    if scope["mill_id"]:
        machine.mill_id = scope["mill_id"]
    elif scope["company_id"]:
        raise HTTPException(status_code=400, detail="mill_id is required for MILL_OWNER")
    db.add(machine)
    await db.flush()
    return machine


@router.get("/production/shifts")
async def get_shifts(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    query = select(Shift)
    if effective_mill_id:
        query = query.where(Shift.mill_id == effective_mill_id)
    elif scope["company_id"]:
        query = query.join(Mill, Shift.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    try:
        result = await db.execute(query)
        return [ShiftOut.model_validate(item).model_dump() for item in result.scalars().all()]
    except Exception as e:
        logger.error(f"production.shifts list error: {e}")
        return []


@router.post("/production/shifts", response_model=ShiftOut)
async def create_shift(
    req: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    shift = Shift(**req.model_dump())
    if scope["mill_id"]:
        shift.mill_id = scope["mill_id"]
    elif scope["company_id"]:
        raise HTTPException(status_code=400, detail="mill_id is required for MILL_OWNER")
    db.add(shift)
    await db.flush()
    return shift


@router.get("/production/entries")
async def get_entries(
    date: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    machine: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    query = select(ProductionEntry).join(Machine, ProductionEntry.machine_code == Machine.code)
    if effective_mill_id:
        query = query.where(Machine.mill_id == effective_mill_id)
    elif scope["company_id"]:
        query = query.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code == "MACHINE_OPERATOR":
        query = query.where(ProductionEntry.operator == current_user.name)
    if date:
        query = query.where(ProductionEntry.date == date)
    if shift:
        query = query.where(ProductionEntry.shift == shift)
    if department:
        query = query.where(ProductionEntry.department == department)
    if machine:
        query = query.where(ProductionEntry.machine_code == machine)
    if status:
        query = query.where(ProductionEntry.status == status)
    query = query.order_by(ProductionEntry.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "data": [ProductionEntryResponse.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"production.entries list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/production/entries", response_model=ProductionEntryResponse)
async def create_entry(
    req: ProductionEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.create_entry(req)


@router.post("/production/entries/bulk", response_model=ProductionBulkResponse)
async def create_entries_bulk(
    req: ProductionBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    if len(req.entries) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    svc = ProductionService(db, current_user)
    return await svc.create_entries_bulk(req)


@router.put("/production/entries/{entry_id}/approve", response_model=ProductionEntryResponse)
async def approve_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.approve_entry(entry_id)


@router.patch("/production/entries/{entry_id}/reject", response_model=ProductionEntryResponse)
async def reject_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.reject_entry(entry_id)


@router.get("/production/downtime")
async def get_downtime(
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    query = select(DowntimeLog).join(Machine, DowntimeLog.machine_code == Machine.code)
    if effective_mill_id:
        query = query.where(Machine.mill_id == effective_mill_id)
    elif scope["company_id"]:
        query = query.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    query = query.order_by(DowntimeLog.started_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "data": [DowntimeResponse.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"production.downtime list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/production/downtime", response_model=DowntimeResponse)
async def create_downtime(
    req: DowntimeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.log_downtime(
        machine_code=req.machine_code,
        reason=req.reason,
        started_at=req.started_at,
        reported_by=req.reported_by,
    )


@router.patch("/production/downtime/{downtime_id}/resolve", response_model=DowntimeResponse)
async def resolve_downtime(
    downtime_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.resolve_downtime(downtime_id)


@router.put("/production/machines/{machine_id}", response_model=MachineResponse)
async def update_machine(
    machine_id: str,
    req: MachineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.update_machine(machine_id, req.model_dump(exclude_unset=True))


@router.patch("/production/machines/{machine_id}/status", response_model=MachineResponse)
async def update_machine_status(
    machine_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.update_machine_status(machine_id, body.get("status", ""))


@router.get("/production/dashboard/summary")
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    svc = ProductionService(db, current_user)
    return await svc.dashboard_summary()


@router.get("/production/dashboard/trend")
async def efficiency_trend(
    days: int = Query(7),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    svc = ProductionService(db, current_user)
    return await svc.efficiency_trend(days)


@router.get("/production/page-init")
async def production_page_init(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    result: Dict[str, Any] = {}
    try:
        dept_query = select(Department.id, Department.name, Department.code).where(
            Department.is_active == True
        )
        if effective_mill_id:
            dept_query = dept_query.where(Department.mill_id == effective_mill_id)
        dept_rows = await db.execute(dept_query.order_by(Department.name))
        result["departments"] = [{"id": r.id, "name": r.name, "code": r.code} for r in dept_rows]
    except Exception as e:
        logger.error(f"production.page-init departments error: {e}")
        result["departments"] = []
    try:
        shift_rows = await db.execute(select(Shift.id, Shift.code, Shift.name, Shift.start_time, Shift.end_time).order_by(Shift.code))
        result["shifts"] = [{"id": r.id, "code": r.code, "name": r.name, "start_time": r.start_time, "end_time": r.end_time} for r in shift_rows]
    except Exception as e:
        logger.error(f"production.page-init shifts error: {e}")
        result["shifts"] = []
    try:
        yc_query = select(YarnCount.id, YarnCount.count, YarnCount.blend).where(YarnCount.is_active == True)
        if effective_mill_id:
            yc_query = yc_query.where(YarnCount.mill_id == effective_mill_id)
        yc_rows = await db.execute(yc_query.order_by(YarnCount.count))
        result["yarn_counts"] = [{"id": r.id, "count": r.count, "blend": r.blend} for r in yc_rows]
    except Exception as e:
        logger.error(f"production.page-init yarn_counts error: {e}")
        result["yarn_counts"] = []
    return result
