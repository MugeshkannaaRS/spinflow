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
from app.models.maintenance import MaintenanceLog, MaintenanceSchedule, Technician, MachineParameter, PMEntryLog
from app.models.production import Machine
from app.models.masters import Mill
from app.schemas.maintenance import (
    MaintenanceCreate, MaintenanceOut, MaintenanceUpdate,
    MaintenanceListResponse, ScheduleCreate, ScheduleOut,
    ScheduleBulkCreate, ParameterBulkCreate, BulkResponse, MachineParameterOut,
)

router = APIRouter()
MAX_BATCH = 500


@router.get("/maintenance/tasks")
async def get_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
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
    scope = await get_mill_scope(current_user, db)
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
    await db.commit()
    return task


@router.put("/maintenance/tasks/{task_id}/status", response_model=MaintenanceOut)
async def update_task_status(
    task_id: str,
    req: MaintenanceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user, db)
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
    await db.commit()
    return task


@router.get("/maintenance/schedules")
async def get_schedules(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
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
    scope = await get_mill_scope(current_user, db)
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
    await db.commit()
    return schedule


_FREQ_MAP: dict = {
    # Generic
    "daily": 1, "weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365,
    # AACSL exact strings (normalised to lower)
    "01 month": 30,  "1 month": 30,  "1 month ": 30,  "1 months": 30,
    "02 month": 60,  "2 month": 60,  "2 month ": 60,  "2 months": 60,
    "03 month": 90,  "3 month": 90,  "3 months": 90,
    "04 month": 120, "4 month": 120,
    "06 month": 180, "6 month": 180, "06 months": 180, "6 months": 180,
    "01 year": 365,  "1 year": 365,  "1 year ": 365,
    "02 years": 730, "2 years": 730,
    "2 .5 year": 912, "2.5 year": 912, "2.5 years": 912,
    "03 year": 1095, "3 year": 1095,  "03 years": 1095, "3 years": 1095,
    "04 years": 1460, "4 years": 1460,
    "05 years": 1825, "5 years": 1825,
    "dia base": 180,  # treat cot renewal as 6-month cycle
}

def _parse_freq(frequency_str: str) -> int:
    """Convert any AACSL or generic frequency string to days. Falls back to 30."""
    if not frequency_str:
        return 30
    # If the bulk import already resolved to an integer frequency_days, trust it
    s = str(frequency_str).strip().lower()
    return _FREQ_MAP.get(s, 30)


@router.post("/maintenance/schedules/bulk", response_model=BulkResponse)
async def bulk_create_schedules(
    req: ScheduleBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    if len(req.items) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    scope = await get_mill_scope(current_user, db)
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
            # Use pre-computed frequency_days from Excel if present, else parse string
            freq_days = (
                int(item.frequency_days)
                if getattr(item, "frequency_days", None) and str(item.frequency_days).isdigit()
                else _parse_freq(item.frequency or "")
            )
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
                department=item.department,
                lubricant_name=item.lubricant_name,
                lubricant_quantity=item.lubricant_quantity,
                manpower_count=item.manpower_count,
                machine_count=item.machine_count,
                sl_no=item.sl_no,
                machine_line_code=item.machine_line_code,
                opening_dia_mm=item.opening_dia_mm,
                current_dia_mm=item.current_dia_mm,
                grinding_freq_days=item.grinding_freq_days,
                last_grinding_date=item.last_grinding_date,
            )
            db.add(schedule)
            created += 1
        except Exception as exc:
            errors.append(f"{item.machine_code}: {str(exc)}")
            skipped += 1
    await db.commit()
    return BulkResponse(created=created, skipped=skipped, errors=errors)


@router.patch("/maintenance/schedules/{schedule_id}/done", response_model=ScheduleOut)
async def mark_schedule_done(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    """Mark a PM task as done today. Auto-advances last_done and next_due."""
    from datetime import date, timedelta
    scope = await get_mill_scope(current_user, db)
    stmt = select(MaintenanceSchedule).where(MaintenanceSchedule.id == schedule_id)
    if scope.get("mill_id") or scope.get("company_id"):
        stmt = stmt.join(Machine, MaintenanceSchedule.machine_code == Machine.code)
        if scope.get("mill_id"):
            stmt = stmt.where(Machine.mill_id == scope["mill_id"])
        elif scope.get("company_id"):
            stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    today = date.today()
    schedule.last_done = today.isoformat()
    schedule.next_due = (today + timedelta(days=schedule.frequency_days)).isoformat()
    await db.flush()
    await db.commit()
    return schedule


@router.put("/maintenance/schedules/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: str,
    req: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user, db)
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
    await db.commit()
    return schedule


@router.get("/maintenance/parameters")
async def get_parameters(
    machine_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
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
    if len(req.items) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    scope = await get_mill_scope(current_user, db)
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


@router.get("/maintenance/manpower-summary")
async def get_manpower_summary(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    """
    Returns per-department PM manpower utilisation.
    Calculation: sum(task_min_per_day_all_machines) / (manpower * shift_min) * 100
    task_min_per_day = estimated_task_min / frequency_days * machine_count
    Uses TASK_MIN_ESTIMATE based on frequency bucket.
    """
    from datetime import date as dt_date
    SHIFT_MIN = 450  # 7.5 hours
    # Estimated minutes per task visit by frequency bucket
    TASK_EST: dict = {
        30: 20, 60: 25, 90: 30, 120: 35, 180: 45,
        365: 90, 730: 180, 912: 240, 1095: 300, 1460: 360, 1825: 480,
    }

    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")
    if mill_id and role_code == "SUPER_ADMIN":
        effective_mill_id = mill_id

    stmt = select(MaintenanceSchedule).where(MaintenanceSchedule.is_active == True)
    if effective_mill_id or scope.get("company_id"):
        stmt = stmt.join(Machine, MaintenanceSchedule.machine_code == Machine.code)
        if effective_mill_id:
            stmt = stmt.where(Machine.mill_id == effective_mill_id)
        elif scope.get("company_id"):
            stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])

    result = await db.execute(stmt)
    schedules = result.scalars().all()

    today_str = dt_date.today().isoformat()
    dept_data: dict = {}
    for s in schedules:
        dept = s.department or "General"
        if dept not in dept_data:
            dept_data[dept] = {
                "department": dept,
                "manpower": s.manpower_count or 1,
                "machine_count": s.machine_count or 1,
                "task_count": 0,
                "daily_workload_min": 0.0,
                "overdue_count": 0,
                "due_this_week": 0,
                "due_this_month": 0,
            }
        d = dept_data[dept]
        # Use the most recent manpower/machine_count seen
        if s.manpower_count:
            d["manpower"] = s.manpower_count
        if s.machine_count:
            d["machine_count"] = s.machine_count

        freq = s.frequency_days or 30
        machine_count = s.machine_count or 1
        est_min = TASK_EST.get(freq, max(t for t in TASK_EST if t <= freq) if freq > 30 else 20)
        d["daily_workload_min"] += (est_min / freq) * machine_count
        d["task_count"] += 1

        if s.next_due:
            from datetime import timedelta
            nd = s.next_due
            if nd < today_str:
                d["overdue_count"] += 1
            week_end = (dt_date.today() + timedelta(days=7)).isoformat()
            month_end = (dt_date.today() + timedelta(days=30)).isoformat()
            if today_str <= nd <= week_end:
                d["due_this_week"] += 1
            if today_str <= nd <= month_end:
                d["due_this_month"] += 1

    summary = []
    for dept, d in dept_data.items():
        capacity = d["manpower"] * SHIFT_MIN
        utilisation = round((d["daily_workload_min"] / capacity) * 100, 1) if capacity > 0 else 0
        machines_per_person = round(d["machine_count"] / d["manpower"], 1) if d["manpower"] > 0 else 0
        summary.append({
            **d,
            "shift_hrs": 7.5,
            "capacity_min": capacity,
            "utilisation_pct": utilisation,
            "machines_per_person": machines_per_person,
        })
    summary.sort(key=lambda x: x["department"])
    return {"departments": summary, "total_schedules": len(schedules)}


@router.get("/maintenance/page-init")
async def maintenance_page_init(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
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


# ---------------------------------------------------------------------------
# DELETE endpoints
# ---------------------------------------------------------------------------

@router.delete("/maintenance/tasks/{task_id}")
async def delete_maintenance_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    """Soft-delete a maintenance task (sets status=cancelled) with scope check."""
    scope = await get_mill_scope(current_user, db)
    # Join Machine to enforce mill scope (MaintenanceLog uses machine_code, not mill_id)
    stmt = (
        select(MaintenanceLog)
        .join(Machine, MaintenanceLog.machine_code == Machine.code)
        .where(MaintenanceLog.id == task_id)
    )
    if scope.get("mill_id"):
        stmt = stmt.where(Machine.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Maintenance task not found")
    task.status = "cancelled"
    await db.flush()
    await db.commit()
    return {"message": "Maintenance task deleted", "id": task_id}


@router.delete("/maintenance/schedules/{schedule_id}")
async def delete_maintenance_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    """Deactivate a maintenance schedule (is_active=False)."""
    # Schedules use machine_code; SUPER_ADMIN can delete any, others rely on machine scope
    scope = await get_mill_scope(current_user, db)
    stmt = select(MaintenanceSchedule).where(MaintenanceSchedule.id == schedule_id)
    if scope.get("mill_id") or scope.get("company_id"):
        # Validate the schedule's machine is in scope
        stmt = stmt.join(Machine, MaintenanceSchedule.machine_code == Machine.code)
        if scope.get("mill_id"):
            stmt = stmt.where(Machine.mill_id == scope["mill_id"])
        elif scope.get("company_id"):
            stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Maintenance schedule not found")
    schedule.is_active = False
    await db.flush()
    await db.commit()
    return {"message": "Maintenance schedule deleted", "id": schedule_id}


# ---------------------------------------------------------------------------
# DAY-WISE FLOOR PLAN
# ---------------------------------------------------------------------------

@router.get("/maintenance/day-plan")
async def get_day_plan(
    month: Optional[int] = Query(None),   # 1-12
    year: Optional[int] = Query(None),
    section: Optional[str] = Query(None), # filter by department/section
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    """
    Returns a day-wise schedule plan for floor workers.
    For each day of the requested month, lists which PM tasks fall due
    (based on frequency_days + last_done or next_due).
    Groups by section, then by day.
    """
    from datetime import date as dt_date, timedelta
    import calendar as cal_mod

    today = dt_date.today()
    y = year or today.year
    m = month or today.month
    days_in_month = cal_mod.monthrange(y, m)[1]
    month_start = dt_date(y, m, 1)
    month_end = dt_date(y, m, days_in_month)

    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")
    if mill_id and role_code == "SUPER_ADMIN":
        effective_mill_id = mill_id

    # Fetch active schedules
    stmt = select(MaintenanceSchedule).where(MaintenanceSchedule.is_active == True)
    if section:
        stmt = stmt.where(MaintenanceSchedule.department == section)
    if effective_mill_id or scope.get("company_id"):
        stmt = stmt.join(Machine, MaintenanceSchedule.machine_code == Machine.code)
        if effective_mill_id:
            stmt = stmt.where(Machine.mill_id == effective_mill_id)
        elif scope.get("company_id"):
            stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    schedules = result.scalars().all()

    # For each schedule, compute all due dates in the month
    # A task is "due on day D" if next_due falls in that month,
    # or if frequency_days is short enough to recur (weekly/daily)
    day_map: dict[int, list] = {d: [] for d in range(1, days_in_month + 1)}

    for s in schedules:
        freq = s.frequency_days or 30
        # Determine anchor date
        anchor = None
        if s.next_due:
            try:
                anchor = dt_date.fromisoformat(s.next_due)
            except ValueError:
                pass
        if anchor is None:
            if s.last_done:
                try:
                    ld = dt_date.fromisoformat(s.last_done)
                    anchor = ld + timedelta(days=freq)
                except ValueError:
                    pass
        if anchor is None:
            # Default: spread tasks across month based on sl_no
            offset = (s.sl_no or 1) % days_in_month
            anchor = month_start + timedelta(days=offset)

        # Walk forward/back to find all occurrences in month
        # Start from the first occurrence at or before month_start
        if anchor > month_end:
            # next_due is after this month — check if freq allows earlier hit
            diff = (anchor - month_start).days
            steps_back = diff // freq
            anchor = anchor - timedelta(days=steps_back * freq)
        elif anchor < month_start:
            # Move forward to first in-month occurrence
            diff = (month_start - anchor).days
            steps_fwd = (diff + freq - 1) // freq
            anchor = anchor + timedelta(days=steps_fwd * freq)

        # Collect all hits in month
        current = anchor
        while current <= month_end:
            if current >= month_start:
                day = current.day
                # Estimated task duration
                est_min = min(60, max(15, freq // 2)) if freq <= 30 else min(120, max(30, freq // 6))
                day_map[day].append({
                    "id": s.id,
                    "machine_code": s.machine_code,
                    "machine_line_code": s.machine_line_code,
                    "description": s.description,
                    "section": s.department or "General",
                    "frequency_days": freq,
                    "frequency_label": _freq_label(freq),
                    "manpower_needed": s.manpower_count or 1,
                    "machine_count": s.machine_count or 1,
                    "lubricant_name": s.lubricant_name,
                    "lubricant_quantity": s.lubricant_quantity,
                    "last_done": s.last_done,
                    "due_date": current.isoformat(),
                    "est_min": est_min,
                    "is_overdue": current < today,
                    "sl_no": s.sl_no,
                })
            if freq >= 30:
                break  # Only one occurrence per month for monthly+ tasks
            current += timedelta(days=freq)

    # Build day list
    days_out = []
    for day in range(1, days_in_month + 1):
        date_obj = dt_date(y, m, day)
        tasks = day_map[day]
        total_mp = sum(t["manpower_needed"] for t in tasks)
        total_min = sum(t["est_min"] for t in tasks)
        days_out.append({
            "day": day,
            "date": date_obj.isoformat(),
            "weekday": date_obj.strftime("%a"),
            "tasks": sorted(tasks, key=lambda t: (t["section"], t["machine_code"])),
            "total_tasks": len(tasks),
            "total_manpower_needed": total_mp,
            "total_est_min": total_min,
            "load_pct": round((total_min / (total_mp * 450)) * 100, 1) if total_mp > 0 else 0,
        })

    # Section summary for the month
    section_totals: dict = {}
    for day_data in days_out:
        for t in day_data["tasks"]:
            sec = t["section"]
            if sec not in section_totals:
                section_totals[sec] = {"section": sec, "task_days": 0, "total_tasks": 0, "total_manpower_days": 0}
            section_totals[sec]["task_days"] += 1
            section_totals[sec]["total_tasks"] += 1
            section_totals[sec]["total_manpower_days"] += t["manpower_needed"]

    return {
        "year": y,
        "month": m,
        "month_name": dt_date(y, m, 1).strftime("%B %Y"),
        "days_in_month": days_in_month,
        "days": days_out,
        "section_summary": sorted(section_totals.values(), key=lambda x: x["section"]),
        "total_schedule_count": len(schedules),
    }


def _freq_label(days: int) -> str:
    if days <= 1:   return "Daily"
    if days <= 7:   return f"Every {days}d"
    if days <= 14:  return "Fortnightly"
    if days <= 31:  return "Monthly"
    if days <= 92:  return "Quarterly"
    if days <= 186: return "6-Monthly"
    if days <= 366: return "Yearly"
    return f"Every {days//365}Y"


# ---------------------------------------------------------------------------
# PM ENTRY LOG — section-specific maintenance records
# ---------------------------------------------------------------------------

@router.post("/maintenance/entries", status_code=201)
async def create_pm_entry(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    """
    Create one or more PM entry records.
    Accepts: { entries: [...] } or a single entry object.
    entry_type: 'activity' | 'cot_grinding' | 'ac_plant'
    """
    from datetime import date as dt_date

    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")

    raw = payload.get("entries", None)
    if raw is None:
        raw = [payload]

    created = 0
    errors: List[str] = []

    for item in raw:
        try:
            entry = PMEntryLog(
                mill_id=mill_id,
                entry_date=item.get("entry_date") or dt_date.today().isoformat(),
                section=item.get("section", "General"),
                entry_type=item.get("entry_type", "activity"),
                machine_code=item.get("machine_code"),
                machine_line_code=item.get("machine_line_code"),
                activity=item.get("activity"),
                done_by=item.get("done_by"),
                remarks=item.get("remarks"),
                status=item.get("status", "done"),
                data=item.get("data") or {},
            )
            db.add(entry)
            created += 1
        except Exception as exc:
            errors.append(str(exc))

    await db.commit()
    return {"created": created, "errors": errors}


@router.get("/maintenance/entries")
async def list_pm_entries(
    section: Optional[str] = Query(None),
    entry_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    machine_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    """List PM entry logs with filters."""
    scope = await get_mill_scope(current_user, db)
    effective_mill_id = scope.get("mill_id")
    if mill_id and scope.get("role") == "SUPER_ADMIN":
        effective_mill_id = mill_id

    stmt = select(PMEntryLog)
    if effective_mill_id:
        stmt = stmt.where(PMEntryLog.mill_id == effective_mill_id)
    if section:
        stmt = stmt.where(PMEntryLog.section == section)
    if entry_type:
        stmt = stmt.where(PMEntryLog.entry_type == entry_type)
    if date_from:
        stmt = stmt.where(PMEntryLog.entry_date >= date_from)
    if date_to:
        stmt = stmt.where(PMEntryLog.entry_date <= date_to)
    if machine_code:
        stmt = stmt.where(PMEntryLog.machine_code == machine_code)

    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(total_stmt)).scalar() or 0

    stmt = stmt.order_by(PMEntryLog.entry_date.desc(), PMEntryLog.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "data": [
            {
                "id": r.id,
                "entry_date": r.entry_date,
                "section": r.section,
                "entry_type": r.entry_type,
                "machine_code": r.machine_code,
                "machine_line_code": r.machine_line_code,
                "activity": r.activity,
                "done_by": r.done_by,
                "remarks": r.remarks,
                "status": r.status,
                "data": r.data or {},
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.delete("/maintenance/entries/{entry_id}")
async def delete_pm_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(PMEntryLog).where(PMEntryLog.id == entry_id)
    if scope.get("mill_id"):
        stmt = stmt.where(PMEntryLog.mill_id == scope["mill_id"])
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(row)
    await db.commit()
    return {"message": "deleted", "id": entry_id}
