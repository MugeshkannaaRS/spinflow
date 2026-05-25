import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime
import math
import statistics as stats_lib

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, log_audit
from app.models.user import User
from app.models.purchase import Supplier, CottonPurchase, GRNEntry, CottonBale
from app.schemas.purchase import (
    SupplierCreate, SupplierOut,
    CottonPurchaseCreate, CottonPurchaseOut,
    GRNCreate, GRNOut,
    BaleCreate, BaleOut, BaleGroupRequest, BaleGroupResponse, BaleStatsOut,
    SupplierStat, LotStat,
)

# MIC range [min, max] per yarn count (industry standard)
_YARN_MIC: dict = {
    "10s": (4.5, 5.2), "16s": (4.3, 5.0), "20s": (4.0, 4.8),
    "24s": (3.9, 4.5), "30s": (3.8, 4.3), "40s": (3.7, 4.2),
    "60s": (3.5, 4.0), "80s": (3.2, 3.8), "100s": (3.0, 3.5),
}
# Staple range (mm) per yarn count
_YARN_STAPLE: dict = {
    "10s": (25.0, 28.0), "16s": (26.0, 29.0), "20s": (27.0, 30.0),
    "24s": (28.0, 31.0), "30s": (29.0, 32.0), "40s": (30.0, 34.0),
    "60s": (32.0, 36.0), "80s": (34.0, 38.0), "100s": (35.0, 40.0),
}


def _assign_category(mic: float) -> str:
    if mic <= 3.60: return "Reject"
    if mic <= 3.80: return "A"
    if mic <= 3.90: return "B"
    if mic <= 4.00: return "C"
    if mic <= 4.10: return "D"
    if mic <= 4.20: return "E"
    if mic <= 4.30: return "F"
    if mic <= 4.50: return "G"
    if mic <= 4.70: return "H"
    return "Reject"


def _compute_quality_index(strength: Optional[float], uniformity: Optional[float],
                            mic: float, trash: Optional[float]) -> Optional[float]:
    if not strength or not uniformity or mic <= 0:
        return None
    t = max(trash or 1.0, 0.1)
    return round((strength * uniformity) / (mic * t), 2)

router = APIRouter()


@router.get("/purchase/purchases")
async def get_purchases(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    stmt = select(CottonPurchase).order_by(CottonPurchase.created_at.desc())
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
            "data": [CottonPurchaseOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"purchase.purchases list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/purchase/purchases", response_model=CottonPurchaseOut)
async def create_purchase(
    req: CottonPurchaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase", write=True)),
):
    purchase = CottonPurchase(
        date=req.purchase_date.isoformat(),
        invoice_no=req.invoice_no or "",
        supplier_id=req.supplier_id,
        bales=req.bale_count,
        gross_kg=req.weight_kg * req.bale_count,
        net_kg=req.weight_kg * req.bale_count,
        rate_per_kg=req.rate_per_quintal / 100,
        moisture=req.moisture_pct or 0,
        status="pending",
    )
    db.add(purchase)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "create", "CottonPurchase", purchase.id,
                    f"Purchase {purchase.invoice_no} created")
    return purchase


@router.get("/purchase/suppliers")
async def get_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    try:
        stmt = select(Supplier)
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
            "data": [SupplierOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"purchase.suppliers list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/purchase/suppliers", response_model=SupplierOut)
async def create_supplier(
    req: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase", write=True)),
):
    supplier_code = req.code or req.name[:50].upper().replace(" ", "-")
    supplier = Supplier(
        code=supplier_code,
        name=req.name,
        contact_person=req.contact_person,
        phone=req.mobile,
        email=str(req.email) if req.email else None,
        address=req.address,
        gstin=req.gstin,
        status=True,
    )
    db.add(supplier)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "create", "Supplier", supplier.id,
                    f"Supplier {supplier.name} created")
    return supplier


@router.get("/purchase/bales/stats", response_model=BaleStatsOut)
async def get_bale_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    result = await db.execute(select(CottonBale))
    bales = result.scalars().all()
    total = len(bales)
    in_stock = sum(1 for b in bales if b.status == "in-stock")
    used = sum(1 for b in bales if b.status == "used")
    rejected = sum(1 for b in bales if b.status == "rejected")
    mics = [b.micronaire for b in bales if b.micronaire]
    staples = [b.staple_length for b in bales if b.staple_length]
    strengths = [b.strength for b in bales if b.strength]
    uniformities = [b.uniformity for b in bales if b.uniformity]
    avg_mic = round(stats_lib.mean(mics), 3) if mics else 0.0
    avg_staple = round(stats_lib.mean(staples), 2) if staples else 0.0
    avg_strength = round(stats_lib.mean(strengths), 2) if strengths else 0.0
    avg_uniformity = round(stats_lib.mean(uniformities), 2) if uniformities else 0.0
    mic_cv = round((stats_lib.stdev(mics) / avg_mic * 100), 2) if len(mics) > 1 and avg_mic > 0 else 0.0
    cats: dict = {}
    for b in bales:
        c = b.category or "?"
        cats[c] = cats.get(c, 0) + 1
    # Supplier stats
    sup_map: dict = {}
    for b in bales:
        s = b.supplier
        if s not in sup_map:
            sup_map[s] = {"mics": [], "strengths": [], "uniformities": [], "count": 0}
        sup_map[s]["count"] += 1
        if b.micronaire: sup_map[s]["mics"].append(b.micronaire)
        if b.strength: sup_map[s]["strengths"].append(b.strength)
        if b.uniformity: sup_map[s]["uniformities"].append(b.uniformity)
    supplier_stats = [
        SupplierStat(
            supplier=s,
            bale_count=v["count"],
            avg_mic=round(stats_lib.mean(v["mics"]), 3) if v["mics"] else 0,
            avg_strength=round(stats_lib.mean(v["strengths"]), 2) if v["strengths"] else 0,
            avg_uniformity=round(stats_lib.mean(v["uniformities"]), 2) if v["uniformities"] else 0,
        )
        for s, v in sup_map.items()
    ]
    # Lot stats
    lot_map: dict = {}
    for b in bales:
        ln = b.lot_number or "No Lot"
        if ln not in lot_map:
            lot_map[ln] = {"mics": [], "count": 0}
        lot_map[ln]["count"] += 1
        if b.micronaire: lot_map[ln]["mics"].append(b.micronaire)
    lot_stats = [
        LotStat(
            lot_number=ln,
            bale_count=v["count"],
            avg_mic=round(stats_lib.mean(v["mics"]), 3) if v["mics"] else 0,
        )
        for ln, v in lot_map.items()
    ]
    return BaleStatsOut(
        total_bales=total, in_stock=in_stock, used=used, rejected=rejected,
        avg_mic=avg_mic, avg_staple=avg_staple, avg_strength=avg_strength,
        avg_uniformity=avg_uniformity, mic_cv=mic_cv,
        bales_by_category=cats, supplier_stats=supplier_stats, lot_stats=lot_stats,
    )


@router.get("/purchase/bales")
async def get_bales(
    supplier: Optional[str] = Query(None),
    lot_number: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    stmt = select(CottonBale).order_by(CottonBale.created_at.desc())
    if supplier:
        stmt = stmt.where(CottonBale.supplier == supplier)
    if lot_number:
        stmt = stmt.where(CottonBale.lot_number == lot_number)
    if category:
        stmt = stmt.where(CottonBale.category == category)
    if status:
        stmt = stmt.where(CottonBale.status == status)
    try:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        items = result.scalars().all()
        return {"total": total, "page": page, "page_size": page_size, "data": [BaleOut.model_validate(item).model_dump() for item in items]}
    except Exception as e:
        logger.error(f"purchase.bales list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/purchase/bales", response_model=BaleOut)
async def create_bale(
    req: BaleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase", write=True)),
):
    qi = _compute_quality_index(req.strength, req.uniformity, req.micronaire, req.trash_area)
    category = _assign_category(req.micronaire)
    bale = CottonBale(
        bale_number=req.bale_number,
        supplier=req.supplier,
        lot_number=req.lot_number,
        date_received=req.date_received.isoformat(),
        micronaire=req.micronaire,
        staple_length=req.staple_length,
        strength=req.strength,
        uniformity=req.uniformity,
        short_fiber_index=req.short_fiber_index,
        moisture=req.moisture,
        trash_area=req.trash_area,
        trash_grade=req.trash_grade,
        color_grade=req.color_grade,
        reflectance=req.reflectance,
        yellowness=req.yellowness,
        elongation=req.elongation,
        maturity=req.maturity,
        sci=req.sci,
        quality_index=qi,
        category=category,
        status="in-stock" if category != "Reject" else "rejected",
    )
    db.add(bale)
    await db.flush()
    return bale


@router.post("/purchase/bales/group", response_model=BaleGroupResponse)
async def get_bale_group(
    req: BaleGroupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    mic_min, mic_max = _YARN_MIC.get(req.yarn_count, (3.8, 4.3))
    st_min, st_max = _YARN_STAPLE.get(req.yarn_count, (28.0, 32.0))
    if req.bale_ids:
        stmt = select(CottonBale).where(CottonBale.id.in_(req.bale_ids))
    else:
        stmt = (
            select(CottonBale)
            .where(CottonBale.status == "in-stock")
            .where(CottonBale.micronaire >= mic_min)
            .where(CottonBale.micronaire <= mic_max)
            .order_by(CottonBale.micronaire)
        )
    result = await db.execute(stmt)
    bales = result.scalars().all()
    if not bales:
        return BaleGroupResponse(
            yarn_count=req.yarn_count,
            recommended_mic_min=mic_min, recommended_mic_max=mic_max,
            recommended_staple_min=st_min, recommended_staple_max=st_max,
            selected_bales=[], blend_mic=0, blend_staple=0,
            blend_strength=0, blend_uniformity=0,
            mic_cv=0, quality_index=0, bale_count=0,
        )
    mics = [b.micronaire for b in bales]
    blend_mic = round(stats_lib.mean(mics), 3)
    mic_cv = round(stats_lib.stdev(mics) / blend_mic * 100, 2) if len(mics) > 1 and blend_mic > 0 else 0.0
    staples = [b.staple_length for b in bales if b.staple_length]
    blend_staple = round(stats_lib.mean(staples), 2) if staples else 0.0
    strengths = [b.strength for b in bales if b.strength]
    blend_strength = round(stats_lib.mean(strengths), 2) if strengths else 0.0
    uniformities = [b.uniformity for b in bales if b.uniformity]
    blend_uniformity = round(stats_lib.mean(uniformities), 2) if uniformities else 0.0
    trashs = [b.trash_area for b in bales if b.trash_area]
    blend_trash = stats_lib.mean(trashs) if trashs else 1.0
    qi = _compute_quality_index(blend_strength or None, blend_uniformity or None, blend_mic, blend_trash) or 0.0
    return BaleGroupResponse(
        yarn_count=req.yarn_count,
        recommended_mic_min=mic_min, recommended_mic_max=mic_max,
        recommended_staple_min=st_min, recommended_staple_max=st_max,
        selected_bales=bales,
        blend_mic=blend_mic, blend_staple=blend_staple,
        blend_strength=blend_strength, blend_uniformity=blend_uniformity,
        mic_cv=mic_cv, quality_index=qi, bale_count=len(bales),
    )


@router.get("/purchase/grns")
async def get_grns(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    try:
        stmt = select(GRNEntry).order_by(GRNEntry.created_at.desc())
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
            "data": [GRNOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"purchase.grns list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/purchase/grn", response_model=GRNOut)
async def create_grn(
    req: GRNCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase", write=True)),
):
    grn = GRNEntry(
        date=datetime.now().strftime("%Y-%m-%d"),
        grn_no=f"GRN-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        purchase_id=req.purchase_id,
        bales_received=req.received_bales,
        net_kg=req.received_weight_kg,
        received_by=current_user.name,
        remarks=req.remarks,
        status="completed",
    )
    db.add(grn)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "create", "GRNEntry", grn.id,
                    f"GRN {grn.grn_no} created")
    return GRNOut(
        id=grn.id,
        grn_no=grn.grn_no,
        purchase_id=grn.purchase_id,
        received_bales=grn.bales_received,
        received_weight_kg=grn.net_kg,
        grn_date=datetime.strptime(grn.date, "%Y-%m-%d").date() if grn.date else None,
        created_at=grn.created_at,
    )
