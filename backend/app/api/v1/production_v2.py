"""
Production v2 API: DATALOG stop codes, waste entries, RF manpower, mixing fibre rows.
All endpoints added in SpinFlow v2 (migration 020).
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.masters import Mill
from app.models.production import DowntimeLog
from app.models.production_v2 import (
    DatalogStopCode,
    WasteEntry,
    RFManpowerPlan,
    MixingChangeFibreRow,
)
from app.models.mixing import MixingChangeLog
from app.schemas.production_v2 import (
    DatalogStopCodeOut,
    WasteEntryCreate, WasteEntryBulkCreate, WasteEntryOut,
    RFManpowerCreate, RFManpowerBulkCreate, RFManpowerOut,
    MixingFibreRowCreate, MixingFibreRowOut,
    RF_CATEGORY_LABELS,
)
from app.db.base import generate_uuid

router = APIRouter()
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ #
# Helper                                                               #
# ------------------------------------------------------------------ #

async def _resolve_mill(
    current_user: User,
    db: AsyncSession,
    requested_mill_id: Optional[str] = None,
) -> str:
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    mill_id = scope.get("mill_id")

    if requested_mill_id:
        if role_code == "SUPER_ADMIN":
            mill_id = requested_mill_id
        elif role_code == "MILL_OWNER":
            ok = await db.execute(
                select(Mill).where(
                    Mill.id == requested_mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if ok.scalar_one_or_none():
                mill_id = requested_mill_id

    if not mill_id:
        raise HTTPException(status_code=400, detail="mill_id is required")
    return mill_id


# ================================================================== #
# DATALOG STOP CODES                                                   #
# ================================================================== #

@router.get("/production/datalog-stop-codes")
async def list_stop_codes(
    department: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    """Return all active DATALOG stop codes, optionally filtered by dept or category."""
    try:
        q = select(DatalogStopCode).where(DatalogStopCode.is_active == True).order_by(DatalogStopCode.code)
        rows = (await db.execute(q)).scalars().all()

        result = []
        for r in rows:
            depts = r.departments or []
            # Include if no dept filter, or code applies to all, or explicitly listed
            if department and depts and department not in depts:
                continue
            if category and r.category != category:
                continue
            result.append(DatalogStopCodeOut.model_validate(r).model_dump())

        return {"data": result, "total": len(result)}
    except Exception as e:
        logger.error(f"datalog-stop-codes list error: {e}")
        return {"data": [], "total": 0}


@router.get("/production/datalog-stop-codes/by-department")
async def stop_codes_by_department(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    """Return stop codes grouped: general (all depts) + per-department specific."""
    try:
        rows = (await db.execute(
            select(DatalogStopCode).where(DatalogStopCode.is_active == True).order_by(DatalogStopCode.code)
        )).scalars().all()

        general = []
        by_dept: dict = {}

        for r in rows:
            item = {"code": r.code, "name": r.name, "category": r.category}
            depts = r.departments or []
            if not depts:
                general.append(item)
            else:
                for d in depts:
                    by_dept.setdefault(d, []).append(item)

        return {"general": general, "by_department": by_dept}
    except Exception as e:
        logger.error(f"stop-codes-by-department error: {e}")
        return {"general": [], "by_department": {}}


# ================================================================== #
# WASTE ENTRIES                                                        #
# ================================================================== #

@router.get("/production/waste-entries")
async def list_waste_entries(
    mill_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(WasteEntry).where(WasteEntry.mill_id == effective_mill_id)
    if date:
        q = q.where(WasteEntry.date == date)
    if shift:
        q = q.where(WasteEntry.shift == shift)
    if department:
        q = q.where(WasteEntry.department == department)
    if status:
        q = q.where(WasteEntry.status == status)
    q = q.order_by(WasteEntry.date.desc(), WasteEntry.department, WasteEntry.machine_code)

    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(q.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        pages = (total + page_size - 1) // page_size

        # Daily summary
        summary_q = (
            select(WasteEntry.department, func.sum(WasteEntry.waste_kg).label("total_waste"))
            .where(WasteEntry.mill_id == effective_mill_id)
        )
        if date:
            summary_q = summary_q.where(WasteEntry.date == date)
        if shift:
            summary_q = summary_q.where(WasteEntry.shift == shift)
        summary_q = summary_q.group_by(WasteEntry.department)
        summary_rows = await db.execute(summary_q)
        dept_summary = {r.department: float(r.total_waste or 0) for r in summary_rows}

        return {
            "total": total, "page": page, "page_size": page_size, "pages": pages,
            "dept_summary": dept_summary,
            "data": [WasteEntryOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"waste-entries list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0,
                "dept_summary": {}, "data": []}


@router.post("/production/waste-entries", response_model=WasteEntryOut)
async def create_waste_entry(
    req: WasteEntryCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    entry = WasteEntry(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        entered_by=current_user.name or current_user.email,
        **req.model_dump(),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/production/waste-entries/bulk")
async def create_waste_entries_bulk(
    req: WasteEntryBulkCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    entered_by = current_user.name or current_user.email
    created = 0
    errors: List[str] = []

    for i, item in enumerate(req.entries):
        try:
            entry = WasteEntry(
                id=generate_uuid(),
                mill_id=effective_mill_id,
                date=req.date,
                shift=req.shift,
                department=req.department,
                machine_code=item.machine_code,
                lot_no=item.lot_no,
                ratio=item.ratio,
                target_kg=item.target_kg,
                waste_kg=item.waste_kg,
                remarks=item.remarks,
                operator_name=item.operator_name,
                entered_by=entered_by,
            )
            db.add(entry)
            created += 1
            if i % 50 == 0:
                await db.flush()
        except Exception as e:
            errors.append(f"Row {i+1} ({item.machine_code}): {e}")

    await db.commit()
    return {"created": created, "errors": errors}


@router.patch("/production/waste-entries/{entry_id}/approve", response_model=WasteEntryOut)
async def approve_waste_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    entry = (await db.execute(select(WasteEntry).where(WasteEntry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Waste entry not found")
    entry.status = "approved"
    entry.approved_by = current_user.name or current_user.email
    entry.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)
    return entry


# ================================================================== #
# RF MANPOWER PLAN                                                     #
# ================================================================== #

@router.get("/production/rf-manpower")
async def list_rf_manpower(
    mill_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(RFManpowerPlan).where(RFManpowerPlan.mill_id == effective_mill_id)
    if date:
        q = q.where(RFManpowerPlan.date == date)
    if shift:
        q = q.where(RFManpowerPlan.shift == shift)
    q = q.order_by(RFManpowerPlan.date.desc(), RFManpowerPlan.shift, RFManpowerPlan.category)

    try:
        items = (await db.execute(q)).scalars().all()
        data = [RFManpowerOut.model_validate(i).model_dump() for i in items]

        # Add display label
        for row in data:
            row["category_label"] = RF_CATEGORY_LABELS.get(row["category"], row["category"])

        return {
            "total": len(data),
            "category_labels": RF_CATEGORY_LABELS,
            "data": data,
        }
    except Exception as e:
        logger.error(f"rf-manpower list error: {e}")
        return {"total": 0, "category_labels": RF_CATEGORY_LABELS, "data": []}


@router.post("/production/rf-manpower/bulk")
async def upsert_rf_manpower_bulk(
    req: RFManpowerBulkCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    upserted = 0
    errors: List[str] = []

    for row in req.rows:
        try:
            existing = (
                await db.execute(
                    select(RFManpowerPlan).where(
                        RFManpowerPlan.mill_id == effective_mill_id,
                        RFManpowerPlan.date == req.date,
                        RFManpowerPlan.shift == req.shift,
                        RFManpowerPlan.category == row.category,
                        RFManpowerPlan.mc_id_from == row.mc_id_from,
                    )
                )
            ).scalar_one_or_none()

            if existing:
                existing.headcount = row.headcount
                existing.total_machines = row.total_machines
                existing.mc_id_to = row.mc_id_to
                existing.supervisor = row.supervisor
            else:
                db.add(RFManpowerPlan(
                    id=generate_uuid(),
                    mill_id=effective_mill_id,
                    date=req.date,
                    shift=req.shift,
                    category=row.category,
                    mc_id_from=row.mc_id_from,
                    mc_id_to=row.mc_id_to,
                    total_machines=row.total_machines,
                    headcount=row.headcount,
                    supervisor=row.supervisor,
                    remarks=row.remarks,
                ))
            upserted += 1
        except Exception as e:
            errors.append(f"{row.category}: {e}")

    await db.commit()
    return {"upserted": upserted, "errors": errors}


# ================================================================== #
# MIXING CHANGE FIBRE ROWS                                             #
# ================================================================== #

@router.get("/mixing/change-log/{change_log_id}/fibre-rows")
async def list_fibre_rows(
    change_log_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    rows = (await db.execute(
        select(MixingChangeFibreRow)
        .where(MixingChangeFibreRow.change_log_id == change_log_id)
        .order_by(MixingChangeFibreRow.fibre_type)
    )).scalars().all()
    return {"data": [MixingFibreRowOut.model_validate(r).model_dump() for r in rows]}


@router.post("/mixing/change-log/{change_log_id}/fibre-rows")
async def set_fibre_rows(
    change_log_id: str,
    rows: List[MixingFibreRowCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    """Replace all fibre rows for a change log entry (idempotent)."""
    change_log = (await db.execute(
        select(MixingChangeLog).where(MixingChangeLog.id == change_log_id)
    )).scalar_one_or_none()
    if not change_log:
        raise HTTPException(status_code=404, detail="Mixing change log not found")

    # Delete existing rows first
    existing = (await db.execute(
        select(MixingChangeFibreRow).where(MixingChangeFibreRow.change_log_id == change_log_id)
    )).scalars().all()
    for r in existing:
        await db.delete(r)
    await db.flush()

    new_rows = []
    for r in rows:
        row = MixingChangeFibreRow(
            id=generate_uuid(),
            change_log_id=change_log_id,
            fibre_type=r.fibre_type,
            present_lot=r.present_lot,
            proposed_lot=r.proposed_lot,
            remarks=r.remarks,
        )
        db.add(row)
        new_rows.append(row)

    await db.commit()
    for row in new_rows:
        await db.refresh(row)
    return {"data": [MixingFibreRowOut.model_validate(r).model_dump() for r in new_rows]}


# ================================================================== #
# ENHANCED DOWNTIME — accept DATALOG code                             #
# ================================================================== #

@router.post("/production/downtime/datalog")
async def log_downtime_from_datalog(
    body: dict,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    """
    Log a stoppage using a DATALOG numeric code.
    Accepts: machine_code, datalog_code, stop_from (HH:MM), stop_to (HH:MM),
             date, shift, production_loss_kg, remarks
    Auto-maps datalog_code → stop_type category.
    """
    machine_code = body.get("machine_code")
    datalog_code = body.get("datalog_code")
    if not machine_code:
        raise HTTPException(status_code=400, detail="machine_code required")
    if datalog_code is None:
        raise HTTPException(status_code=400, detail="datalog_code required")

    try:
        # Lookup stop code
        stop_code_row = (await db.execute(
            select(DatalogStopCode).where(DatalogStopCode.code == int(datalog_code))
        )).scalar_one_or_none()

        stop_type = stop_code_row.category if stop_code_row else "misc"
        code_name = stop_code_row.name if stop_code_row else str(datalog_code)

        # Resolve mill
        resolved_mill_id = await _resolve_mill(current_user, db, mill_id)

        # Parse times
        stop_from_str: Optional[str] = body.get("stop_from")
        stop_to_str: Optional[str] = body.get("stop_to")
        date_str: str = body.get("date", "")

        started_at = datetime.now(timezone.utc)
        ended_at = None
        duration_min = 0

        if date_str and stop_from_str:
            try:
                started_at = datetime.fromisoformat(f"{date_str}T{stop_from_str}:00+00:00")
            except ValueError:
                logger.warning("Could not parse stop_from time: %s %s", date_str, stop_from_str)
        if date_str and stop_to_str:
            try:
                ended_at = datetime.fromisoformat(f"{date_str}T{stop_to_str}:00+00:00")
                duration_min = max(0, int((ended_at - started_at).total_seconds() / 60))
            except ValueError:
                logger.warning("Could not parse stop_to time: %s %s", date_str, stop_to_str)

        # Verify machine exists (avoids FK violation 500)
        from app.models.production import Machine
        machine = (await db.execute(
            select(Machine).where(Machine.code == machine_code, Machine.mill_id == resolved_mill_id)
        )).scalar_one_or_none()
        if not machine:
            raise HTTPException(
                status_code=400,
                detail=f"Machine '{machine_code}' not found in this mill. Select a valid machine."
            )

        new_id = generate_uuid()
        log = DowntimeLog(
            id=new_id,
            machine_code=machine_code,
            reason=f"[{datalog_code}] {code_name}",
            started_at=started_at,
            ended_at=ended_at,
            duration_min=duration_min,
            resolved=ended_at is not None,
            reported_by=current_user.name or current_user.email,
            stop_type=stop_type,
            production_loss_kg=float(body.get("production_loss_kg", 0)),
            datalog_code=int(datalog_code),
            mill_id=resolved_mill_id,
            stop_from=stop_from_str,
            stop_to=stop_to_str,
        )
        db.add(log)
        await db.commit()
        # Return from local variables — avoids refresh decode issues on TIME columns
        return {
            "id": new_id,
            "machine_code": machine_code,
            "datalog_code": int(datalog_code),
            "code_name": code_name,
            "stop_type": stop_type,
            "duration_min": duration_min,
            "production_loss_kg": float(body.get("production_loss_kg", 0)),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"log_downtime_from_datalog error: {exc!r} | body={body}")
        raise HTTPException(status_code=400, detail=f"Failed to log stoppage: {exc}")


# ================================================================== #
# PAGE INIT — returns all lookups in one call                         #
# ================================================================== #

@router.get("/production/v2/page-init")
async def production_v2_page_init(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    """
    One request returns everything the frontend needs to render production forms:
    - departments with machine codes
    - shift list
    - DATALOG stop codes (grouped)
    - RF category labels
    """
    from app.models.masters import Department
    from app.models.production import Shift, Machine

    effective_mill_id = await _resolve_mill(current_user, db, mill_id)

    result: dict = {}

    # Departments
    try:
        dept_rows = (await db.execute(
            select(Department.id, Department.name, Department.code)
            .where(Department.mill_id == effective_mill_id, Department.is_active == True)
            .order_by(Department.name)
        )).all()
        result["departments"] = [
            {"id": r.id, "name": r.name, "code": r.code} for r in dept_rows
        ]
    except Exception as e:
        logger.error(f"page-init departments: {e}")
        result["departments"] = []

    # Shifts
    try:
        shift_rows = (await db.execute(
            select(Shift.id, Shift.code, Shift.name, Shift.start_time, Shift.end_time)
            .where(Shift.mill_id == effective_mill_id)
            .order_by(Shift.code)
        )).all()
        result["shifts"] = [
            {"id": r.id, "code": r.code, "name": r.name,
             "start_time": r.start_time, "end_time": r.end_time}
            for r in shift_rows
        ]
    except Exception as e:
        logger.error(f"page-init shifts: {e}")
        result["shifts"] = []

    # Machines grouped by department
    try:
        mc_rows = (await db.execute(
            select(Machine.code, Machine.name, Machine.department, Machine.department_id,
                   Machine.line_code, Machine.machine_number, Machine.spindles)
            .where(Machine.mill_id == effective_mill_id, Machine.status == True)
            .order_by(Machine.department, Machine.code)
        )).all()
        machines_by_dept: dict = {}
        for r in mc_rows:
            dept_key = r.department or "Unknown"
            machines_by_dept.setdefault(dept_key, []).append({
                "code": r.code, "name": r.name,
                "line_code": r.line_code, "machine_number": r.machine_number,
                "spindles": r.spindles,
            })
        result["machines_by_dept"] = machines_by_dept
    except Exception as e:
        logger.error(f"page-init machines: {e}")
        result["machines_by_dept"] = {}

    # DATALOG stop codes
    try:
        sc_rows = (await db.execute(
            select(DatalogStopCode)
            .where(DatalogStopCode.is_active == True)
            .order_by(DatalogStopCode.code)
        )).scalars().all()
        result["stop_codes"] = [
            {"code": r.code, "name": r.name, "category": r.category, "departments": r.departments}
            for r in sc_rows
        ]
    except Exception as e:
        logger.error(f"page-init stop_codes: {e}")
        result["stop_codes"] = []

    result["rf_category_labels"] = RF_CATEGORY_LABELS
    return result
