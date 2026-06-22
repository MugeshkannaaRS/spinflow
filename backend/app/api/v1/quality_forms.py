"""
Quality Forms API — Comprehensive CRUD + calculations + workflow for all QC modules.
Follows existing SpinFlow patterns: require_module, get_mill_scope, paginated lists with fallbacks.
"""
from __future__ import annotations
import logging
import math
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Any
from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.masters import Mill
from app.models.production import Machine
from app.models.quality_forms import (
    QmCardingWasteStudy, QmSimplexHankTest, QmSliverWrapping,
    QmCardingWrapping, QmClassimatResults, QmBagWeightCheck,
    QmPaperConeCheck, QmRfCspReport,
    # v2 generic models
    QmCardingCvRecord, QmDrawingCvRecord, QmAPctCheck,
    QmSimplexBreakageStudy, QmSimplexStretchPct,
    QmRfBreakageStudy, QmRfSnapStudy,
    QmYarnFaultsUster, QmSpliceStrength, QmWaxPickup,
    QmBagFaults, QmBlendTest, QmPwseCheck,
)
from app.schemas.quality_forms import (
    WasteStudyCreate, WasteStudyResponse,
    SimplexHankCreate, SimplexHankResponse,
    SliverWrappingCreate, SliverWrappingResponse,
    CardingWrappingCreate, CardingWrappingResponse,
    AutoconerCutCreate, AutoconerCutResponse,
    BagWeightCreate, BagWeightResponse,
    PaperConeCreate, PaperConeResponse,
    CspStrengthCreate, CspStrengthResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Machine lookup (for quality form autocomplete) ──────────────────────────

@router.get("/quality/machines")
async def list_quality_machines(
    department: Optional[str] = Query(None),
    page_size: int = Query(500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    """Return machines scoped to this mill — used for Mc No autocomplete in quality forms."""
    scope = await get_mill_scope(current_user, db)
    mill_id = scope.get("mill_id")
    company_id = scope.get("company_id")

    stmt = select(Machine.id, Machine.code, Machine.name, Machine.department, Machine.machine_type)
    if mill_id:
        stmt = stmt.where(Machine.mill_id == mill_id)
    elif company_id:
        mills_sub = select(Mill.id).where(Mill.company_id == company_id)
        stmt = stmt.where(Machine.mill_id.in_(mills_sub))

    if department:
        stmt = stmt.where(Machine.department.ilike(f"%{department}%"))

    stmt = stmt.order_by(Machine.code).limit(page_size)
    rows = (await db.execute(stmt)).all()
    return {
        "data": [
            {"id": r.id, "code": r.code, "name": r.name,
             "department": r.department, "machine_type": r.machine_type}
            for r in rows
        ]
    }


# ─── Helpers ────────────────────────────────────────────────────────

async def _apply_scope(db, current_user, model, base_query):
    """Apply mill/company scope filter to a query."""
    scope = await get_mill_scope(current_user, db)
    effective_mill = scope.get("mill_id")
    if effective_mill:
        return base_query.where(model.mill_id == effective_mill), scope
    company_id = scope.get("company_id")
    if company_id:
        mills_sub = select(Mill.id).where(Mill.company_id == company_id)
        return base_query.where(model.mill_id.in_(mills_sub)), scope
    return base_query, scope


async def _paginate(db, query, page, page_size):
    """Apply count + offset/limit pagination with error fallback."""
    try:
        count_q = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_q)).scalar() or 0
        rows = (await db.execute(
            query.order_by(desc("created_at")).offset((page - 1) * page_size).limit(page_size)
        )).scalars().all()
        pages = max(1, math.ceil(total / page_size))
        return {"total": total, "page": page, "page_size": page_size, "pages": pages, "data": rows}
    except Exception as e:
        logger.error(f"quality_forms paginate error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


async def _calculate_waste_study(record: QmCardingWasteStudy) -> QmCardingWasteStudy:
    """Auto-calculate total production and all waste percentages.

    Paper formula: each_waste_pct = (waste_kg / total_production_kg) * 100
    total_production_kg = sliver_can_gross_kg - empty_can_kg  (if not provided)
    total_wastage_pct = sum of all individual waste percentages
    """
    # Auto-derive production if not explicitly supplied
    if (record.total_production_kg is None and
            record.sliver_can_gross_kg is not None and
            record.empty_can_kg is not None):
        record.total_production_kg = round(
            record.sliver_can_gross_kg - record.empty_can_kg, 3
        )
    prod = record.total_production_kg or 0
    if prod > 0:
        def _pct(kg: Optional[float]) -> Optional[float]:
            return round((kg / prod) * 100, 2) if kg is not None else None

        record.licker_in2_waste_pct = _pct(record.licker_in2_waste_kg)
        record.licker_in3_waste_pct = _pct(record.licker_in3_waste_kg)
        record.flat_strips_pct = _pct(record.flat_strips_kg)
        record.suction_hood_back_pct = _pct(record.suction_hood_back_kg)
        record.suction_hood_front_pct = _pct(record.suction_hood_front_kg)

        total_waste = sum(filter(None, [
            record.licker_in2_waste_kg, record.licker_in3_waste_kg,
            record.flat_strips_kg, record.suction_hood_front_kg,
            record.suction_hood_back_kg,
        ]))
        record.total_wastage_pct = round((total_waste / prod) * 100, 2)
    return record


async def _calculate_simplex_hank(record: QmSimplexHankTest) -> QmSimplexHankTest:
    """Auto-calculate hank, CV%, spec check from sample readings."""
    samples = record.readings_json or []
    if isinstance(samples, list) and len(samples) > 0:
        weights = [float(s) if isinstance(s, (int, float)) else 0 for s in samples]
        valid = [w for w in weights if w > 0]
        if valid:
            avg = sum(valid) / len(valid)
            record.avg_hank = round(avg, 4)
            # Hank = 840 yards per pound → simplified: hank = 1 / (weight_g * 0.00220462 * 840)
            # For practical mill use: store the average weight; actual_hank computed in UI
            record.actual_hank = round(1.0 / (avg * 0.00220462 * 840) if avg > 0 else 0, 2)
            if len(valid) > 1:
                variance = sum((w - avg) ** 2 for w in valid) / (len(valid) - 1)
                std_dev = math.sqrt(variance)
                record.cv_pct = round((std_dev / avg) * 100, 2) if avg > 0 else 0
    return record


# ═══════════════════════════════════════════════════════════════════
# 1. WASTE STUDY
# ═══════════════════════════════════════════════════════════════════

@router.get("/quality-forms/waste-study")
async def list_waste_study(
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    machine_no: Optional[str] = Query(None), lot_no: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    q = select(QmCardingWasteStudy)
    q, _ = await _apply_scope(db, current_user, QmCardingWasteStudy, q)
    if machine_no: q = q.where(QmCardingWasteStudy.machine_no == machine_no)
    if lot_no: q = q.where(QmCardingWasteStudy.lot_no == lot_no)
    if status: q = q.where(QmCardingWasteStudy.status == status)
    return await _paginate(db, q, page, page_size)


@router.post("/quality-forms/waste-study", response_model=WasteStudyResponse)
async def create_waste_study(
    req: WasteStudyCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    record = QmCardingWasteStudy(
        mill_id=scope.get("mill_id") or "", company_id=scope.get("company_id"),
        date=req.date, machine_no=req.machine_no, lot_no=req.lot_no,
        shift_code=req.shift_code, delivery_hank=req.delivery_hank,
        licker_in_speed=req.licker_in_speed, cylinder_speed=req.cylinder_speed,
        flats_speed=req.flats_speed, delivery_speed=req.delivery_speed,
        wing_setting=req.wing_setting, empty_can_kg=req.empty_can_kg,
        sliver_can_gross_kg=req.sliver_can_gross_kg, total_production_kg=req.total_production_kg,
        licker_in2_waste_kg=req.licker_in2_waste_kg, licker_in3_waste_kg=req.licker_in3_waste_kg,
        flat_strips_kg=req.flat_strips_kg, suction_hood_front_kg=req.suction_hood_front_kg,
        suction_hood_back_kg=req.suction_hood_back_kg, status="draft", remarks=req.remarks,
    )
    await _calculate_waste_study(record)
    db.add(record)
    await db.flush()
    await db.commit()
    return record


@router.patch("/quality-forms/waste-study/{record_id}/status")
async def update_waste_study_status(
    record_id: str, status: str = Query(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    q = select(QmCardingWasteStudy).where(QmCardingWasteStudy.id == record_id)
    q, _ = await _apply_scope(db, current_user, QmCardingWasteStudy, q)
    record = (await db.execute(q)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Waste study record not found")
    record.status = status
    await db.flush()
    await db.commit()
    return {"id": record_id, "status": status}


# ═══════════════════════════════════════════════════════════════════
# 2. SIMPLEX HANK TEST
# ═══════════════════════════════════════════════════════════════════

@router.get("/quality-forms/simplex-hank")
async def list_simplex_hank(
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    machine_no: Optional[str] = Query(None), lot_no: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    q = select(QmSimplexHankTest)
    q, _ = await _apply_scope(db, current_user, QmSimplexHankTest, q)
    if machine_no: q = q.where(QmSimplexHankTest.machine_no == machine_no)
    if lot_no: q = q.where(QmSimplexHankTest.lot_no == lot_no)
    if status: q = q.where(QmSimplexHankTest.status == status)
    return await _paginate(db, q, page, page_size)


@router.post("/quality-forms/simplex-hank", response_model=SimplexHankResponse)
async def create_simplex_hank(
    req: SimplexHankCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    record = QmSimplexHankTest(
        mill_id=scope.get("mill_id") or "", company_id=scope.get("company_id"),
        date=req.date, shift_code=req.shift_code, machine_no=req.machine_no,
        lot_no=req.lot_no, cotton_type=req.cotton_type, process=req.process,
        nominal_hank=req.nominal_hank, readings_json={"samples": req.samples_json or []},
        status="draft", remarks=req.remarks,
    )
    await _calculate_simplex_hank(record)
    db.add(record)
    await db.flush()
    await db.commit()
    return record


@router.patch("/quality-forms/simplex-hank/{record_id}/status")
async def update_simplex_hank_status(
    record_id: str, status: str = Query(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    q = select(QmSimplexHankTest).where(QmSimplexHankTest.id == record_id)
    q, _ = await _apply_scope(db, current_user, QmSimplexHankTest, q)
    record = (await db.execute(q)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Simplex hank record not found")
    record.status = status
    await db.flush()
    await db.commit()
    return {"id": record_id, "status": status}


# ═══════════════════════════════════════════════════════════════════
# 3. SLIVER WRAPPING
# ═══════════════════════════════════════════════════════════════════

@router.get("/quality-forms/sliver-wrapping")
async def list_sliver_wrapping(
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    machine_no: Optional[str] = Query(None), lot_no: Optional[str] = Query(None),
    process: Optional[str] = Query(None), status: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    q = select(QmSliverWrapping)
    q, _ = await _apply_scope(db, current_user, QmSliverWrapping, q)
    if machine_no: q = q.where(QmSliverWrapping.machine_no == machine_no)
    if lot_no: q = q.where(QmSliverWrapping.lot_no == lot_no)
    if process: q = q.where(QmSliverWrapping.process == process)
    if status: q = q.where(QmSliverWrapping.status == status)
    return await _paginate(db, q, page, page_size)


@router.post("/quality-forms/sliver-wrapping", response_model=SliverWrappingResponse)
async def create_sliver_wrapping(
    req: SliverWrappingCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    readings = req.readings_json or []
    avg_wt = sum(readings) / len(readings) if readings else None
    record = QmSliverWrapping(
        mill_id=scope.get("mill_id") or "", company_id=scope.get("company_id"),
        date=req.date, shift_code=req.shift_code, machine_no=req.machine_no,
        lot_no=req.lot_no, process=req.process, side=req.side,
        std_hank=req.std_hank, readings_json={"readings": readings},
        avg_weight=avg_wt, ok_input=True, status="draft", remarks=req.remarks,
    )
    db.add(record)
    await db.flush()
    await db.commit()
    return record


# ═══════════════════════════════════════════════════════════════════
# 4. DAILY CARDING WRAPPING
# ═══════════════════════════════════════════════════════════════════

@router.get("/quality-forms/carding-wrapping")
async def list_carding_wrapping(
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    machine_no: Optional[str] = Query(None), lot_no: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    q = select(QmCardingWrapping)
    q, _ = await _apply_scope(db, current_user, QmCardingWrapping, q)
    if machine_no: q = q.where(QmCardingWrapping.machine_no == machine_no)
    if lot_no: q = q.where(QmCardingWrapping.lot_no == lot_no)
    if status: q = q.where(QmCardingWrapping.status == status)
    return await _paginate(db, q, page, page_size)


@router.post("/quality-forms/carding-wrapping", response_model=CardingWrappingResponse)
async def create_carding_wrapping(
    req: CardingWrappingCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    readings = req.readings_json or []
    avg_wt = sum(readings) / len(readings) if readings else None
    record = QmCardingWrapping(
        mill_id=scope.get("mill_id") or "", company_id=scope.get("company_id"),
        date=req.date, shift_code=req.shift_code, machine_no=req.machine_no,
        lot_no=req.lot_no, line_no=req.line_no, time_taken=req.time_taken,
        std_hank=req.std_hank, readings_json={"readings": readings},
        avg_weight=avg_wt, ok_input=True, status="draft", remarks=req.remarks,
    )
    db.add(record)
    await db.flush()
    await db.commit()
    return record


# ═══════════════════════════════════════════════════════════════════
# 5. AUTOCONER CUT REPORT
# ═══════════════════════════════════════════════════════════════════

@router.get("/quality-forms/autoconer-cut")
async def list_autoconer_cut(
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    machine_no: Optional[str] = Query(None), lot_no: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    q = select(QmClassimatResults)
    q, _ = await _apply_scope(db, current_user, QmClassimatResults, q)
    if machine_no: q = q.where(QmClassimatResults.machine_no == machine_no)
    if lot_no: q = q.where(QmClassimatResults.lot_no == lot_no)
    return await _paginate(db, q, page, page_size)


@router.post("/quality-forms/autoconer-cut", response_model=AutoconerCutResponse)
async def create_autoconer_cut(
    req: AutoconerCutCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    record = QmClassimatResults(
        mill_id=scope.get("mill_id") or "", company_id=scope.get("company_id"),
        date=req.date, shift_code=req.shift_code, machine_no=req.machine_no,
        lot_no=req.lot_no, count_ne=req.count_ne, group=req.group,
        speed=req.speed, length=req.length, yf_per_100km=req.yf_per_100km,
        cv_pct=req.cv_pct, thin_50_pct=req.thin_50_pct,
        thick_50_pct=req.thick_50_pct, neps_200_pct=req.neps_200_pct,
        total_ipi=req.total_ipi, status="draft", remarks=req.remarks,
    )
    db.add(record)
    await db.flush()
    await db.commit()
    return record


# ═══════════════════════════════════════════════════════════════════
# 6. BAG WEIGHT CHECK
# ═══════════════════════════════════════════════════════════════════

@router.patch("/quality-forms/bag-weight/{record_id}", response_model=BagWeightResponse)
async def update_bag_weight(
    record_id: str,
    req: BagWeightCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    q = select(QmBagWeightCheck).where(QmBagWeightCheck.id == record_id)
    q, _ = await _apply_scope(db, current_user, QmBagWeightCheck, q)
    record = (await db.execute(q)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Bag weight check record not found")
    samples = req.samples_json or []
    net_weights = [s.get("net_wt") for s in samples if s.get("net_wt")]
    avg = sum(net_weights) / len(net_weights) if net_weights else 0
    target = req.target_weight or 0
    under = sum(1 for w in net_weights if w < target) if target else 0
    over = sum(1 for w in net_weights if w > target) if target else 0
    pass_c = len(net_weights) - under - over
    for key, val in {
        "date": req.date, "shift_code": req.shift_code, "lot_no": req.lot_no,
        "count_ne": req.count_ne, "cone_tip_type": req.cone_tip_type,
        "inspector": req.inspector, "target_weight": target,
        "samples_json": {"samples": samples}, "total_samples": len(samples),
        "avg_net_weight": round(avg, 3) if avg else None,
        "min_net_weight": min(net_weights) if net_weights else None,
        "max_net_weight": max(net_weights) if net_weights else None,
        "underweight_count": under, "overweight_count": over, "pass_count": pass_c,
        "deviation_pct": round((avg - target) / target * 100, 2) if target and avg else None,
        "pass_pct": round(pass_c / len(net_weights) * 100, 1) if net_weights else None,
        "remarks": req.remarks,
    }.items():
        setattr(record, key, val)
    await db.flush()
    await db.commit()
    return record


@router.delete("/quality-forms/bag-weight/{record_id}")
async def delete_bag_weight(
    record_id: str,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    q = select(QmBagWeightCheck).where(QmBagWeightCheck.id == record_id)
    q, _ = await _apply_scope(db, current_user, QmBagWeightCheck, q)
    record = (await db.execute(q)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Bag weight check record not found")
    await db.delete(record)
    await db.flush()
    await db.commit()
    return {"ok": True, "id": record_id}


@router.get("/quality-forms/bag-weight")
async def list_bag_weight(
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    lot_no: Optional[str] = Query(None), status: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    q = select(QmBagWeightCheck)
    q, _ = await _apply_scope(db, current_user, QmBagWeightCheck, q)
    if lot_no: q = q.where(QmBagWeightCheck.lot_no == lot_no)
    if status: q = q.where(QmBagWeightCheck.status == status)
    return await _paginate(db, q, page, page_size)


@router.post("/quality-forms/bag-weight", response_model=BagWeightResponse)
async def create_bag_weight(
    req: BagWeightCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    samples = req.samples_json or []
    net_weights = [s.get("net_wt") for s in samples if s.get("net_wt")]
    avg = sum(net_weights) / len(net_weights) if net_weights else 0
    target = req.target_weight or 0
    under = sum(1 for w in net_weights if w < target) if target else 0
    over = sum(1 for w in net_weights if w > target) if target else 0
    pass_c = len(net_weights) - under - over
    record = QmBagWeightCheck(
        mill_id=scope.get("mill_id") or "", company_id=scope.get("company_id"),
        date=req.date, shift_code=req.shift_code, lot_no=req.lot_no,
        count_ne=req.count_ne, cone_tip_type=req.cone_tip_type,
        inspector=req.inspector, target_weight=target,
        samples_json={"samples": samples}, total_samples=len(samples),
        avg_net_weight=round(avg, 3) if avg else None,
        min_net_weight=min(net_weights) if net_weights else None,
        max_net_weight=max(net_weights) if net_weights else None,
        underweight_count=under, overweight_count=over, pass_count=pass_c,
        deviation_pct=round((avg - target) / target * 100, 2) if target and avg else None,
        pass_pct=round(pass_c / len(net_weights) * 100, 1) if net_weights else None,
        status="draft", remarks=req.remarks,
    )
    db.add(record)
    await db.flush()
    await db.commit()
    return record


# ═══════════════════════════════════════════════════════════════════
# 7. PAPER CONE CHECK
# ═══════════════════════════════════════════════════════════════════

@router.patch("/quality-forms/paper-cone/{record_id}", response_model=PaperConeResponse)
async def update_paper_cone(
    record_id: str,
    req: PaperConeCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    q = select(QmPaperConeCheck).where(QmPaperConeCheck.id == record_id)
    q, _ = await _apply_scope(db, current_user, QmPaperConeCheck, q)
    record = (await db.execute(q)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Paper cone check record not found")
    samples = req.samples_json or []
    cone_wts = [s.get("cone_weight_g") for s in samples if s.get("cone_weight_g")]
    visual_ok = sum(1 for s in samples if s.get("visual_ok"))
    avg_wt = sum(cone_wts) / len(cone_wts) if cone_wts else 0
    for key, val in {
        "date": req.date, "supplier_id": req.supplier_id, "supplier_name": req.supplier_name,
        "batch_no": req.batch_no, "inspector": req.inspector,
        "samples_json": {"samples": samples}, "total_samples": len(samples),
        "avg_cone_weight": round(avg_wt, 3) if avg_wt else None,
        "min_cone_weight": min(cone_wts) if cone_wts else None,
        "max_cone_weight": max(cone_wts) if cone_wts else None,
        "acceptance_pct": round(visual_ok / len(samples) * 100, 1) if samples else None,
        "rejection_pct": round((len(samples) - visual_ok) / len(samples) * 100, 1) if samples else None,
        "remarks": req.remarks,
    }.items():
        setattr(record, key, val)
    await db.flush()
    await db.commit()
    return record


@router.delete("/quality-forms/paper-cone/{record_id}")
async def delete_paper_cone(
    record_id: str,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    q = select(QmPaperConeCheck).where(QmPaperConeCheck.id == record_id)
    q, _ = await _apply_scope(db, current_user, QmPaperConeCheck, q)
    record = (await db.execute(q)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Paper cone check record not found")
    await db.delete(record)
    await db.flush()
    await db.commit()
    return {"ok": True, "id": record_id}


@router.get("/quality-forms/paper-cone")
async def list_paper_cone(
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None), status: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    q = select(QmPaperConeCheck)
    q, _ = await _apply_scope(db, current_user, QmPaperConeCheck, q)
    if supplier_id: q = q.where(QmPaperConeCheck.supplier_id == supplier_id)
    if status: q = q.where(QmPaperConeCheck.status == status)
    return await _paginate(db, q, page, page_size)


@router.post("/quality-forms/paper-cone", response_model=PaperConeResponse)
async def create_paper_cone(
    req: PaperConeCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    samples = req.samples_json or []
    cone_wts = [s.get("cone_weight_g") for s in samples if s.get("cone_weight_g")]
    visual_ok = sum(1 for s in samples if s.get("visual_ok"))
    avg_wt = sum(cone_wts) / len(cone_wts) if cone_wts else 0
    record = QmPaperConeCheck(
        mill_id=scope.get("mill_id") or "", company_id=scope.get("company_id"),
        date=req.date, supplier_id=req.supplier_id, supplier_name=req.supplier_name,
        batch_no=req.batch_no, inspector=req.inspector,
        samples_json={"samples": samples}, total_samples=len(samples),
        avg_cone_weight=round(avg_wt, 3) if avg_wt else None,
        min_cone_weight=min(cone_wts) if cone_wts else None,
        max_cone_weight=max(cone_wts) if cone_wts else None,
        acceptance_pct=round(visual_ok / len(samples) * 100, 1) if samples else None,
        rejection_pct=round((len(samples) - visual_ok) / len(samples) * 100, 1) if samples else None,
        status="draft", remarks=req.remarks,
    )
    db.add(record)
    await db.flush()
    await db.commit()
    return record


# ═══════════════════════════════════════════════════════════════════
# 8. CSP STRENGTH REPORT
# ═══════════════════════════════════════════════════════════════════

@router.get("/quality-forms/csp-strength")
async def list_csp_strength(
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    machine_no: Optional[str] = Query(None), lot_no: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    q = select(QmRfCspReport)
    q, _ = await _apply_scope(db, current_user, QmRfCspReport, q)
    if machine_no: q = q.where(QmRfCspReport.machine_no == machine_no)
    if lot_no: q = q.where(QmRfCspReport.lot_no == lot_no)
    return await _paginate(db, q, page, page_size)


@router.post("/quality-forms/csp-strength", response_model=CspStrengthResponse)
async def create_csp_strength(
    req: CspStrengthCreate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    samples = req.samples_json or []
    csp_vals = [s.get("csp") or s.get("strength", 0) for s in samples]
    valid_csp = [c for c in csp_vals if c and c > 0]
    avg_csp = sum(valid_csp) / len(valid_csp) if valid_csp else 0
    cv = 0
    if len(valid_csp) > 1 and avg_csp > 0:
        variance = sum((c - avg_csp) ** 2 for c in valid_csp) / (len(valid_csp) - 1)
        cv = round((math.sqrt(variance) / avg_csp) * 100, 2)
    record = QmRfCspReport(
        mill_id=scope.get("mill_id") or "", company_id=scope.get("company_id"),
        date=req.date, machine_no=req.machine_no, lot_no=req.lot_no,
        count_ne=req.count_ne, ratio=req.ratio, tm=req.tm, tpi=req.tpi,
        samples_json={"samples": samples},
        avg_csp=round(avg_csp, 1) if avg_csp else None,
        cv_pct=cv, max_csp=max(valid_csp) if valid_csp else None,
        min_csp=min(valid_csp) if valid_csp else None,
        status="draft", remarks=req.remarks,
    )
    db.add(record)
    await db.flush()
    await db.commit()
    return record


# ═══════════════════════════════════════════════════════════════════
# SUMMARY / DASHBOARD
# ═══════════════════════════════════════════════════════════════════

@router.get("/quality-forms/summary")
async def quality_forms_summary(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_module("quality")),
):
    """Aggregated counts across all quality form types for the dashboard."""
    scope = await get_mill_scope(current_user, db)
    mid = scope.get("mill_id")
    cid = scope.get("company_id")
    mills_sub = select(Mill.id).where(Mill.company_id == cid) if cid and not mid else None

    def _scoped_q(model):
        q = select(func.count()).select_from(model)
        if mid:
            return q.where(model.mill_id == mid)
        if mills_sub is not None:
            return q.where(model.mill_id.in_(mills_sub))
        return q

    try:
        total_tests = sum([
            (await db.execute(_scoped_q(QmCardingWasteStudy))).scalar() or 0,
            (await db.execute(_scoped_q(QmSimplexHankTest))).scalar() or 0,
            (await db.execute(_scoped_q(QmSliverWrapping))).scalar() or 0,
            (await db.execute(_scoped_q(QmCardingWrapping))).scalar() or 0,
        ])
        pending = sum([
            (await db.execute(_scoped_q(QmCardingWasteStudy).where(QmCardingWasteStudy.status == "draft"))).scalar() or 0,
            (await db.execute(_scoped_q(QmSimplexHankTest).where(QmSimplexHankTest.status == "draft"))).scalar() or 0,
            (await db.execute(_scoped_q(QmSliverWrapping).where(QmSliverWrapping.status == "draft"))).scalar() or 0,
            (await db.execute(_scoped_q(QmCardingWrapping).where(QmCardingWrapping.status == "draft"))).scalar() or 0,
        ])
        return {"total_tests": total_tests, "pending_approvals": pending}
    except Exception as e:
        logger.error(f"quality_forms summary error: {e}")
        return {"total_tests": 0, "pending_approvals": 0}


# ═══════════════════════════════════════════════════════════════════
# GENERIC v2 ENDPOINTS
# ─────────────────────────────────────────────────────────────────
# These serve the QmFormsTab generic React component which POSTs an
# arbitrary dict of field keys/values.  We accept Any payload, set
# mill_id/company_id from scope, and persist via SQLAlchemy's
# __table__.columns inspection so we don't need a typed Pydantic
# schema per form.
# ═══════════════════════════════════════════════════════════════════

from typing import Dict, Type
from sqlalchemy.orm import DeclarativeBase

# Route slug → SQLAlchemy model
_V2_MODEL_MAP: Dict[str, Any] = {
    # Carding
    "carding/cv-record":         QmCardingCvRecord,
    "carding/waste-study":       QmCardingWasteStudy,
    "carding/wrapping":          QmCardingWrapping,
    # Drawing
    "drawing/cv-record":         QmDrawingCvRecord,
    "drawing/a-pct":             QmAPctCheck,
    "drawing/sliver-wrapping":   QmSliverWrapping,
    # Simplex
    "simplex/hank-test":         QmSimplexHankTest,
    "simplex/breakage-study":    QmSimplexBreakageStudy,
    "simplex/stretch-pct":       QmSimplexStretchPct,
    # Ring Frame
    "ring-frame/csp-report":     QmRfCspReport,
    "ring-frame/breakage-study": QmRfBreakageStudy,
    "ring-frame/snap-study":     QmRfSnapStudy,
    # Auto Coner
    "auto-coner/yarn-faults":    QmYarnFaultsUster,
    "auto-coner/splice-strength":QmSpliceStrength,
    "auto-coner/wax-pickup":     QmWaxPickup,
    "auto-coner/bag-faults":     QmBagFaults,
    # Packing
    "packing/blend-test":        QmBlendTest,
    "packing/pwse-check":        QmPwseCheck,
    "packing/bag-weight":        QmBagWeightCheck,
    "packing/paper-cone":        QmPaperConeCheck,
}


def _model_cols(model) -> set:
    """Return the set of column names on a model (excluding id/mill_id/company_id/timestamps)."""
    reserved = {"id", "mill_id", "company_id", "created_at", "updated_at"}
    return {c.key for c in model.__table__.columns if c.key not in reserved}


async def _v2_list(slug: str, db: AsyncSession, current_user: User,
                   date: Optional[str], lot_no: Optional[str],
                   machine_no: Optional[str], page: int, page_size: int,
                   date_from: Optional[str] = None, date_to: Optional[str] = None):
    model = _V2_MODEL_MAP[slug]
    q = select(model)
    q, _ = await _apply_scope(db, current_user, model, q)
    cols = _model_cols(model)
    if "date" in cols:
        if date_from and date_to:
            q = q.where(model.date >= date_from).where(model.date <= date_to)
        elif date_from:
            q = q.where(model.date >= date_from)
        elif date_to:
            q = q.where(model.date <= date_to)
        elif date:
            q = q.where(model.date == date)
    if lot_no and "lot_no" in cols:
        q = q.where(model.lot_no == lot_no)
    if machine_no and "machine_no" in cols:
        q = q.where(model.machine_no == machine_no)
    return await _paginate(db, q, page, page_size)


async def _v2_create(slug: str, payload: Dict[str, Any],
                     db: AsyncSession, current_user: User):
    model = _V2_MODEL_MAP[slug]
    scope = await get_mill_scope(current_user, db)
    allowed = _model_cols(model)
    kwargs = {k: v for k, v in payload.items() if k in allowed}

    mill_id = scope.get("mill_id")
    # MILL_OWNER has mill_id=None — resolve to their first mill
    if not mill_id and scope.get("company_id"):
        r = await db.execute(
            select(Mill).where(Mill.company_id == scope["company_id"]).limit(1)
        )
        first_mill = r.scalar_one_or_none()
        if first_mill:
            mill_id = str(first_mill.id)
    if not mill_id:
        raise HTTPException(status_code=400, detail="No mill found. Assign a mill to your account.")

    kwargs["mill_id"] = mill_id
    # Only set company_id if the model actually has that column
    allowed_all = {c.key for c in model.__table__.columns}
    if scope.get("company_id") and "company_id" in allowed_all:
        kwargs["company_id"] = scope["company_id"]
    kwargs.setdefault("status", "draft")

    # Validate required NOT NULL fields before attempting insert
    for req_field in ("lot_no", "machine_no", "date"):
        if req_field in allowed and not kwargs.get(req_field):
            label = {"lot_no": "Process/Lot No", "machine_no": "Machine No", "date": "Date"}.get(req_field, req_field)
            raise HTTPException(status_code=400, detail=f"{label} is required.")

    try:
        record = model(**kwargs)
        # Run domain-specific calculations
        if model is QmCardingWasteStudy:
            await _calculate_waste_study(record)
        db.add(record)
        await db.flush()
        await db.commit()
        await db.refresh(record)
        return record
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"_v2_create {slug} error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Save failed: {str(e)}")


async def _v2_update(slug: str, record_id: str, payload: Dict[str, Any],
                     db: AsyncSession, current_user: User):
    model = _V2_MODEL_MAP[slug]
    q = select(model).where(model.id == record_id)
    q, _ = await _apply_scope(db, current_user, model, q)
    record = (await db.execute(q)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    allowed = _model_cols(model)
    for k, v in payload.items():
        if k in allowed:
            setattr(record, k, v)
    # Re-run domain-specific calculations after update
    if model is QmCardingWasteStudy:
        await _calculate_waste_study(record)
    await db.flush()
    await db.commit()
    await db.refresh(record)
    return record


async def _v2_delete(slug: str, record_id: str,
                     db: AsyncSession, current_user: User):
    model = _V2_MODEL_MAP[slug]
    q = select(model).where(model.id == record_id)
    q, _ = await _apply_scope(db, current_user, model, q)
    record = (await db.execute(q)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.delete(record)
    await db.commit()
    return {"deleted": record_id}


# ── Generate one set of 4 routes per slug ──────────────────────────

for _slug in _V2_MODEL_MAP:

    # capture for closure
    def _make_list(slug=_slug):
        @router.get(f"/quality/v2/{slug}", tags=["quality-v2"])
        async def list_v2(
            date: Optional[str] = Query(None),
            date_from: Optional[str] = Query(None),
            date_to: Optional[str] = Query(None),
            lot_no: Optional[str] = Query(None),
            machine_no: Optional[str] = Query(None),
            page: int = Query(1, ge=1),
            page_size: int = Query(20, ge=1, le=1000),
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(require_module("quality")),
        ):
            return await _v2_list(slug, db, current_user, date, lot_no, machine_no, page, page_size, date_from, date_to)
        list_v2.__name__ = f"list_v2_{slug.replace('/', '_')}"
        return list_v2

    def _make_create(slug=_slug):
        @router.post(f"/quality/v2/{slug}", tags=["quality-v2"])
        async def create_v2(
            payload: Dict[str, Any],
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(require_module("quality", write=True)),
        ):
            return await _v2_create(slug, payload, db, current_user)
        create_v2.__name__ = f"create_v2_{slug.replace('/', '_')}"
        return create_v2

    def _make_update(slug=_slug):
        @router.patch(f"/quality/v2/{slug}/{{record_id}}", tags=["quality-v2"])
        async def update_v2(
            record_id: str,
            payload: Dict[str, Any],
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(require_module("quality", write=True)),
        ):
            return await _v2_update(slug, record_id, payload, db, current_user)
        update_v2.__name__ = f"update_v2_{slug.replace('/', '_')}"
        return update_v2

    def _make_delete(slug=_slug):
        @router.delete(f"/quality/v2/{slug}/{{record_id}}", tags=["quality-v2"])
        async def delete_v2(
            record_id: str,
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(require_module("quality", write=True)),
        ):
            return await _v2_delete(slug, record_id, db, current_user)
        delete_v2.__name__ = f"delete_v2_{slug.replace('/', '_')}"
        return delete_v2

    _make_list()
    _make_create()
    _make_update()
    _make_delete()
