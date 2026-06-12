import logging
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.masters import Mill
from app.services.stock_service import StockLedgerService

router = APIRouter()


@router.get("/stock/snapshot")
async def stock_snapshot(
    mill_id: Optional[str] = Query(None),
    fg_state: Optional[str] = Query(None),
    warehouse_id: Optional[str] = Query(None),
    yarn_count: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stock")),
):
    try:
        scope = await get_mill_scope(current_user, db)
        role_code = scope.get("role", "")
        effective_mill_id = mill_id or scope.get("mill_id") or getattr(current_user, "mill_id", "")
        if mill_id and mill_id != effective_mill_id and role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
            if mill_id:
                mill_check = await db.execute(
                    select(Mill).where(
                        Mill.id == mill_id,
                        Mill.company_id == current_user.company_id,
                    )
                )
                if not mill_check.scalar_one_or_none():
                    raise HTTPException(403, "Access denied for this mill")
                effective_mill_id = mill_id
        svc = StockLedgerService(db, current_user)
        return await svc.stock_snapshot(
            mill_id=effective_mill_id,
            fg_state=fg_state,
            warehouse_id=warehouse_id,
            yarn_count=yarn_count,
        )
    except Exception as e:
        logger.error(f"stock.snapshot error: {e}")
        return []


@router.get("/stock/lot/{lot_id}/history")
async def lot_history(
    lot_id: str,
    limit: int = Query(50, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stock")),
):
    try:
        scope = await get_mill_scope(current_user, db)
        svc = StockLedgerService(db, current_user)
        from app.models.inventory import Lot
        lot = await db.get(Lot, lot_id)
        if lot:
            if scope.get("mill_id") and str(lot.mill_id) != scope["mill_id"]:
                raise HTTPException(404, "Lot not found")
            elif scope.get("company_id"):
                mill = await db.get(Mill, str(lot.mill_id))
                if not mill or str(mill.company_id) != scope["company_id"]:
                    raise HTTPException(404, "Lot not found")
        return await svc.ledger_history(lot_id, limit=limit)
    except Exception as e:
        logger.error(f"stock.lot_history error: {e}")
        return []


@router.get("/stock/lot/{lot_id}/balance")
async def lot_balance(
    lot_id: str,
    warehouse_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stock")),
):
    scope = await get_mill_scope(current_user, db)
    from app.models.inventory import Lot
    lot = await db.get(Lot, lot_id)
    if lot:
        if scope.get("mill_id") and str(lot.mill_id) != scope["mill_id"]:
            raise HTTPException(404, "Lot not found")
        elif scope.get("company_id"):
            mill = await db.get(Mill, str(lot.mill_id))
            if not mill or str(mill.company_id) != scope["company_id"]:
                raise HTTPException(404, "Lot not found")
    svc = StockLedgerService(db, current_user)
    balance = await svc.get_balance(lot_id, warehouse_id)
    if not balance:
        return None
    return {
        "id": balance.id,
        "mill_id": balance.mill_id,
        "lot_id": balance.lot_id,
        "warehouse_id": balance.warehouse_id,
        "fg_state": balance.fg_state,
        "qty_on_hand": balance.qty_on_hand,
        "qty_reserved": balance.qty_reserved,
        "qty_available": balance.qty_on_hand - balance.qty_reserved,
        "qty_quarantine": balance.qty_quarantine,
        "weight_on_hand_kg": balance.weight_on_hand_kg,
        "weight_reserved_kg": balance.weight_reserved_kg,
        "last_move_at": balance.last_move_at.isoformat() if balance.last_move_at else None,
    }
