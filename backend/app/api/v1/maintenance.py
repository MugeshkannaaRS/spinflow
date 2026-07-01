import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, insert
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone
import time
import uuid as _uuid

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.maintenance import MaintenanceLog, MaintenanceSchedule, Technician, MachineParameter, PMEntryLog, PMActivityConfig, MillCalendar
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

    # Use mill_id directly on the schedule for scoping — avoids dependency on machines table.
    # Single-mill ERP: also include rows with NULL mill_id (legacy/imported rows
    # whose mill wasn't set) so they're not invisible.
    stmt = select(MaintenanceSchedule)
    if effective_mill_id:
        stmt = stmt.where(
            (MaintenanceSchedule.mill_id == effective_mill_id)
            | (MaintenanceSchedule.mill_id.is_(None))
        )
    try:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        items = result.scalars().all()
        # Serialize row-by-row so a single bad row can't blank the whole list.
        data = []
        for item in items:
            try:
                data.append(ScheduleOut.model_validate(item).model_dump())
            except Exception as row_err:
                logger.error(f"maintenance.schedules serialize error id={getattr(item, 'id', '?')}: {row_err}")
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": data,
        }
    except Exception as e:
        logger.error(f"maintenance.schedules list error: {e}", exc_info=True)
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
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    if len(req.items) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    # Resolve the mill the rows belong to. CRITICAL: this must match how the
    # GET /schedules endpoint scopes reads, otherwise imported rows are stored
    # under one mill_id and the list filters by another → "imported but empty".
    effective_mill_id = scope.get("mill_id")
    # Honor an explicit ?mill_id= from the UI (the schedules list passes it),
    # validating it belongs to the user's company for non-super-admins.
    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        else:
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id
    # Fall back to the company's mill if scope didn't yield one (e.g. a
    # company-level owner account whose user.mill_id is unset).
    if not effective_mill_id and current_user.company_id:
        first_mill = await db.execute(
            select(Mill).where(Mill.company_id == current_user.company_id).limit(1)
        )
        m = first_mill.scalar_one_or_none()
        if m:
            effective_mill_id = str(m.id)
    mill_id = effective_mill_id
    created = 0
    skipped = 0
    errors: List[str] = []

    def _trim(val, length):
        """Coerce to str and clip to the column length to avoid DB overflow."""
        if val is None:
            return None
        s = str(val).strip()
        return s[:length] if s else None

    def _as_int(val):
        """Best-effort int coercion; returns None on anything non-numeric."""
        if val is None or val == "":
            return None
        try:
            return int(float(str(val).replace(",", "").strip()))
        except (TypeError, ValueError):
            return None

    def _as_float(val):
        if val is None or val == "":
            return None
        try:
            return float(str(val).replace(",", "").strip())
        except (TypeError, ValueError):
            return None

    # NOTE: we deliberately do NOT validate each machine_code against the
    # machines table. Validation here is "soft" (failures were ignored), but
    # doing it per-row meant one SELECT per row — 200+ round-trips to the DB,
    # which timed out the request. Machine codes are imported as-is; unknown
    # codes simply won't join to a machine until that machine is created.

    def _row(item) -> Optional[dict]:
        if not item.machine_code or not item.task_description:
            return None
        freq_days = _as_int(getattr(item, "frequency_days", None))
        if not freq_days:
            freq_days = _parse_freq(item.frequency or "")
        description = item.task_description
        if item.technician_name:
            description = f"{description} | Technician: {item.technician_name}"
        return {
            "id": str(_uuid.uuid4()),
            "mill_id": mill_id,
            "machine_code": _trim(item.machine_code, 50),
            "type": "preventive",
            "frequency_days": freq_days,
            "description": description,
            "last_done": _trim(item.last_done_date, 10),
            "next_due": _trim(item.next_due_date, 10),
            "is_active": True,
            "department": _trim(item.department, 100),
            "lubricant_name": _trim(item.lubricant_name, 200),
            "lubricant_quantity": _trim(item.lubricant_quantity, 100),
            "manpower_count": _as_int(item.manpower_count),
            "machine_count": _as_int(item.machine_count),
            "sl_no": _as_int(item.sl_no),
            "machine_line_code": _trim(item.machine_line_code, 100),
            "opening_dia_mm": _as_float(item.opening_dia_mm),
            "current_dia_mm": _as_float(item.current_dia_mm),
            "grinding_freq_days": _as_int(item.grinding_freq_days),
            "last_grinding_date": _trim(item.last_grinding_date, 10),
        }

    # Build all rows in memory (no DB calls).
    t0 = time.monotonic()
    rows: List[dict] = []
    for item in req.items:
        try:
            r = _row(item)
        except Exception as exc:
            errors.append(f"{getattr(item, 'machine_code', '?')}: {str(exc)[:200]}")
            skipped += 1
            continue
        if r is None:
            errors.append("Row missing machine_code or task_description")
            skipped += 1
        else:
            rows.append(r)

    if not rows:
        return BulkResponse(created=created, skipped=skipped, errors=errors)

    # Single bulk INSERT — one round-trip for the whole batch (SQLAlchemy core).
    # This is dramatically faster than per-object ORM flushes on a pooled
    # connection and avoids the request-level timeout seen with row-by-row work.
    try:
        await db.execute(insert(MaintenanceSchedule), rows)
        await db.commit()
        created = len(rows)
        logger.info(
            f"maintenance.schedules.bulk inserted {created} rows in "
            f"{time.monotonic() - t0:.2f}s (mill={mill_id})"
        )
    except Exception as exc:
        await db.rollback()
        logger.error(f"maintenance.schedules.bulk insert failed: {exc}")
        raise HTTPException(500, detail=f"Bulk insert failed: {str(exc)[:200]}")

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
    if scope.get("mill_id"):
        stmt = stmt.where(MaintenanceSchedule.mill_id == scope["mill_id"])
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
    stmt = select(MaintenanceSchedule).where(MaintenanceSchedule.id == schedule_id)
    if scope.get("mill_id"):
        stmt = stmt.where(MaintenanceSchedule.mill_id == scope["mill_id"])
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
    if effective_mill_id:
        stmt = stmt.where(
            (MaintenanceSchedule.mill_id == effective_mill_id)
            | (MaintenanceSchedule.mill_id.is_(None))
        )

    try:
        result = await db.execute(stmt)
        schedules = result.scalars().all()
    except Exception as e:
        logger.error(f"maintenance.manpower-summary query error: {e}", exc_info=True)
        return {"departments": [], "total_schedules": 0}

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

        try:
            freq = int(s.frequency_days) if s.frequency_days else 30
        except (TypeError, ValueError):
            freq = 30
        if freq <= 0:
            freq = 30
        machine_count = s.machine_count or 1
        # Estimated minutes for this frequency bucket. Guard the max() so an
        # unusual freq can never operate on an empty sequence (→ 500): fall back
        # to the nearest lower bucket's estimate, or 20 if none.
        if freq in TASK_EST:
            est_min = TASK_EST[freq]
        else:
            lower_keys = [t for t in TASK_EST if t <= freq]
            est_min = TASK_EST[max(lower_keys)] if lower_keys else 20
        d["daily_workload_min"] += (est_min / freq) * machine_count
        d["task_count"] += 1

        if s.next_due:
            from datetime import timedelta
            nd = str(s.next_due)
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
    if scope.get("mill_id"):
        stmt = stmt.where(MaintenanceSchedule.mill_id == scope["mill_id"])
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

    # Fetch active schedules — scope by mill_id directly (no machines JOIN needed)
    stmt = select(MaintenanceSchedule).where(MaintenanceSchedule.is_active == True)
    if section:
        stmt = stmt.where(MaintenanceSchedule.department == section)
    if effective_mill_id:
        stmt = stmt.where(
            (MaintenanceSchedule.mill_id == effective_mill_id)
            | (MaintenanceSchedule.mill_id.is_(None))
        )
    result = await db.execute(stmt)
    schedules = result.scalars().all()

    # Fetch the mill calendar: specific-date entries for this month + weekly-off rules.
    holiday_map: dict = {}          # date_iso -> (day_type, persons_on_leave, note)
    weekly_off_days: set = set()    # weekday ints (0=Mon..6=Sun) that are recurring off
    try:
        cstmt = select(MillCalendar)
        if effective_mill_id:
            cstmt = cstmt.where(
                (MillCalendar.mill_id == effective_mill_id)
                | (MillCalendar.mill_id.is_(None))
            )
        for h in (await db.execute(cstmt)).scalars().all():
            if h.date == "WEEKLY" and h.weekly_off is not None:
                weekly_off_days.add(int(h.weekly_off))
            elif h.date.startswith(f"{y}-{m:02d}-"):
                holiday_map[h.date] = (h.day_type, h.persons_on_leave or 0, h.note)
    except Exception as e:
        logger.error(f"day-plan calendar fetch error: {e}")

    # Determine which days in this month are NON-WORKING (holiday or weekly-off).
    # Half-days stay working (reduced capacity); an explicit 'working' entry
    # overrides a weekly-off. Tasks that fall on a non-working day are carried
    # forward to the next working day — the frequency/recurrence never changes.
    non_working: set = set()
    for dd in range(1, days_in_month + 1):
        d_iso = dt_date(y, m, dd).isoformat()
        wd = dt_date(y, m, dd).weekday()
        if d_iso in holiday_map:
            dtp = holiday_map[d_iso][0]
            if dtp == "holiday":
                non_working.add(dd)
            # 'working' / 'half_day' → stays a working day
        elif wd in weekly_off_days:
            non_working.add(dd)

    def _next_working_day(dd: int) -> Optional[int]:
        """Next working day-of-month at/after dd, or None if it spills past month end."""
        cur = dd
        while cur <= days_in_month:
            if cur not in non_working:
                return cur
            cur += 1
        return None

    # For each schedule, compute all due dates in the month
    # A task is "due on day D" if next_due falls in that month,
    # or if frequency_days is short enough to recur (weekly/daily)
    day_map: dict[int, list] = {d: [] for d in range(1, days_in_month + 1)}

    for s in schedules:
        try:
            try:
                freq = int(s.frequency_days) if s.frequency_days else 30
            except (TypeError, ValueError):
                freq = 30
            if freq <= 0:
                freq = 30
            # Determine anchor date
            anchor = None
            if s.next_due:
                try:
                    anchor = dt_date.fromisoformat(str(s.next_due))
                except ValueError:
                    pass
            if anchor is None and s.last_done:
                try:
                    ld = dt_date.fromisoformat(str(s.last_done))
                    anchor = ld + timedelta(days=freq)
                except ValueError:
                    pass
            if anchor is None:
                # Default: spread tasks across month based on sl_no
                offset = (s.sl_no or 1) % days_in_month
                anchor = month_start + timedelta(days=offset)

            # Walk forward/back to find the first occurrence at/before month_start
            if anchor > month_end:
                diff = (anchor - month_start).days
                steps_back = diff // freq
                anchor = anchor - timedelta(days=steps_back * freq)
            elif anchor < month_start:
                diff = (month_start - anchor).days
                steps_fwd = (diff + freq - 1) // freq
                anchor = anchor + timedelta(days=steps_fwd * freq)

            # Collect all hits in month
            current = anchor
            while current <= month_end:
                if current >= month_start:
                    due_day = current.day
                    # If the due day is a non-working day (holiday / weekly-off),
                    # carry the task forward to the next working day. Frequency is
                    # unchanged — only the execution date shifts.
                    placed_day = due_day if due_day not in non_working else _next_working_day(due_day)
                    if placed_day is not None:
                        shifted = placed_day != due_day
                        placed_date = dt_date(y, m, placed_day)
                        est_min = min(60, max(15, freq // 2)) if freq <= 30 else min(120, max(30, freq // 6))
                        day_map[placed_day].append({
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
                            "due_date": placed_date.isoformat(),
                            "original_due": current.isoformat(),
                            "shifted": shifted,
                            "est_min": est_min,
                            "is_overdue": placed_date < today,
                            "sl_no": s.sl_no,
                        })
                if freq >= 30:
                    break  # Only one occurrence per month for monthly+ tasks
                current += timedelta(days=freq)
        except Exception as row_err:
            logger.error(f"maintenance.day-plan skip schedule id={getattr(s, 'id', '?')}: {row_err}")
            continue

    # Total maintenance manpower available on a normal working day (sum of the
    # distinct per-department manpower). Used to compute capacity per day.
    base_manpower = 0
    seen_dept = {}
    for s in schedules:
        d = s.department or "General"
        if s.manpower_count and d not in seen_dept:
            seen_dept[d] = s.manpower_count
    base_manpower = sum(seen_dept.values()) or 1
    SHIFT_MIN = 450  # 7.5h per person

    # Build day list
    days_out = []
    for day in range(1, days_in_month + 1):
        date_obj = dt_date(y, m, day)
        date_iso = date_obj.isoformat()
        tasks = day_map[day]
        total_mp = sum(t["manpower_needed"] for t in tasks)
        total_min = sum(t["est_min"] for t in tasks)

        # Capacity adjustment from the mill calendar.
        # Priority: specific-date entry > weekly-off rule > normal working day.
        day_type, on_leave, holiday_note = "working", 0, None
        if date_iso in holiday_map:
            day_type, on_leave, holiday_note = holiday_map[date_iso]
        elif date_obj.weekday() in weekly_off_days:
            day_type, holiday_note = "holiday", "Weekly off"
        avail_persons = max(0, base_manpower - (on_leave or 0))
        capacity_factor = 0.0 if day_type == "holiday" else (0.5 if day_type == "half_day" else 1.0)
        avail_min = avail_persons * SHIFT_MIN * capacity_factor
        # Load = required minutes / available minutes
        load_pct = round((total_min / avail_min) * 100, 1) if avail_min > 0 else (100.0 if total_min > 0 else 0)
        overloaded = avail_min > 0 and total_min > avail_min
        is_holiday = day_type == "holiday"

        days_out.append({
            "day": day,
            "date": date_iso,
            "weekday": date_obj.strftime("%a"),
            "tasks": sorted(tasks, key=lambda t: (t["section"], t["machine_code"])),
            "total_tasks": len(tasks),
            "total_manpower_needed": total_mp,
            "total_est_min": total_min,
            "load_pct": load_pct,
            # capacity / calendar info
            "day_type": day_type,
            "is_holiday": is_holiday,
            "persons_on_leave": on_leave or 0,
            "available_persons": avail_persons,
            "available_min": round(avail_min),
            "overloaded": overloaded,
            "holiday_note": holiday_note,
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

    try:
        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(total_stmt)).scalar() or 0
    except Exception:
        total = 0

    stmt = stmt.order_by(PMEntryLog.entry_date.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    try:
        rows = (await db.execute(stmt)).scalars().all()
    except Exception:
        rows = []

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


# ---------------------------------------------------------------------------
# PM ACTIVITY CONFIG — editable per-section activity lists
# ---------------------------------------------------------------------------

@router.get("/maintenance/activity-config")
async def get_activity_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    """Return all section activity configs."""
    rows = (await db.execute(select(PMActivityConfig).order_by(PMActivityConfig.section))).scalars().all()
    return {
        "data": [
            {
                "id": r.id,
                "section": r.section,
                "entry_type": r.entry_type,
                "activities": r.activities or [],
                "ac_units": r.ac_units or [],
                "notes": r.notes,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


@router.put("/maintenance/activity-config/{section}")
async def upsert_activity_config(
    section: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    """Create or update activity config for a section."""
    from datetime import datetime as dt
    stmt = select(PMActivityConfig).where(PMActivityConfig.section == section)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row:
        row.entry_type = payload.get("entry_type", row.entry_type)
        row.activities = payload.get("activities", row.activities)
        row.ac_units = payload.get("ac_units", row.ac_units)
        row.notes = payload.get("notes", row.notes)
        row.updated_at = dt.now(timezone.utc)
    else:
        row = PMActivityConfig(
            section=section,
            entry_type=payload.get("entry_type", "activity"),
            activities=payload.get("activities", []),
            ac_units=payload.get("ac_units", []),
            notes=payload.get("notes"),
            updated_at=dt.now(timezone.utc),
        )
        db.add(row)
    await db.commit()
    return {
        "section": row.section,
        "entry_type": row.entry_type,
        "activities": row.activities or [],
        "ac_units": row.ac_units or [],
    }


# ---------------------------------------------------------------------------
# HOLIDAY CALENDAR — mill-customizable holidays / half-days / leave counts
# ---------------------------------------------------------------------------

@router.get("/maintenance/holidays")
async def list_holidays(
    year: Optional[int] = Query(None),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    """List holiday-calendar entries for the mill (optionally a single year)."""
    scope = await get_mill_scope(current_user, db)
    effective_mill_id = scope.get("mill_id")
    if mill_id and scope.get("role") == "SUPER_ADMIN":
        effective_mill_id = mill_id

    stmt = select(MillCalendar)
    if effective_mill_id:
        stmt = stmt.where(
            (MillCalendar.mill_id == effective_mill_id)
            | (MillCalendar.mill_id.is_(None))
        )
    if year:
        stmt = stmt.where(MillCalendar.date.like(f"{year}-%"))
    try:
        rows = (await db.execute(stmt.order_by(MillCalendar.date))).scalars().all()
    except Exception as e:
        logger.error(f"maintenance.holidays list error: {e}")
        rows = []
    return {
        "data": [
            {
                "id": r.id,
                "date": r.date,
                "day_type": r.day_type,
                "persons_on_leave": r.persons_on_leave or 0,
                "weekly_off": r.weekly_off,
                "note": r.note,
            }
            for r in rows
        ]
    }


@router.post("/maintenance/holidays")
async def upsert_holiday(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    """Create or update a holiday-calendar entry (unique per mill_id + date)."""
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    date_str = str(payload.get("date") or "").strip()
    if not date_str:
        raise HTTPException(400, detail="date is required (YYYY-MM-DD)")

    stmt = select(MillCalendar).where(MillCalendar.date == date_str)
    if mill_id:
        stmt = stmt.where(MillCalendar.mill_id == mill_id)
    row = (await db.execute(stmt)).scalar_one_or_none()

    def _as_int(v):
        try:
            return int(v) if v not in (None, "") else 0
        except (TypeError, ValueError):
            return 0

    def _opt_int(v):
        try:
            return int(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    weekly_off = _opt_int(payload.get("weekly_off"))

    if row:
        row.day_type = payload.get("day_type", row.day_type)
        row.persons_on_leave = _as_int(payload.get("persons_on_leave", row.persons_on_leave))
        row.weekly_off = weekly_off if "weekly_off" in payload else row.weekly_off
        row.note = payload.get("note", row.note)
    else:
        row = MillCalendar(
            mill_id=mill_id,
            date=date_str,
            day_type=payload.get("day_type", "holiday"),
            persons_on_leave=_as_int(payload.get("persons_on_leave")),
            weekly_off=weekly_off,
            note=payload.get("note"),
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)
    await db.commit()
    return {"id": row.id, "date": row.date, "day_type": row.day_type,
            "persons_on_leave": row.persons_on_leave or 0, "weekly_off": row.weekly_off, "note": row.note}


@router.delete("/maintenance/holidays/{holiday_id}")
async def delete_holiday(
    holiday_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(MillCalendar).where(MillCalendar.id == holiday_id)
    if scope.get("mill_id"):
        stmt = stmt.where(MillCalendar.mill_id == scope["mill_id"])
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        raise HTTPException(404, detail="Holiday entry not found")
    await db.delete(row)
    await db.commit()
    return {"message": "deleted", "id": holiday_id}
