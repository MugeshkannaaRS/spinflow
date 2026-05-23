from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from sqlalchemy import select
from app.db.session import get_db
from app.core.deps import get_current_user, require_module
from app.models.user import User
from app.models.production import Machine, Shift
from app.schemas.production import (
    MachineCreate, MachineResponse, ProductionEntryResponse, ProductionEntryCreate,
    DowntimeResponse, DowntimeCreate, ShiftCreate, ShiftOut,
)
from app.services.production_service import ProductionService

router = APIRouter()


@router.get("/production/machines")
async def get_machines(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    svc = ProductionService(db, current_user)
    return await svc.list_machines(page=page, page_size=page_size)


@router.post("/production/machines", response_model=MachineResponse)
async def create_machine(
    req: MachineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    machine = Machine(**req.model_dump())
    db.add(machine)
    await db.flush()
    return machine


@router.get("/production/shifts")
async def get_shifts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    result = await db.execute(select(Shift))
    return result.scalars().all()


@router.post("/production/shifts", response_model=ShiftOut)
async def create_shift(
    req: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    shift = Shift(**req.model_dump())
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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    svc = ProductionService(db, current_user)
    return await svc.list_entries(date=date, shift=shift, department=department, machine=machine, status=status, page=page, page_size=page_size)


@router.post("/production/entries", response_model=ProductionEntryResponse)
async def create_entry(
    req: ProductionEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.create_entry(req)


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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    svc = ProductionService(db, current_user)
    return await svc.list_downtime(page=page, page_size=page_size)


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


@router.patch("/production/machines/{machine_id}/status", response_model=MachineResponse)
async def update_machine_status(
    machine_id: str,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    return await svc.update_machine_status(machine_id, status)


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
