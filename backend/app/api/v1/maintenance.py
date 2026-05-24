from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timezone

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.maintenance import MaintenanceLog, MaintenanceSchedule, Technician, MachineParameter
from app.models.production import Machine
from app.models.masters import Mill
from app.schemas.maintenance import (
    MaintenanceCreate, MaintenanceOut, MaintenanceUpdate,
    MaintenanceListResponse, ScheduleCreate, ScheduleOut,
    ScheduleBulkCreate, ParameterBulkCreate, BulkResponse, MachineParameterOut,
)

router = APIRouter()


@router.get("/maintenance/tasks")
async def get_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(MaintenanceLog).join(Machine, MaintenanceLog.machine_code == Machine.code)
    if scope["mill_id"]:
        stmt = stmt.where(Machine.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    stmt = stmt.order_by(MaintenanceLog.date.desc())
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
    scope = await get_mill_scope(current_user)
    stmt = select(MaintenanceSchedule).join(Machine, MaintenanceSchedule.machine_code == Machine.code)
    if scope["mill_id"]:
        stmt = stmt.where(Machine.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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


_FREQ_MAP = {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}


@router.post("/maintenance/schedules/bulk", response_model=BulkResponse)
async def bulk_create_schedules(
    req: ScheduleBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    created = 0
    skipped = 0
    errors: List[str] = []
    for item in req.items:
        try:
            if not item.machine_code or not item.task_description:
                errors.append(f"Row missing machine_code or task_description")
                skipped += 1
                continue
            freq_days = _FREQ_MAP.get(item.frequency.strip().lower(), 30)
            description = item.task_description
            if item.technician_name:
                description = f"{description} | Technician: {item.technician_name}"
            schedule = MaintenanceSchedule(
                machine_code=item.machine_code.strip(),
                type="preventive",
                frequency_days=freq_days,
                description=description,
                last_done=item.last_done_date,
                next_due=item.next_due_date,
                is_active=True,
            )
            db.add(schedule)
            created += 1
        except Exception as exc:
            errors.append(f"{item.machine_code}: {str(exc)}")
            skipped += 1
    await db.commit()
    return BulkResponse(created=created, skipped=skipped, errors=errors)


@router.get("/maintenance/parameters")
async def get_parameters(
    machine_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(MachineParameter).join(Machine, MachineParameter.machine_code == Machine.code)
    if scope["mill_id"]:
        stmt = stmt.where(Machine.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if machine_code:
        stmt = stmt.where(MachineParameter.machine_code == machine_code)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {"total": total, "page": page, "page_size": page_size, "data": items}


@router.post("/maintenance/parameters/bulk", response_model=BulkResponse)
async def bulk_create_parameters(
    req: ParameterBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    created = 0
    skipped = 0
    errors: List[str] = []
    for item in req.items:
        try:
            if not item.machine_code or not item.parameter_name:
                errors.append("Row missing machine_code or parameter_name")
                skipped += 1
                continue
            param = MachineParameter(
                machine_code=item.machine_code.strip(),
                parameter_name=item.parameter_name.strip(),
                standard_value=item.standard_value,
                min_value=item.min_value,
                max_value=item.max_value,
                unit=item.unit,
                created_at=datetime.now(timezone.utc),
            )
            db.add(param)
            created += 1
        except Exception as exc:
            errors.append(f"{item.machine_code}: {str(exc)}")
            skipped += 1
    await db.commit()
    return BulkResponse(created=created, skipped=skipped, errors=errors)
