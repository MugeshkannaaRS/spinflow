from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timezone

from app.db.session import get_db
from app.core.deps import get_current_user, require_module
from app.models.user import User
from app.models.maintenance import MaintenanceLog, MaintenanceSchedule, Technician
from app.schemas.maintenance import (
    MaintenanceCreate, MaintenanceOut, MaintenanceUpdate,
    MaintenanceListResponse, ScheduleCreate, ScheduleOut,
)

router = APIRouter()


@router.get("/maintenance/tasks")
async def get_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    stmt = select(MaintenanceLog).order_by(MaintenanceLog.date.desc())
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": items,
    }


@router.post("/maintenance/tasks", response_model=MaintenanceOut)
async def create_task(
    req: MaintenanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    task = MaintenanceLog(
        date=datetime.now().strftime("%Y-%m-%d"),
        machine_code=req.machine_id,
        type=req.maintenance_type,
        description=req.description,
        technician_name=current_user.name,
        status="open",
    )
    db.add(task)
    await db.flush()
    return task


@router.put("/maintenance/tasks/{task_id}/status", response_model=MaintenanceOut)
async def update_task_status(
    task_id: str,
    req: MaintenanceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    result = await db.execute(select(MaintenanceLog).where(MaintenanceLog.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if req.status is not None:
        task.status = req.status
    if req.assigned_to is not None:
        task.technician_name = req.assigned_to
    if req.status == "completed":
        task.completed_at = datetime.now(timezone.utc)
    if req.actual_minutes is not None:
        task.downtime_min = req.actual_minutes
    await db.flush()
    return task


@router.get("/maintenance/schedules")
async def get_schedules(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    stmt = select(MaintenanceSchedule)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": items,
    }


@router.post("/maintenance/schedules", response_model=ScheduleOut)
async def create_schedule(
    req: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    schedule = MaintenanceSchedule(
        machine_code=req.machine_id,
        type=req.schedule_type,
        frequency_days=req.frequency_days,
        next_due=req.next_due_date.isoformat(),
        description=req.description,
    )
    db.add(schedule)
    await db.flush()
    return schedule
