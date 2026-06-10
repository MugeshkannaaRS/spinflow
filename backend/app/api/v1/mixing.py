"""
Mixing, laydown, JCP clearance, utility breakdown, waste stock, and splice quality endpoints.
All features added in SpinFlow v2 (migration 019).
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.masters import Mill
from app.models.mixing import (
    MixingRecipe, MixingLayer, MixingChangeLog,
    LaydownRecord, BaleConsumptionLog,
    JCPClearance,
    UtilityBreakdown,
    WasteStock, WasteTransfer,
    SpliceQualityLog,
    ShiftManpowerPlan,
)
from app.schemas.mixing import (
    MixingRecipeCreate, MixingRecipeOut,
    MixingChangeCreate, MixingChangeOut,
    LaydownCreate, LaydownOut,
    BaleConsumptionCreate, BaleConsumptionOut,
    JCPCreate, JCPApprove, JCPOut,
    UtilityBreakdownCreate, UtilityBreakdownResolve, UtilityBreakdownOut,
    WasteStockCreate, WasteStockSell, WasteStockOut,
    WasteTransferCreate, WasteTransferOut,
    SpliceQualityCreate, SpliceQualityOut,
    ManpowerPlanCreate, ManpowerPlanOut,
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
    """Return effective mill_id for the request or raise 400."""
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


def _paginate(query, page: int, page_size: int):
    return query.offset((page - 1) * page_size).limit(page_size)


# ================================================================== #
# MIXING RECIPES                                                       #
# ================================================================== #

@router.get("/mixing/recipes")
async def list_recipes(
    mill_id: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(MixingRecipe).where(MixingRecipe.mill_id == effective_mill_id)
    if is_active is not None:
        q = q.where(MixingRecipe.is_active == is_active)
    q = q.order_by(MixingRecipe.recipe_code)
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [MixingRecipeOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"mixing.recipes list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/mixing/recipes", response_model=MixingRecipeOut)
async def create_recipe(
    req: MixingRecipeCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    recipe = MixingRecipe(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        recipe_code=req.recipe_code,
        recipe_name=req.recipe_name,
        yarn_count_id=req.yarn_count_id,
        lot_id=req.lot_id,
        fiber_composition=req.fiber_composition,
        remarks=req.remarks,
        created_by=current_user.name or current_user.email,
    )
    db.add(recipe)
    await db.flush()

    if req.layers:
        for layer_in in req.layers:
            db.add(MixingLayer(
                id=generate_uuid(),
                recipe_id=recipe.id,
                layer_no=layer_in.layer_no,
                fiber_type=layer_in.fiber_type,
                percentage=layer_in.percentage,
                kg_per_layer=layer_in.kg_per_layer,
                bale_count=layer_in.bale_count,
                remarks=layer_in.remarks,
            ))

    await db.commit()
    await db.refresh(recipe)
    return recipe


@router.get("/mixing/recipes/{recipe_id}", response_model=MixingRecipeOut)
async def get_recipe(
    recipe_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    recipe = (await db.execute(select(MixingRecipe).where(MixingRecipe.id == recipe_id))).scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.patch("/mixing/recipes/{recipe_id}/approve", response_model=MixingRecipeOut)
async def approve_recipe(
    recipe_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    recipe = (await db.execute(select(MixingRecipe).where(MixingRecipe.id == recipe_id))).scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe.approved_by = current_user.name or current_user.email
    recipe.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(recipe)
    return recipe


# ================================================================== #
# MIXING CHANGE LOG                                                    #
# ================================================================== #

@router.get("/mixing/change-log")
async def list_change_log(
    mill_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(MixingChangeLog).where(MixingChangeLog.mill_id == effective_mill_id)
    if date:
        q = q.where(MixingChangeLog.change_date == date)
    q = q.order_by(MixingChangeLog.change_date.desc())
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [MixingChangeOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"mixing.change-log list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/mixing/change-log", response_model=MixingChangeOut)
async def create_change_log(
    req: MixingChangeCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    entry = MixingChangeLog(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        change_date=req.change_date,
        shift=req.shift,
        intimation_slip_no=req.intimation_slip_no,
        old_recipe_id=req.old_recipe_id,
        new_recipe_id=req.new_recipe_id,
        reason=req.reason,
        created_by=current_user.name or current_user.email,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


# ================================================================== #
# LAYDOWN RECORDS                                                      #
# ================================================================== #

@router.get("/mixing/laydown")
async def list_laydown(
    mill_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(LaydownRecord).where(LaydownRecord.mill_id == effective_mill_id)
    if date:
        q = q.where(LaydownRecord.date == date)
    if shift:
        q = q.where(LaydownRecord.shift == shift)
    q = q.order_by(LaydownRecord.date.desc())
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [LaydownOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"mixing.laydown list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/mixing/laydown", response_model=LaydownOut)
async def create_laydown(
    req: LaydownCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    record = LaydownRecord(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        **req.model_dump(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# ================================================================== #
# BALE CONSUMPTION LOG                                                 #
# ================================================================== #

@router.get("/mixing/bale-consumption")
async def list_bale_consumption(
    mill_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    fiber_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(BaleConsumptionLog).where(BaleConsumptionLog.mill_id == effective_mill_id)
    if date:
        q = q.where(BaleConsumptionLog.date == date)
    if fiber_type:
        q = q.where(BaleConsumptionLog.fiber_type == fiber_type)
    q = q.order_by(BaleConsumptionLog.date.desc())
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [BaleConsumptionOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"mixing.bale-consumption list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/mixing/bale-consumption", response_model=BaleConsumptionOut)
async def create_bale_consumption(
    req: BaleConsumptionCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    record = BaleConsumptionLog(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        **req.model_dump(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# ================================================================== #
# JCP CLEARANCES                                                       #
# ================================================================== #

@router.get("/jcp/clearances")
async def list_jcp(
    mill_id: Optional[str] = Query(None),
    lot_id: Optional[str] = Query(None),
    clearance_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(JCPClearance).where(JCPClearance.mill_id == effective_mill_id)
    if lot_id:
        q = q.where(JCPClearance.lot_id == lot_id)
    if clearance_type:
        q = q.where(JCPClearance.clearance_type == clearance_type)
    if status:
        q = q.where(JCPClearance.status == status)
    q = q.order_by(JCPClearance.created_at.desc())
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [JCPOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"jcp.list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/jcp/clearances", response_model=JCPOut)
async def create_jcp(
    req: JCPCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    jcp = JCPClearance(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        lot_id=req.lot_id,
        lot_no=req.lot_no,
        clearance_type=req.clearance_type,
        remarks=req.remarks,
        created_by=current_user.name or current_user.email,
    )
    db.add(jcp)
    await db.commit()
    await db.refresh(jcp)
    return jcp


@router.patch("/jcp/clearances/{jcp_id}/approve", response_model=JCPOut)
async def approve_jcp(
    jcp_id: str,
    req: JCPApprove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    jcp = (await db.execute(select(JCPClearance).where(JCPClearance.id == jcp_id))).scalar_one_or_none()
    if not jcp:
        raise HTTPException(status_code=404, detail="JCP clearance not found")
    if req.quality_ok is not None:
        jcp.quality_ok = req.quality_ok
    if req.commercial_ok is not None:
        jcp.commercial_ok = req.commercial_ok
    if req.remarks:
        jcp.remarks = req.remarks
    # Auto-approve when both flags set
    if jcp.quality_ok and jcp.commercial_ok:
        jcp.status = "approved"
        jcp.approved_by = current_user.name or current_user.email
        jcp.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(jcp)
    return jcp


# ================================================================== #
# UTILITY BREAKDOWNS                                                   #
# ================================================================== #

@router.get("/production/utility-breakdowns")
async def list_utility_breakdowns(
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = (
        select(UtilityBreakdown)
        .where(UtilityBreakdown.mill_id == effective_mill_id)
        .order_by(UtilityBreakdown.started_at.desc())
    )
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [UtilityBreakdownOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"utility-breakdowns list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/production/utility-breakdowns", response_model=UtilityBreakdownOut)
async def create_utility_breakdown(
    req: UtilityBreakdownCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    record = UtilityBreakdown(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        utility_type=req.utility_type,
        started_at=req.started_at,
        affected_departments=req.affected_departments,
        reported_by=req.reported_by or current_user.name or current_user.email,
        remarks=req.remarks,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.patch("/production/utility-breakdowns/{breakdown_id}/resolve", response_model=UtilityBreakdownOut)
async def resolve_utility_breakdown(
    breakdown_id: str,
    req: UtilityBreakdownResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    record = (
        await db.execute(select(UtilityBreakdown).where(UtilityBreakdown.id == breakdown_id))
    ).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Utility breakdown not found")
    record.ended_at = req.ended_at
    delta = req.ended_at - record.started_at
    record.duration_min = int(delta.total_seconds() / 60)
    record.resolved_by = req.resolved_by or current_user.name or current_user.email
    if req.remarks:
        record.remarks = req.remarks
    await db.commit()
    await db.refresh(record)
    return record


# ================================================================== #
# WASTE STOCK                                                          #
# ================================================================== #

@router.get("/waste/stock")
async def list_waste_stock(
    mill_id: Optional[str] = Query(None),
    waste_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(WasteStock).where(WasteStock.mill_id == effective_mill_id)
    if waste_type:
        q = q.where(WasteStock.waste_type == waste_type)
    if status:
        q = q.where(WasteStock.status == status)
    q = q.order_by(WasteStock.date_collected.desc())
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        # Aggregate by waste_type for summary
        summary_rows = await db.execute(
            select(WasteStock.waste_type, func.sum(WasteStock.weight_kg).label("total_kg"))
            .where(WasteStock.mill_id == effective_mill_id, WasteStock.status == "in_stock")
            .group_by(WasteStock.waste_type)
        )
        summary = {r.waste_type: float(r.total_kg or 0) for r in summary_rows}
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "summary_by_type": summary,
            "data": [WasteStockOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"waste.stock list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "summary_by_type": {}, "data": []}


@router.post("/waste/stock", response_model=WasteStockOut)
async def create_waste_stock(
    req: WasteStockCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    record = WasteStock(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        **req.model_dump(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.patch("/waste/stock/{stock_id}/sell", response_model=WasteStockOut)
async def sell_waste(
    stock_id: str,
    req: WasteStockSell,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    record = (await db.execute(select(WasteStock).where(WasteStock.id == stock_id))).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Waste stock entry not found")
    if record.status == "sold":
        raise HTTPException(status_code=400, detail="Already marked as sold")
    record.status = "sold"
    record.sold_at = datetime.now(timezone.utc)
    record.sold_to = req.sold_to
    record.sale_rate = req.sale_rate
    record.sale_amount = round(record.weight_kg * req.sale_rate, 2)
    await db.commit()
    await db.refresh(record)
    return record


# ================================================================== #
# WASTE TRANSFERS                                                      #
# ================================================================== #

@router.get("/waste/transfers")
async def list_waste_transfers(
    mill_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(WasteTransfer).where(WasteTransfer.mill_id == effective_mill_id)
    if date:
        q = q.where(WasteTransfer.transfer_date == date)
    q = q.order_by(WasteTransfer.transfer_date.desc())
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [WasteTransferOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"waste.transfers list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/waste/transfers", response_model=WasteTransferOut)
async def create_waste_transfer(
    req: WasteTransferCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    record = WasteTransfer(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        **req.model_dump(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# ================================================================== #
# SPLICE QUALITY LOG                                                   #
# ================================================================== #

@router.get("/production/splice-quality")
async def list_splice_quality(
    mill_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(SpliceQualityLog).where(SpliceQualityLog.mill_id == effective_mill_id)
    if date:
        q = q.where(SpliceQualityLog.date == date)
    if shift:
        q = q.where(SpliceQualityLog.shift == shift)
    q = q.order_by(SpliceQualityLog.date.desc())
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [SpliceQualityOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"splice-quality list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/production/splice-quality", response_model=SpliceQualityOut)
async def create_splice_quality(
    req: SpliceQualityCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    rejection_pct = None
    if req.total_splices > 0:
        rejection_pct = round(req.rejected_splices / req.total_splices * 100, 3)

    record = SpliceQualityLog(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        date=req.date,
        shift=req.shift,
        machine_code=req.machine_code,
        lot_id=req.lot_id,
        lot_no=req.lot_no,
        total_splices=req.total_splices,
        rejected_splices=req.rejected_splices,
        rejection_pct=rejection_pct,
        operator=req.operator,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# ================================================================== #
# SHIFT MANPOWER PLAN                                                  #
# ================================================================== #

@router.get("/production/manpower-plan")
async def list_manpower_plan(
    mill_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    q = select(ShiftManpowerPlan).where(ShiftManpowerPlan.mill_id == effective_mill_id)
    if date:
        q = q.where(ShiftManpowerPlan.date == date)
    if shift:
        q = q.where(ShiftManpowerPlan.shift == shift)
    q = q.order_by(ShiftManpowerPlan.date.desc(), ShiftManpowerPlan.shift)
    try:
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        items = (await db.execute(_paginate(q, page, page_size))).scalars().all()
        return {
            "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "data": [ManpowerPlanOut.model_validate(i).model_dump() for i in items],
        }
    except Exception as e:
        logger.error(f"manpower-plan list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/production/manpower-plan", response_model=ManpowerPlanOut)
async def upsert_manpower_plan(
    req: ManpowerPlanCreate,
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production", write=True)),
):
    effective_mill_id = await _resolve_mill(current_user, db, mill_id)
    # Upsert by (mill_id, date, shift, department)
    existing = (
        await db.execute(
            select(ShiftManpowerPlan).where(
                ShiftManpowerPlan.mill_id == effective_mill_id,
                ShiftManpowerPlan.date == req.date,
                ShiftManpowerPlan.shift == req.shift,
                ShiftManpowerPlan.department == req.department,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.planned_count = req.planned_count
        existing.actual_count = req.actual_count
        existing.supervisor = req.supervisor
        existing.remarks = req.remarks
        await db.commit()
        await db.refresh(existing)
        return existing

    record = ShiftManpowerPlan(
        id=generate_uuid(),
        mill_id=effective_mill_id,
        **req.model_dump(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record
