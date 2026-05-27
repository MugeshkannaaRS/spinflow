import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timezone

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, log_audit, get_mill_scope
from app.models.user import User
from app.models.inventory import Lot, StockMovement, Warehouse
from app.models.masters import Mill
from app.schemas.inventory import (
    LotCreate, LotOut, LotListResponse,
    WarehouseCreate, WarehouseOut,
    StockMovementCreate, StockMovementOut,
)

router = APIRouter()


@router.get("/inventory/lots")
async def get_lots(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("inventory")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Lot)
    if scope["mill_id"]:
        stmt = stmt.where(Lot.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    stmt = stmt.order_by(Lot.created_at.desc())
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
            "data": [LotOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"inventory.lots list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.get("/inventory/transfers")
async def get_transfers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("inventory")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(StockMovement).outerjoin(Lot, StockMovement.lot_id == Lot.id)
    if scope["mill_id"]:
        stmt = stmt.where(Lot.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    stmt = stmt.order_by(StockMovement.created_at.desc())
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
            "data": [StockMovementOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"inventory.transfers list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/inventory/transfers", response_model=StockMovementOut)
async def create_transfer(
    req: StockMovementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("inventory", write=True)),
):
    scope = await get_mill_scope(current_user)
    loc = await db.execute(select(Warehouse).where(Warehouse.name == req.from_location))
    from_wh = loc.scalar_one_or_none()
    loc2 = await db.execute(select(Warehouse).where(Warehouse.name == req.to_location))
    to_wh = loc2.scalar_one_or_none()
    if req.from_location:
        stmt = select(Warehouse).where(Warehouse.name == req.from_location)
        if scope["mill_id"]:
            stmt = stmt.where(Warehouse.mill_id == scope["mill_id"])
        elif scope["company_id"]:
            stmt = stmt.join(Mill, Warehouse.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
        from_result = await db.execute(stmt)
        if not from_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Source warehouse not in your scope")
    if req.to_location:
        stmt = select(Warehouse).where(Warehouse.name == req.to_location)
        if scope["mill_id"]:
            stmt = stmt.where(Warehouse.mill_id == scope["mill_id"])
        elif scope["company_id"]:
            stmt = stmt.join(Mill, Warehouse.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
        to_result = await db.execute(stmt)
        if not to_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Destination warehouse not in your scope")
    movement = StockMovement(
        lot_no=req.bag_id,
        from_location=req.from_location,
        to_location=req.to_location,
        quantity=0,
        unit="kg",
        type=req.movement_type.lower(),
        transferred_by=current_user.name,
    )
    db.add(movement)
    await db.flush()
    return movement


@router.post("/inventory/lots", response_model=LotOut)
async def create_lot(
    req: LotCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("inventory", write=True)),
):
    scope = await get_mill_scope(current_user)
    mill_id = scope["mill_id"] or current_user.mill_id
    if not mill_id:
        if scope["company_id"]:
            raise HTTPException(status_code=400, detail="mill_id is required for MILL_OWNER")
        mill_id = ""
    lot = Lot(
        lot_no=req.lot_no or "",
        type=req.count,
        quantity=float(req.total_bags * req.bag_weight_kg),
        total_bags=req.total_bags,
        warehouse_id=req.warehouse_id,
        unit="kg",
        status="in-stock",
        mill_id=mill_id,
    )
    db.add(lot)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "create", "Lot", lot.id,
                    f"Lot {lot.lot_no} created")
    return lot


@router.get("/inventory/warehouses")
async def get_warehouses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("inventory")),
):
    scope = await get_mill_scope(current_user)
    query = select(Warehouse).order_by(Warehouse.name)
    if scope["mill_id"]:
        query = query.where(Warehouse.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        query = query.join(Mill, Warehouse.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    try:
        result = await db.execute(query)
        return [WarehouseOut.model_validate(item).model_dump() for item in result.scalars().all()]
    except Exception as e:
        logger.error(f"inventory.warehouses list error: {e}")
        return []


@router.post("/inventory/warehouses", response_model=WarehouseOut)
async def create_warehouse(
    req: WarehouseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("inventory", write=True)),
):
    scope = await get_mill_scope(current_user)
    mill_id = scope["mill_id"] or current_user.mill_id
    if not mill_id and scope["company_id"]:
        raise HTTPException(status_code=400, detail="mill_id is required for MILL_OWNER")
    wh = Warehouse(
        code=req.code,
        name=req.name,
        location=req.location,
        capacity_bags=req.capacity_bags,
        is_active=True,
        mill_id=mill_id,
    )
    db.add(wh)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "create", "Warehouse", wh.id,
                    f"Warehouse {wh.name} created")
    return wh
