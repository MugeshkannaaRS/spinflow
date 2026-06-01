import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone

from app.db.session import get_db

logger = logging.getLogger(__name__)
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
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    scope = await get_mill_scope(current_user)
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

    stmt = select(MaintenanceLog).join(Machine, MaintenanceLog.machine_code == Machine.code)
    if effective_mill_id:
        stmt = stmt.where(Machine.mill_id == effective_mill_id)
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    stmt = stmt.order_by(MaintenanceLog.date.desc())
    try:
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
            "data": [MaintenanceOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"maintenance.tasks list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


async def _validate_machine_in_scope(db: AsyncSession, machine_code: str, scope: dict):
    stmt = select(Machine).where(Machine.code == machine_code)
    if scope["mill_id"]:
        stmt = stmt.where(Machine.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Machine not in your scope")


@router.post("/maintenance/tasks", response_model=MaintenanceOut)
async def create_task(
    req: MaintenanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user)
    await _validate_machine_in_scope(db, req.machine_id, scope)
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
    scope = await get_mill_scope(current_user)
    stmt = select(MaintenanceLog).join(Machine, MaintenanceLog.machine_code == Machine.code).where(MaintenanceLog.id == task_id)
    if scope["mill_id"]:
        stmt = stmt.where(Machine.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
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
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    scope = await get_mill_scope(current_user)
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

    stmt = select(MaintenanceSchedule).join(Machine, MaintenanceSchedule.machine_code == Machine.code)
    if effective_mill_id:
        stmt = stmt.where(Machine.mill_id == effective_mill_id)
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    try:
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
            "data": [ScheduleOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"maintenance.schedules list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/maintenance/schedules", response_model=ScheduleOut)
async def create_schedule(
    req: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user)
    await _validate_machine_in_scope(db, req.machine_id, scope)
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
    scope = await get_mill_scope(current_user)
    created = 0
    skipped = 0
    errors: List[str] = []
    for item in req.items:
        try:
            if not item.machine_code or not item.task_description:
                errors.append(f"Row missing machine_code or task_description")
                skipped += 1
                continue
            try:
                await _validate_machine_in_scope(db, item.machine_code, scope)
            except HTTPException:
                errors.append(f"{item.machine_code}: machine not in scope")
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


@router.put("/maintenance/schedules/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: str,
    req: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user)
    stmt = select(MaintenanceSchedule).join(Machine, MaintenanceSchedule.machine_code == Machine.code).where(MaintenanceSchedule.id == schedule_id)
    if scope["mill_id"]:
        stmt = stmt.where(Machine.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if req.machine_id is not None:
        schedule.machine_code = req.machine_id
    if req.schedule_type is not None:
        schedule.type = req.schedule_type
    if req.frequency_days is not None:
        schedule.frequency_days = req.frequency_days
    if req.description is not None:
        schedule.description = req.description
    if req.last_done_date is not None:
        schedule.last_done = req.last_done_date.isoformat()
    if req.next_due_date is not None:
        schedule.next_due = req.next_due_date.isoformat()
    await db.flush()
    return schedule


@router.get("/maintenance/parameters")
async def get_parameters(
    machine_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    scope = await get_mill_scope(current_user)
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

    stmt = select(MachineParameter).join(Machine, MachineParameter.machine_code == Machine.code)
    if effective_mill_id:
        stmt = stmt.where(Machine.mill_id == effective_mill_id)
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if machine_code:
        stmt = stmt.where(MachineParameter.machine_code == machine_code)
    try:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        items = result.scalars().all()
        return {"total": total, "page": page, "page_size": page_size, "data": [MachineParameterOut.model_validate(item).model_dump() for item in items]}
    except Exception as e:
        logger.error(f"maintenance.parameters list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/maintenance/parameters/bulk", response_model=BulkResponse)
async def bulk_create_parameters(
    req: ParameterBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user)
    created = 0
    skipped = 0
    errors: List[str] = []
    for item in req.items:
        try:
            if not item.machine_code or not item.parameter_name:
                errors.append("Row missing machine_code or parameter_name")
                skipped += 1
                continue
            try:
                await _validate_machine_in_scope(db, item.machine_code, scope)
            except HTTPException:
                errors.append(f"{item.machine_code}: machine not in scope")
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


@router.get("/maintenance/page-init")
async def maintenance_page_init(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    scope = await get_mill_scope(current_user)
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
        mach_query = select(Machine.id, Machine.code, Machine.name, Machine.department).where(Machine.status == True)
        if effective_mill_id:
            mach_query = mach_query.where(Machine.mill_id == effective_mill_id)
        mach_rows = await db.execute(mach_query.order_by(Machine.code))
        result["machines"] = [{"id": r.id, "code": r.code, "name": r.name} for r in mach_rows]
    except Exception as e:
        logger.error(f"maintenance.page-init machines error: {e}")
        result["machines"] = []
    try:
        tech_rows = await db.execute(
            select(Technician.id, Technician.code, Technician.name, Technician.specialization)
            .where(Technician.is_active == True)
            .order_by(Technician.name)
        )
        result["technicians"] = [{"id": r.id, "code": r.code, "name": r.name, "specialization": r.specialization} for r in tech_rows]
    except Exception as e:
        logger.error(f"maintenance.page-init technicians error: {e}")
        result["technicians"] = []
    return result
