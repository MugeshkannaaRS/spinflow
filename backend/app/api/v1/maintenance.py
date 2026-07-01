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
from app.models.maintenance import MaintenanceLog, MaintenanceSchedule, Technician, MachineParameter, PMEntryLog, PMActivityConfig, MillCalendar, MaintenanceDeptManpower, MaintenanceDeptMap
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


@router.patch("/maintenance/schedules/{schedule_id}", response_model=ScheduleOut)
async def patch_schedule(
    schedule_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    """Row-wise edit of a PM schedule — accepts any subset of editable fields
    (lubricant, qty, manpower, machine count, department, dates, etc.). Only the
    keys present in the payload are updated."""
    scope = await get_mill_scope(current_user, db)
    stmt = select(MaintenanceSchedule).where(MaintenanceSchedule.id == schedule_id)
    if scope.get("mill_id"):
        stmt = stmt.where(MaintenanceSchedule.mill_id == scope["mill_id"])
    schedule = (await db.execute(stmt)).scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    def _int(v):
        try:
            return int(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    def _float(v):
        try:
            return float(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    def _str(v, n):
        return (str(v).strip()[:n] if v not in (None, "") else None)

    # str fields (clip to column length)
    str_fields = {
        "machine_code": 50, "description": None, "department": 100,
        "lubricant_name": 200, "lubricant_quantity": 100, "machine_line_code": 100,
        "last_done": 10, "next_due": 10, "last_grinding_date": 10, "type": 50,
    }
    for f, ln in str_fields.items():
        if f in payload:
            setattr(schedule, f, str(payload[f]).strip()[: (ln or 10_000)] if payload[f] not in (None, "") else None)
    for f in ("frequency_days", "manpower_count", "machine_count", "sl_no", "grinding_freq_days"):
        if f in payload:
            setattr(schedule, f, _int(payload[f]))
    for f in ("opening_dia_mm", "current_dia_mm"):
        if f in payload:
            setattr(schedule, f, _float(payload[f]))
    if "is_active" in payload:
        v = payload["is_active"]
        schedule.is_active = v if isinstance(v, bool) else str(v).lower() in ("1", "true", "yes")
    # frequency label -> resolve to days if frequency_days not explicitly given
    if "frequency" in payload and "frequency_days" not in payload:
        fd = _parse_freq(str(payload.get("frequency") or ""))
        if fd:
            schedule.frequency_days = fd

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

    # Count the REAL machines per department from the Machines master, so the
    # displayed machine count reflects actual machines (e.g. 35 Ring Frames),
    # not whatever a schedule row happened to carry. Uses normalized name match
    # + the mill dept-map, same as the Day Plan.
    import re as _re2
    def _n2(v): return _re2.sub(r"[^a-z0-9]", "", (v or "").lower())
    real_machine_count: dict = {}
    try:
        mstmt2 = select(Machine.department)
        if effective_mill_id:
            mstmt2 = mstmt2.where(Machine.mill_id == effective_mill_id)
        mdepts = [r[0] for r in (await db.execute(mstmt2)).all() if r[0]]
        # count machines per normalized machine-department
        norm_counts: dict = {}
        for md in mdepts:
            norm_counts[_n2(md)] = norm_counts.get(_n2(md), 0) + 1
        # dept map: schedule dept -> [machine dept]
        dmap: dict = {}
        dmst = select(MaintenanceDeptMap)
        if effective_mill_id:
            dmst = dmst.where(
                (MaintenanceDeptMap.mill_id == effective_mill_id)
                | (MaintenanceDeptMap.mill_id.is_(None))
            )
        for dm in (await db.execute(dmst)).scalars().all():
            dmap.setdefault((dm.schedule_dept or "").strip().lower(), []).append(dm.machine_dept)
        # resolve a real count for each schedule department
        for dept in list(dept_data.keys()):
            n = _n2(dept)
            cnt = 0
            mapped = dmap.get(dept.strip().lower())
            if mapped:
                for md in mapped:
                    cnt += norm_counts.get(_n2(md), 0)
            else:
                for nd, c in norm_counts.items():
                    if nd == n or nd.startswith(n) or n.startswith(nd):
                        cnt += c
            if cnt > 0:
                real_machine_count[dept] = cnt
    except Exception as e:
        logger.error(f"manpower-summary real machine count error: {e}")

    # Per-department manpower overrides (persons/machines/shift-hours/leader/notes).
    # Overrides WIN over schedule-derived values, and can add departments that
    # have no schedules yet.
    overrides: dict = {}
    try:
        ostmt = select(MaintenanceDeptManpower)
        if effective_mill_id:
            ostmt = ostmt.where(
                (MaintenanceDeptManpower.mill_id == effective_mill_id)
                | (MaintenanceDeptManpower.mill_id.is_(None))
            )
        for o in (await db.execute(ostmt)).scalars().all():
            overrides[o.department] = o
    except Exception as e:
        logger.error(f"manpower-summary overrides fetch error: {e}")

    # Ensure override-only departments still appear
    for dept, o in overrides.items():
        if dept not in dept_data:
            dept_data[dept] = {
                "department": dept, "manpower": 1, "machine_count": 1, "task_count": 0,
                "daily_workload_min": 0.0, "overdue_count": 0, "due_this_week": 0, "due_this_month": 0,
            }

    summary = []
    for dept, d in dept_data.items():
        o = overrides.get(dept)
        manpower = (o.persons if o and o.persons else None) or d["manpower"]
        # machine count precedence: explicit override > real machines from master > schedule value
        machine_count = (o.machines if o and o.machines else None) or real_machine_count.get(dept) or d["machine_count"]
        shift_hrs = (o.shift_hours if o and o.shift_hours else None) or 7.5
        shift_min = shift_hrs * 60
        capacity = manpower * shift_min
        utilisation = round((d["daily_workload_min"] / capacity) * 100, 1) if capacity > 0 else 0
        machines_per_person = round(machine_count / manpower, 1) if manpower > 0 else 0
        summary.append({
            **d,
            "manpower": manpower,
            "machine_count": machine_count,
            "shift_hrs": shift_hrs,
            "capacity_min": round(capacity),
            "utilisation_pct": utilisation,
            "machines_per_person": machines_per_person,
            "leader": o.leader if o else None,
            "notes": o.notes if o else None,
            "is_overridden": o is not None,
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

    # Fetch the REAL machines for this mill from the Machines master, so tasks
    # show actual machine numbers/codes instead of a fabricated range. Group by
    # department (lowercased) and also index by exact machine code.
    machines_by_dept: dict = {}
    machines_by_code: dict = {}
    try:
        mstmt = select(
            Machine.code, Machine.name, Machine.machine_number,
            Machine.line_code, Machine.department, Machine.machine_type,
        )
        if effective_mill_id:
            mstmt = mstmt.where(Machine.mill_id == effective_mill_id)
        for mrow in (await db.execute(mstmt)).all():
            code, name, mno, lcode, mdept, mtype = mrow
            label = mno or lcode or code  # prefer real machine number, then line code, then code
            entry = {"code": code, "label": label, "name": name}
            for key in filter(None, [ (mdept or "").strip().lower(), (mtype or "").strip().lower() ]):
                machines_by_dept.setdefault(key, []).append(entry)
            if code:
                machines_by_code[code.strip().lower()] = entry
    except Exception as e:
        logger.error(f"day-plan machines fetch error: {e}")

    import re as _re

    def _norm(v: str) -> str:
        return _re.sub(r"[^a-z0-9]", "", (v or "").lower())

    # Build a normalized department index so "Blow Room" ~ "Blowroom",
    # "Ring Frame" ~ "Ringframe" etc. match without hardcoding each variant.
    machines_by_norm_dept: dict = {}
    for dept_key, entries in machines_by_dept.items():
        machines_by_norm_dept.setdefault(_norm(dept_key), []).extend(entries)

    # Mill-editable department mapping: {schedule_dept(lower) -> [machine_dept, ...]}
    dept_map: dict = {}
    try:
        dmstmt = select(MaintenanceDeptMap)
        if effective_mill_id:
            dmstmt = dmstmt.where(
                (MaintenanceDeptMap.mill_id == effective_mill_id)
                | (MaintenanceDeptMap.mill_id.is_(None))
            )
        for dm in (await db.execute(dmstmt)).scalars().all():
            dept_map.setdefault((dm.schedule_dept or "").strip().lower(), []).append(dm.machine_dept)
    except Exception as e:
        logger.error(f"day-plan dept-map fetch error: {e}")

    def _machines_for(schedule) -> list:
        """Real machine labels for a schedule, resolved from the Machines master.
        Order: exact machine code → exact/normalized department → normalized
        prefix (e.g. 'Blowroom' matches 'Blow Room-A'). [] if none registered."""
        seen = set()

        def _uniq(entries):
            out = []
            for e in entries:
                if e["label"] not in seen:
                    seen.add(e["label"])
                    out.append(e["label"])
            return out

        mc = (schedule.machine_code or "").strip().lower()
        if mc in machines_by_code:
            return [machines_by_code[mc]["label"]]

        # 1) Explicit mill mapping wins: schedule dept -> machine dept(s)
        sdept = (schedule.department or "").strip().lower()
        if sdept in dept_map:
            mapped = []
            for md in dept_map[sdept]:
                mapped.extend(machines_by_norm_dept.get(_norm(md), []))
            if mapped:
                return _uniq(mapped)

        # 2) Fall back to normalized name matching
        candidates = [c for c in [schedule.department, schedule.machine_code] if c]
        for cand in candidates:
            ncand = _norm(cand)
            if not ncand:
                continue
            # Gather ALL machine departments that match this candidate — exact
            # OR prefix either way (so 'Blowroom' picks up 'Blow Room',
            # 'Blow Room-A' and 'Blow Room-B' together).
            matched = []
            for ndept, entries in machines_by_norm_dept.items():
                if ndept == ncand or ndept.startswith(ncand) or ncand.startswith(ndept):
                    matched.extend(entries)
            if matched:
                return _uniq(matched)
        return []

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

    SHIFT_MIN = 450  # 7.5h per person (used as the per-person daily minutes base)

    # ---- Per-department manpower + shift (override wins, else schedule value) ----
    dept_manpower: dict = {}
    try:
        omp = select(MaintenanceDeptManpower)
        if effective_mill_id:
            omp = omp.where(
                (MaintenanceDeptManpower.mill_id == effective_mill_id)
                | (MaintenanceDeptManpower.mill_id.is_(None))
            )
        for o in (await db.execute(omp)).scalars().all():
            dept_manpower[o.department] = {
                "persons": o.persons or None,
                "shift_min": (o.shift_hours * 60) if o.shift_hours else None,
            }
    except Exception as e:
        logger.error(f"day-plan dept manpower fetch error: {e}")
    for s in schedules:
        d = s.department or "General"
        if s.manpower_count and d not in dept_manpower:
            dept_manpower.setdefault(d, {})["persons"] = s.manpower_count

    def _dept_persons(dept: str) -> int:
        info = dept_manpower.get(dept) or {}
        return info.get("persons") or 1

    def _dept_shift_min(dept: str) -> float:
        info = dept_manpower.get(dept) or {}
        return info.get("shift_min") or SHIFT_MIN

    def _per_machine_min(freq: int) -> int:
        return min(60, max(15, freq // 2)) if freq <= 30 else min(120, max(30, freq // 6))

    # ---- Phase 1: collect task occurrences (each is N machine-work-units) ----
    # occ = dict with schedule fields + due_day + machines list + per_machine_min
    occ_by_dept: dict = {}
    for s in schedules:
        try:
            machine_labels = _machines_for(s)
            try:
                freq = int(s.frequency_days) if s.frequency_days else 30
            except (TypeError, ValueError):
                freq = 30
            if freq <= 0:
                freq = 30
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
                offset = (s.sl_no or 1) % days_in_month
                anchor = month_start + timedelta(days=offset)
            if anchor > month_end:
                diff = (anchor - month_start).days
                anchor = anchor - timedelta(days=(diff // freq) * freq)
            elif anchor < month_start:
                diff = (month_start - anchor).days
                anchor = anchor + timedelta(days=((diff + freq - 1) // freq) * freq)

            # units = one per real machine, else machine_count placeholder units
            n_units = len(machine_labels) if machine_labels else (s.machine_count or 1)
            unit_labels = machine_labels if machine_labels else [s.machine_code] * n_units

            dept = s.department or "General"
            current = anchor
            while current <= month_end:
                if current >= month_start:
                    due_day = current.day
                    placed_day = due_day if due_day not in non_working else _next_working_day(due_day)
                    if placed_day is not None:
                        occ_by_dept.setdefault(dept, []).append({
                            "sched": s, "freq": freq, "due_day": placed_day,
                            "original_due": current.isoformat(),
                            "shifted": placed_day != due_day,
                            "units": list(unit_labels),
                            "per_min": _per_machine_min(freq),
                            "machines_registered": len(machine_labels),
                        })
                if freq >= 30:
                    break
                current += timedelta(days=freq)
        except Exception as row_err:
            logger.error(f"maintenance.day-plan occ error id={getattr(s, 'id', '?')}: {row_err}")
            continue

    # ---- Phase 2: distribute each department's work across working days by capacity ----
    from collections import deque, defaultdict
    day_map: dict[int, list] = {d: [] for d in range(1, days_in_month + 1)}

    def _day_capacity(dept: str, day: int) -> float:
        if day in non_working:
            return 0.0
        persons = _dept_persons(dept)
        shift_min = _dept_shift_min(dept)
        iso = dt_date(y, m, day).isoformat()
        factor, on_leave = 1.0, 0
        if iso in holiday_map:
            dtp, on_leave, _n = holiday_map[iso]
            if dtp == "half_day":
                factor = 0.5
        return max(0, persons - (on_leave or 0)) * shift_min * factor

    for dept, occ_list in occ_by_dept.items():
        due_by_day: dict = defaultdict(list)
        for occ in occ_list:
            due_by_day[occ["due_day"]].append(occ)
        backlog: deque = deque()  # (machine_label, per_min, occ)
        for day in range(1, days_in_month + 1):
            # release occurrences due today into the backlog
            for occ in due_by_day.get(day, []):
                for mac in occ["units"]:
                    backlog.append((mac, occ["per_min"], occ))
            remaining = _day_capacity(dept, day)
            if remaining <= 0:
                continue  # holiday/weekly-off: work carries forward
            # fill day up to capacity (FIFO); stop when the next unit no longer fits
            day_assign: dict = defaultdict(list)  # id(occ) -> [machine labels]
            occ_ref: dict = {}
            while backlog and remaining >= backlog[0][1]:
                mac, pmin, occ = backlog.popleft()
                day_assign[id(occ)].append(mac)
                occ_ref[id(occ)] = occ
                remaining -= pmin
            # build one task entry per occurrence assigned today
            for oid, macs in day_assign.items():
                occ = occ_ref[oid]
                s = occ["sched"]
                placed_date = dt_date(y, m, day)
                day_map[day].append({
                    "id": f"{s.id}-{day}",
                    "machine_code": s.machine_code,
                    "machine_line_code": s.machine_line_code,
                    "description": s.description,
                    "section": s.department or "General",
                    "frequency_days": occ["freq"],
                    "frequency_label": _freq_label(occ["freq"]),
                    "manpower_needed": _dept_persons(dept),
                    "machine_count": len(macs),
                    "machines": macs,                       # only the machines done THIS day
                    "machines_registered": occ["machines_registered"],
                    "total_machines": len(occ["units"]),    # full count for the task occurrence
                    "lubricant_name": s.lubricant_name,
                    "lubricant_quantity": s.lubricant_quantity,
                    "last_done": s.last_done,
                    "due_date": placed_date.isoformat(),
                    "original_due": occ["original_due"],
                    "shifted": occ["shifted"],
                    "est_min": len(macs) * occ["per_min"],   # real work minutes for this day's machines
                    "per_machine_min": occ["per_min"],
                    "is_overdue": placed_date < today,
                    "sl_no": s.sl_no,
                })
        # anything still in backlog spilled past month end — it continues next month.

    # Base manpower for the whole-department capacity readouts on each day.
    base_manpower = sum(_dept_persons(d) for d in occ_by_dept.keys()) or 1

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


# ---------------------------------------------------------------------------
# DEPARTMENT MANPOWER OVERRIDES (Manpower Plan — edit/add persons/machines/etc.)
# ---------------------------------------------------------------------------

@router.get("/maintenance/dept-manpower")
async def list_dept_manpower(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    scope = await get_mill_scope(current_user, db)
    effective_mill_id = scope.get("mill_id")
    if mill_id and scope.get("role") == "SUPER_ADMIN":
        effective_mill_id = mill_id
    stmt = select(MaintenanceDeptManpower)
    if effective_mill_id:
        stmt = stmt.where(
            (MaintenanceDeptManpower.mill_id == effective_mill_id)
            | (MaintenanceDeptManpower.mill_id.is_(None))
        )
    try:
        rows = (await db.execute(stmt.order_by(MaintenanceDeptManpower.department))).scalars().all()
    except Exception as e:
        logger.error(f"dept-manpower list error: {e}")
        rows = []
    return {
        "data": [
            {
                "id": r.id, "department": r.department, "persons": r.persons,
                "machines": r.machines, "shift_hours": r.shift_hours,
                "leader": r.leader, "notes": r.notes,
            }
            for r in rows
        ]
    }


@router.post("/maintenance/dept-manpower")
async def upsert_dept_manpower(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    """Create or update the manpower override for a department (unique per mill+dept)."""
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    dept = str(payload.get("department") or "").strip()
    if not dept:
        raise HTTPException(400, detail="department is required")

    def _int(v):
        try:
            return int(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    def _float(v):
        try:
            return float(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    stmt = select(MaintenanceDeptManpower).where(MaintenanceDeptManpower.department == dept)
    if mill_id:
        stmt = stmt.where(MaintenanceDeptManpower.mill_id == mill_id)
    row = (await db.execute(stmt)).scalar_one_or_none()

    if row:
        if "persons" in payload: row.persons = _int(payload.get("persons"))
        if "machines" in payload: row.machines = _int(payload.get("machines"))
        if "shift_hours" in payload: row.shift_hours = _float(payload.get("shift_hours"))
        if "leader" in payload: row.leader = payload.get("leader")
        if "notes" in payload: row.notes = payload.get("notes")
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = MaintenanceDeptManpower(
            mill_id=mill_id, department=dept,
            persons=_int(payload.get("persons")),
            machines=_int(payload.get("machines")),
            shift_hours=_float(payload.get("shift_hours")),
            leader=payload.get("leader"),
            notes=payload.get("notes"),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(row)
    await db.commit()
    return {"id": row.id, "department": row.department, "persons": row.persons,
            "machines": row.machines, "shift_hours": row.shift_hours,
            "leader": row.leader, "notes": row.notes}


@router.delete("/maintenance/dept-manpower/{item_id}")
async def delete_dept_manpower(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(MaintenanceDeptManpower).where(MaintenanceDeptManpower.id == item_id)
    if scope.get("mill_id"):
        stmt = stmt.where(MaintenanceDeptManpower.mill_id == scope["mill_id"])
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        raise HTTPException(404, detail="Not found")
    await db.delete(row)
    await db.commit()
    return {"message": "deleted", "id": item_id}


# ---------------------------------------------------------------------------
# DEPARTMENT MAPPING (schedule dept -> machine-master dept) for real machines
# ---------------------------------------------------------------------------

@router.get("/maintenance/dept-map")
async def get_dept_map(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    """Returns the dept mappings, plus the distinct schedule + machine
    departments in the system so the UI can offer dropdowns."""
    scope = await get_mill_scope(current_user, db)
    effective_mill_id = scope.get("mill_id")

    mstmt = select(MaintenanceDeptMap)
    if effective_mill_id:
        mstmt = mstmt.where(
            (MaintenanceDeptMap.mill_id == effective_mill_id)
            | (MaintenanceDeptMap.mill_id.is_(None))
        )
    try:
        maps = (await db.execute(mstmt.order_by(MaintenanceDeptMap.schedule_dept))).scalars().all()
    except Exception as e:
        logger.error(f"dept-map list error: {e}")
        maps = []

    # distinct schedule departments
    sstmt = select(MaintenanceSchedule.department).distinct()
    if effective_mill_id:
        sstmt = sstmt.where(
            (MaintenanceSchedule.mill_id == effective_mill_id)
            | (MaintenanceSchedule.mill_id.is_(None))
        )
    sched_depts = sorted({r[0] for r in (await db.execute(sstmt)).all() if r[0]})

    # distinct machine departments
    dstmt = select(Machine.department).distinct()
    if effective_mill_id:
        dstmt = dstmt.where(Machine.mill_id == effective_mill_id)
    machine_depts = sorted({r[0] for r in (await db.execute(dstmt)).all() if r[0]})

    return {
        "data": [
            {"id": m.id, "schedule_dept": m.schedule_dept, "machine_dept": m.machine_dept}
            for m in maps
        ],
        "schedule_departments": sched_depts,
        "machine_departments": machine_depts,
    }


@router.post("/maintenance/dept-map")
async def add_dept_map(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    sched = str(payload.get("schedule_dept") or "").strip()
    machine = str(payload.get("machine_dept") or "").strip()
    if not sched or not machine:
        raise HTTPException(400, detail="schedule_dept and machine_dept are required")
    # avoid duplicate pairing
    stmt = select(MaintenanceDeptMap).where(
        MaintenanceDeptMap.schedule_dept == sched,
        MaintenanceDeptMap.machine_dept == machine,
    )
    if mill_id:
        stmt = stmt.where(MaintenanceDeptMap.mill_id == mill_id)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return {"id": existing.id, "schedule_dept": sched, "machine_dept": machine}
    row = MaintenanceDeptMap(
        mill_id=mill_id, schedule_dept=sched, machine_dept=machine,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await db.commit()
    return {"id": row.id, "schedule_dept": sched, "machine_dept": machine}


@router.delete("/maintenance/dept-map/{item_id}")
async def delete_dept_map(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(MaintenanceDeptMap).where(MaintenanceDeptMap.id == item_id)
    if scope.get("mill_id"):
        stmt = stmt.where(MaintenanceDeptMap.mill_id == scope["mill_id"])
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        raise HTTPException(404, detail="Not found")
    await db.delete(row)
    await db.commit()
    return {"message": "deleted", "id": item_id}
