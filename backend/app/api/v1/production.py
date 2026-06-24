import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Any, Dict

from sqlalchemy import select, func, cast, Integer, nullslast
from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.production import Machine, Shift, ProductionEntry, DowntimeLog, OperatorGroup, MachineGroup
from app.models.masters import Mill, Department, YarnCount
from app.models.mill_config import MillCustomField, MillRecordValue
from app.schemas.production import (
    MachineCreate, MachineResponse, ProductionEntryResponse, ProductionEntryCreate,
    DowntimeResponse, DowntimeCreate, ShiftCreate, ShiftOut,
    ProductionBulkCreate, ProductionBulkResponse,
    OperatorGroupCreate, OperatorGroupUpdate, OperatorGroupResponse,
    MachineGroupCreate, MachineGroupUpdate, MachineGroupResponse,
)
from app.services.production_service import ProductionService

router = APIRouter()
MAX_BATCH = 500


@router.get("/production/machines")
async def get_machines(
    department: Optional[str] = Query(None),
    department_id: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    operator_group_id: Optional[str] = Query(None),
    machine_group_id: Optional[str] = Query(None),
    machine_group_ids: Optional[str] = Query(None),  # comma-sep IDs for multi-group
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
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
    if department_id:
        # Preferred: filter by UUID — exact, case-insensitive, no string issues
        query = query.where(Machine.department_id == department_id)
    elif department and department not in ("all", ""):
        # Fallback: lookup dept by name (case-insensitive)
        dept_res = await db.execute(
            select(Department.id).where(
                Machine.mill_id == effective_mill_id,
                func.lower(func.trim(Department.name)) == func.lower(department.strip()),
                Department.mill_id == effective_mill_id,
            )
        )
        dept_id_found = dept_res.scalar_one_or_none()
        if dept_id_found:
            query = query.where(Machine.department_id == dept_id_found)
        else:
            # Partial fallback: filter by department string column
            query = query.where(Machine.department.ilike(f"%{department.strip()}%"))
    if section and section not in ("all", ""):
        query = query.where(Machine.section == section)
    if operator_group_id:
        grp_stmt = select(OperatorGroup).where(OperatorGroup.id == operator_group_id)
        grp = (await db.execute(grp_stmt)).scalar_one_or_none()
        if grp and grp.machine_codes:
            query = query.where(Machine.code.in_(grp.machine_codes))
        else:
            query = query.where(Machine.id == "no-match")
    elif machine_group_ids or machine_group_id:
        # Machine Groups: support single ID (machine_group_id) or multi (machine_group_ids csv)
        from sqlalchemy import or_
        raw_ids = []
        if machine_group_ids:
            raw_ids = [x.strip() for x in machine_group_ids.split(",") if x.strip()]
        if machine_group_id and machine_group_id not in raw_ids:
            raw_ids.append(machine_group_id)
        if raw_ids:
            grps_res = await db.execute(
                select(MachineGroup).where(MachineGroup.id.in_(raw_ids))
            )
            grps = grps_res.scalars().all()
            all_codes: list = []
            for g in grps:
                if g.machine_codes:
                    all_codes.extend(g.machine_codes)
            if all_codes:
                query = query.where(Machine.code.in_(all_codes))
            else:
                query = query.where(Machine.id == "no-match")
        else:
            query = query.where(Machine.id == "no-match")
    # Order by global serial_no (cast String→Int so 1,2,3 not 1,10,11,2)
    query = query.order_by(nullslast(cast(Machine.serial_no, Integer).asc()), Machine.created_at.asc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0

        # Fetch custom field definitions for this mill's machines
        custom_field_defs: list = []
        custom_lookup: dict = {}
        if effective_mill_id:
            cf_defs_result = await db.execute(
                select(MillCustomField)
                .where(
                    MillCustomField.mill_id == effective_mill_id,
                    MillCustomField.module == "machines",
                )
                .order_by(MillCustomField.sequence, MillCustomField.field_label)
            )
            cf_defs = cf_defs_result.scalars().all()
            custom_field_defs = [
                {
                    "field_key": cf.field_key,
                    "field_label": cf.field_label,
                    "field_type": cf.field_type,
                }
                for cf in cf_defs
            ]

            # Fetch custom values for these machines
            if cf_defs and items:
                machine_ids = [str(m.id) for m in items]
                cv_result = await db.execute(
                    select(MillRecordValue)
                    .where(
                        MillRecordValue.mill_id == effective_mill_id,
                        MillRecordValue.module == "machines",
                        MillRecordValue.record_id.in_(machine_ids),
                    )
                )
                for cv in cv_result.scalars().all():
                    custom_lookup.setdefault(cv.record_id, {})[cv.field_key] = \
                        cv.value_text or cv.value_number or cv.value_date

        data = []
        for item in items:
            item_dict = MachineResponse.model_validate(item).model_dump()
            item_dict["custom_fields"] = custom_lookup.get(str(item.id), {})
            data.append(item_dict)

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "data": data,
            "custom_field_definitions": custom_field_defs,
        }
    except Exception as e:
        logger.error(f"production.machines list error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve machines")


@router.get("/production/machines/sections")
async def get_machine_sections(
    department_id: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    """Return distinct Machine.section values for a mill+dept — used to populate Line/Group chips."""
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(Mill.id == mill_id, Mill.company_id == current_user.company_id)
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    stmt = select(Machine.section).where(
        Machine.status == True,
        Machine.section.isnot(None),
        Machine.section != "",
    )
    if effective_mill_id:
        stmt = stmt.where(Machine.mill_id == effective_mill_id)
    elif scope.get("company_id"):
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if department_id:
        stmt = stmt.where(Machine.department_id == department_id)
    elif department and department not in ("all", ""):
        stmt = stmt.where(Machine.department.ilike(f"%{department.strip()}%"))

    stmt = stmt.distinct().order_by(Machine.section)
    try:
        result = await db.execute(stmt)
        sections = [row[0] for row in result.all() if row[0]]
        return {"sections": sections}
    except Exception as e:
        logger.error(f"production.machines.sections error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve machine sections")


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
    await db.commit()
    return machine


@router.get("/production/shifts")
async def get_shifts(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters")),
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
        logger.error(f"production.shifts list error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve shifts")


@router.post("/production/shifts", response_model=ShiftOut)
async def create_shift(
    req: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    shift = Shift(**req.model_dump())

    mill_id = scope.get("mill_id")

    # MILL_OWNER has mill_id=None in scope — resolve to their first mill
    if not mill_id and scope.get("company_id"):
        r = await db.execute(
            select(Mill).where(Mill.company_id == scope["company_id"]).limit(1)
        )
        first_mill = r.scalar_one_or_none()
        if first_mill:
            mill_id = str(first_mill.id)

    if not mill_id:
        raise HTTPException(status_code=400, detail="Cannot determine mill — assign a mill to your account")

    shift.mill_id = mill_id
    db.add(shift)
    await db.flush()
    await db.commit()
    await db.refresh(shift)
    return shift


@router.patch("/production/shifts/{shift_id}", response_model=ShiftOut)
async def update_shift(
    shift_id: str,
    req: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    r = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = r.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift.code = req.code
    shift.name = req.name
    shift.start_time = req.start_time
    shift.end_time = req.end_time

    await db.flush()
    await db.commit()
    await db.refresh(shift)
    return shift


@router.delete("/production/shifts/{shift_id}", status_code=204)
async def delete_shift(
    shift_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    q = select(Shift).where(Shift.id == shift_id)
    if mill_id:
        q = q.where(Shift.mill_id == mill_id)
    row = (await db.execute(q)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Shift not found")
    await db.delete(row)
    await db.commit()


@router.get("/production/entries")
async def get_entries(
    date: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    machine: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
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
    elif date_from or date_to:
        if date_from:
            query = query.where(ProductionEntry.date >= date_from)
        if date_to:
            query = query.where(ProductionEntry.date <= date_to)
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
        logger.error(f"production.entries list error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve production entries")


@router.post("/production/entries", response_model=ProductionEntryResponse)
async def create_entry(
    req: ProductionEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    svc = ProductionService(db, current_user)
    result = await svc.create_entry(req)

    # W4B: Check production thresholds and fire alerts
    try:
        from app.services.alert_service import check_production_thresholds
        from app.core.deps import get_mill_scope
        scope = await get_mill_scope(current_user, db)
        company_id = scope.get("company_id") or str(current_user.company_id or "")
        mill_id = scope.get("mill_id")
        entry_id = result.get("id") if isinstance(result, dict) else getattr(result, "id", None)
        if company_id and entry_id:
            produced = float(req.produced_kg or 0)
            waste = float(req.waste_kg or 0)
            await check_production_thresholds(
                db,
                company_id=company_id,
                mill_id=mill_id or "",
                entry_id=str(entry_id),
                machine_code=req.machine_code or "",
                produced_kg=produced,
                waste_kg=waste,
                shift=getattr(req, "shift", None),
            )
            await db.commit()
    except Exception as _ae:
        logger.warning("Production threshold check failed (non-fatal): %s", _ae)

    return result


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


@router.post("/production/entries/bulk-cancel")
async def bulk_cancel_entries(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    """Hard-delete up to 100 entries. No status restriction."""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(400, detail="No entry IDs provided")
    if len(ids) > 100:
        raise HTTPException(400, detail="Maximum 100 entries per bulk delete")
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")

    stmt = select(ProductionEntry).where(ProductionEntry.id.in_(ids))
    if mill_id:
        stmt = stmt.where(ProductionEntry.mill_id == mill_id)
    entries = (await db.execute(stmt)).scalars().all()

    deleted = 0
    for entry in entries:
        await db.delete(entry)
        deleted += 1
    await db.commit()
    return {"deleted": deleted}


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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
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

    if date_from:
        try:
            from datetime import datetime as _dt
            query = query.where(DowntimeLog.started_at >= _dt.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            from datetime import datetime as _dt, timedelta as _td
            end = _dt.fromisoformat(date_to) + _td(days=1)
            query = query.where(DowntimeLog.started_at < end)
        except ValueError:
            pass

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
        logger.error(f"production.downtime list error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve downtime logs")


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


@router.delete("/production/downtime/{downtime_id}", status_code=204)
async def delete_downtime(
    downtime_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    stmt = select(DowntimeLog).where(DowntimeLog.id == downtime_id)
    result = await db.execute(stmt)
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Downtime log not found")
    # Scope check — non-super admins must own the mill
    if role_code != "SUPER_ADMIN":
        machine_result = await db.execute(select(Machine).where(Machine.code == log.machine_code))
        machine = machine_result.scalar_one_or_none()
        effective_mill_id = scope.get("mill_id")
        company_id = scope.get("company_id")
        if machine and effective_mill_id and str(machine.mill_id) != str(effective_mill_id):
            raise HTTPException(status_code=403, detail="Not authorised to delete this record")
        if machine and company_id and not effective_mill_id:
            mill_result = await db.execute(select(Mill).where(Mill.id == machine.mill_id, Mill.company_id == company_id))
            if not mill_result.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="Not authorised to delete this record")
    await db.delete(log)
    await db.commit()


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
    new_status = body.get("status", "")
    result = await svc.update_machine_status(machine_id, new_status)

    # W4B: Fire CRITICAL alert when machine breaks down
    if new_status == "breakdown":
        try:
            from app.services.alert_service import create_alert
            from app.core.deps import get_mill_scope
            scope = await get_mill_scope(current_user, db)
            company_id = scope.get("company_id") or str(current_user.company_id or "")
            mill_id = scope.get("mill_id")
            machine = (await db.execute(select(Machine).where(Machine.id == machine_id))).scalar_one_or_none()
            machine_code = machine.code if machine else machine_id
            reason = body.get("reason", "Not specified")
            if company_id:
                await create_alert(
                    db,
                    company_id=company_id,
                    mill_id=mill_id,
                    source_type="machine",
                    source_id=machine_id,
                    source_data={"machine_code": machine_code, "reason": reason},
                    title=f"Machine Breakdown: {machine_code}",
                    message=f"Machine {machine_code} reported as broken down. Reason: {reason}",
                    severity="CRITICAL",
                    category="MACHINE",
                    target_role="SUPERVISOR",
                    escalation_delay_minutes=15,
                )
                await db.commit()
        except Exception as _ae:
            logger.warning("Breakdown alert failed (non-fatal): %s", _ae)

    return result


@router.delete("/production/machines/{machine_id}")
async def delete_machine(
    machine_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    """Hard-delete a machine. Fails if the machine has production entries."""
    machine = (await db.execute(select(Machine).where(Machine.id == machine_id))).scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    # Safety: check for any production entries referencing this machine code
    entry_count = (await db.execute(
        select(func.count()).select_from(ProductionEntry).where(ProductionEntry.machine_code == machine.code)
    )).scalar() or 0
    if entry_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete — machine {machine.code} has {entry_count} production entries. Deactivate instead.",
        )
    await db.delete(machine)
    await db.commit()
    return {"deleted": True, "machine_code": machine.code}


@router.patch("/production/entries/{entry_id}")
async def update_entry(
    entry_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    """Edit a production entry. Allowed fields: produced_kg, waste_kg, count, operator, remarks."""
    entry = (await db.execute(select(ProductionEntry).where(ProductionEntry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    allowed = {"produced_kg", "waste_kg", "count", "operator", "remarks", "stoppage_mins", "stoppage_reason"}
    for k, v in body.items():
        if k in allowed:
            setattr(entry, k, v)
    await db.commit()
    await db.refresh(entry)
    return ProductionEntryResponse.model_validate(entry).model_dump()


@router.delete("/production/entries/{entry_id}")
async def delete_production_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    """Hard-delete a production entry. No status restriction."""
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    # ProductionEntry has no mill_id column — scope through Machine join
    stmt = select(ProductionEntry).where(ProductionEntry.id == entry_id)
    if mill_id:
        stmt = stmt.join(Machine, ProductionEntry.machine_code == Machine.code).where(Machine.mill_id == mill_id)
    entry = (await db.execute(stmt)).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
    return {"ok": True, "id": entry_id}


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
        logger.error(f"production.page-init departments error: {e}", exc_info=True)
        result["departments"] = []
    try:
        shift_rows = await db.execute(select(Shift.id, Shift.code, Shift.name, Shift.start_time, Shift.end_time).order_by(Shift.code))
        result["shifts"] = [{"id": r.id, "code": r.code, "name": r.name, "start_time": r.start_time, "end_time": r.end_time} for r in shift_rows]
    except Exception as e:
        logger.error(f"production.page-init shifts error: {e}", exc_info=True)
        result["shifts"] = []
    try:
        yc_query = select(YarnCount.id, YarnCount.count, YarnCount.blend).where(YarnCount.is_active == True)
        if effective_mill_id:
            yc_query = yc_query.where(YarnCount.mill_id == effective_mill_id)
        yc_rows = await db.execute(yc_query.order_by(YarnCount.count))
        result["yarn_counts"] = [{"id": r.id, "count": r.count, "blend": r.blend} for r in yc_rows]
    except Exception as e:
        logger.error(f"production.page-init yarn_counts error: {e}", exc_info=True)
        result["yarn_counts"] = []
    return result


# ── Operator Groups ────────────────────────────────────────────────────────────

@router.get("/production/operator-groups", response_model=List[OperatorGroupResponse])
async def list_operator_groups(
    mill_id: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    from sqlalchemy import or_
    scope = await get_mill_scope(current_user, db)
    effective_mill_id = mill_id or scope.get("mill_id")
    stmt = select(OperatorGroup)
    if effective_mill_id:
        # Include groups for this mill OR legacy groups with no mill_id (created by MILL_OWNER before fix)
        stmt = stmt.where(
            or_(OperatorGroup.mill_id == effective_mill_id, OperatorGroup.mill_id == None)
        )
    if active_only:
        stmt = stmt.where(OperatorGroup.is_active == True)
    stmt = stmt.order_by(OperatorGroup.name)
    rows = (await db.execute(stmt)).scalars().all()
    return [OperatorGroupResponse.model_validate(r) for r in rows]


@router.post("/production/operator-groups", response_model=OperatorGroupResponse)
async def create_operator_group(
    body: OperatorGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    # Prefer scope mill_id; fall back to body.mill_id (MILL_OWNER passes active mill)
    mill_id = scope.get("mill_id") or body.mill_id
    group = OperatorGroup(
        mill_id=mill_id,
        name=body.name,
        emp_id=body.emp_id,
        machine_codes=body.machine_codes or [],
        is_active=body.is_active,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return OperatorGroupResponse.model_validate(group)


@router.put("/production/operator-groups/{group_id}", response_model=OperatorGroupResponse)
async def update_operator_group(
    group_id: str,
    body: OperatorGroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    stmt = select(OperatorGroup).where(OperatorGroup.id == group_id)
    if mill_id:
        stmt = stmt.where(OperatorGroup.mill_id == mill_id)
    group = (await db.execute(stmt)).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Operator group not found")
    if body.name is not None:
        group.name = body.name
    if body.emp_id is not None:
        group.emp_id = body.emp_id
    if body.machine_codes is not None:
        group.machine_codes = body.machine_codes
    if body.is_active is not None:
        group.is_active = body.is_active
    await db.commit()
    await db.refresh(group)
    return OperatorGroupResponse.model_validate(group)


@router.delete("/production/operator-groups/{group_id}", status_code=204)
async def delete_operator_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    stmt = select(OperatorGroup).where(OperatorGroup.id == group_id)
    if mill_id:
        stmt = stmt.where(OperatorGroup.mill_id == mill_id)
    group = (await db.execute(stmt)).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Operator group not found")
    await db.delete(group)
    await db.commit()


# ── Machine Groups ─────────────────────────────────────────────────────────────

@router.get("/production/machine-groups", response_model=List[MachineGroupResponse])
async def list_machine_groups(
    mill_id: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    from sqlalchemy import or_
    scope = await get_mill_scope(current_user, db)
    effective_mill_id = mill_id or scope.get("mill_id")
    stmt = select(MachineGroup)
    if effective_mill_id:
        stmt = stmt.where(
            or_(MachineGroup.mill_id == effective_mill_id, MachineGroup.mill_id == None)
        )
    if active_only:
        stmt = stmt.where(MachineGroup.is_active == True)
    stmt = stmt.order_by(MachineGroup.name)
    rows = (await db.execute(stmt)).scalars().all()
    return [MachineGroupResponse.model_validate(r) for r in rows]


@router.post("/production/machine-groups", response_model=MachineGroupResponse)
async def create_machine_group(
    body: MachineGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id") or body.mill_id
    group = MachineGroup(
        mill_id=mill_id,
        name=body.name,
        description=body.description,
        machine_codes=body.machine_codes or [],
        is_active=body.is_active,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return MachineGroupResponse.model_validate(group)


@router.put("/production/machine-groups/{group_id}", response_model=MachineGroupResponse)
async def update_machine_group(
    group_id: str,
    body: MachineGroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    stmt = select(MachineGroup).where(MachineGroup.id == group_id)
    if mill_id:
        stmt = stmt.where(MachineGroup.mill_id == mill_id)
    group = (await db.execute(stmt)).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Machine group not found")
    if body.name is not None:
        group.name = body.name
    if body.description is not None:
        group.description = body.description
    if body.machine_codes is not None:
        group.machine_codes = body.machine_codes
    if body.is_active is not None:
        group.is_active = body.is_active
    await db.commit()
    await db.refresh(group)
    return MachineGroupResponse.model_validate(group)


@router.delete("/production/machine-groups/{group_id}", status_code=204)
async def delete_machine_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    stmt = select(MachineGroup).where(MachineGroup.id == group_id)
    if mill_id:
        stmt = stmt.where(MachineGroup.mill_id == mill_id)
    group = (await db.execute(stmt)).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Machine group not found")
    await db.delete(group)
    await db.commit()


# ─── Learner Allocation ────────────────────────────────────────────────────────

from app.models.production import LearnerAllocation, LearnerAllocationEntry
from sqlalchemy.orm import selectinload
from datetime import date as date_type


@router.post("/production/learner-allocation", status_code=201)
async def create_learner_allocation(
    body: dict,
    current_user: User = Depends(require_module("production", write=True)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new learner allocation sheet for a shift."""
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    company_id = scope.get("company_id")
    if not mill_id:
        raise HTTPException(status_code=400, detail="Mill scope required")

    alloc = LearnerAllocation(
        mill_id=mill_id,
        company_id=company_id,
        allocation_date=date_type.fromisoformat(body["allocation_date"]),
        shift=body["shift"],
        allocation_type=body.get("allocation_type"),
        total_persons=body.get("total_persons"),
        notes=body.get("notes"),
        submitted_by=current_user.id,
    )
    db.add(alloc)
    await db.flush()  # get alloc.id

    entries_data = body.get("entries", [])
    for i, e in enumerate(entries_data):
        if not e.get("machine_no") and not e.get("card_no_a") and not e.get("sub_label"):
            continue  # skip fully blank rows
        entry = LearnerAllocationEntry(
            allocation_id=alloc.id,
            section=e["section"],
            machine_no=e.get("machine_no"),
            card_no_a=e.get("card_no_a"),
            card_no_b=e.get("card_no_b"),
            sub_label=e.get("sub_label"),
            display_order=e.get("display_order", i),
        )
        db.add(entry)

    await db.commit()
    return {"success": True, "id": alloc.id}


@router.get("/production/learner-allocations")
async def list_learner_allocations(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    shift: Optional[str] = None,
    page: int = 1,
    page_size: int = 30,
    current_user: User = Depends(require_module("production")),
    db: AsyncSession = Depends(get_db),
):
    """List learner allocation sheets for the mill, newest first."""
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    company_id = scope.get("company_id")

    conditions = []
    if mill_id:
        conditions.append(LearnerAllocation.mill_id == mill_id)
    elif company_id:
        conditions.append(LearnerAllocation.company_id == company_id)

    if date_from:
        conditions.append(LearnerAllocation.allocation_date >= date_type.fromisoformat(date_from))
    if date_to:
        conditions.append(LearnerAllocation.allocation_date <= date_type.fromisoformat(date_to))
    if shift:
        conditions.append(LearnerAllocation.shift == shift)

    total = (await db.execute(select(func.count(LearnerAllocation.id)).where(*conditions))).scalar_one()
    rows = (await db.execute(
        select(LearnerAllocation)
        .where(*conditions)
        .order_by(LearnerAllocation.allocation_date.desc(), LearnerAllocation.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()

    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [
            {
                "id": r.id,
                "allocation_date": str(r.allocation_date),
                "shift": r.shift,
                "allocation_type": r.allocation_type,
                "total_persons": r.total_persons,
                "notes": r.notes,
                "submitted_by": r.submitted_by,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/production/learner-allocations/{allocation_id}")
async def get_learner_allocation(
    allocation_id: str,
    current_user: User = Depends(require_module("production")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single allocation sheet with all entries."""
    scope = await get_mill_scope(current_user, db)
    result = await db.execute(
        select(LearnerAllocation)
        .where(LearnerAllocation.id == allocation_id)
        .options(selectinload(LearnerAllocation.entries))
    )
    alloc = result.scalar_one_or_none()
    if not alloc:
        raise HTTPException(status_code=404, detail="Allocation not found")

    # Tenant check
    mill_id = scope.get("mill_id")
    company_id = scope.get("company_id")
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        if mill_id and str(alloc.mill_id) != mill_id:
            raise HTTPException(status_code=403, detail="Access denied")
        elif company_id and str(alloc.company_id) != company_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": alloc.id,
        "allocation_date": str(alloc.allocation_date),
        "shift": alloc.shift,
        "allocation_type": alloc.allocation_type,
        "total_persons": alloc.total_persons,
        "notes": alloc.notes,
        "submitted_by": alloc.submitted_by,
        "created_at": alloc.created_at.isoformat() if alloc.created_at else None,
        "entries": [
            {
                "id": e.id,
                "section": e.section,
                "machine_no": e.machine_no,
                "card_no_a": e.card_no_a,
                "card_no_b": e.card_no_b,
                "sub_label": e.sub_label,
                "display_order": e.display_order,
            }
            for e in alloc.entries
        ],
    }
