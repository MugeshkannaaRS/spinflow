from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.session import get_db
from app.core.deps import get_current_user, require_module
from app.models.user import User
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
    svc = StockLedgerService(db, current_user)
    effective_mill_id = mill_id or getattr(current_user, "mill_id", "")
    return await svc.stock_snapshot(
        mill_id=effective_mill_id,
        fg_state=fg_state,
        warehouse_id=warehouse_id,
        yarn_count=yarn_count,
    )


@router.get("/stock/lot/{lot_id}/history")
async def lot_history(
    lot_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stock")),
):
    svc = StockLedgerService(db, current_user)
    return await svc.ledger_history(lot_id, limit=limit)


@router.get("/stock/lot/{lot_id}/balance")
async def lot_balance(
    lot_id: str,
    warehouse_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stock")),
):
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
