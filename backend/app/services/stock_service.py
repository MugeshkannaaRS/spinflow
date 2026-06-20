from typing import Optional, List, Tuple, Dict
from datetime import datetime, timezone
from sqlalchemy import select, func, and_, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from app.services.base import BaseService
from app.models.stock import StockLedger, StockBalance
from app.models.inventory import Lot, Warehouse
from app.models.masters import Mill, YarnCount
from app.core.error_handler import SpinFlowException, ErrorCode


class StockLedgerService(BaseService[StockLedger]):
    async def record_move(
        self,
        *,
        mill_id: str,
        lot_id: Optional[str] = None,
        warehouse_id: str,
        move_type: str,
        qty_in: float = 0.0,
        qty_out: float = 0.0,
        weight_in_kg: float = 0.0,
        weight_out_kg: float = 0.0,
        ref_doc_type: Optional[str] = None,
        ref_doc_id: Optional[str] = None,
        user_id: str,
        shift_id: Optional[str] = None,
        notes: Optional[str] = None,
        lot_no: Optional[str] = None,
        yarn_count: Optional[str] = None,
        warehouse_code: Optional[str] = None,
    ) -> StockLedger:
        if not lot_no and lot_id:
            lot_result = await self.db.execute(select(Lot).where(Lot.id == lot_id))
            lot = lot_result.scalar_one_or_none()
            if lot:
                lot_no = lot.lot_no

        if not warehouse_code and warehouse_id:
            wh_result = await self.db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
            wh = wh_result.scalar_one_or_none()
            if wh:
                warehouse_code = wh.code

        ledger = StockLedger(
            mill_id=mill_id,
            lot_id=lot_id,
            warehouse_id=warehouse_id,
            move_type=move_type,
            qty_in=qty_in,
            qty_out=qty_out,
            weight_in_kg=weight_in_kg,
            weight_out_kg=weight_out_kg,
            ref_doc_type=ref_doc_type,
            ref_doc_id=ref_doc_id,
            lot_no=lot_no,
            yarn_count=yarn_count,
            warehouse_code=warehouse_code,
            user_id=user_id,
            shift_id=shift_id,
            notes=notes,
        )
        self.db.add(ledger)
        await self.db.flush()

        await self._update_balance(
            mill_id=mill_id,
            lot_id=lot_id,
            warehouse_id=warehouse_id,
            move_type=move_type,
            qty_in=qty_in,
            qty_out=qty_out,
            weight_in_kg=weight_in_kg,
            weight_out_kg=weight_out_kg,
        )

        role_code = self.current_user.role_rel.code if self.current_user.role_rel else "UNKNOWN"
        await self._audit(
            action="record_move",
            entity="StockLedger",
            entity_id=ledger.id,
            details=f"Stock move {move_type}: {qty_in}in/{qty_out}out on lot {lot_no or lot_id}",
        )

        return ledger

    async def _update_balance(
        self,
        mill_id: str,
        lot_id: Optional[str],
        warehouse_id: str,
        move_type: str,
        qty_in: float = 0.0,
        qty_out: float = 0.0,
        weight_in_kg: float = 0.0,
        weight_out_kg: float = 0.0,
    ) -> None:
        if not lot_id:
            return

        result = await self.db.execute(
            select(StockBalance).where(
                and_(
                    StockBalance.mill_id == mill_id,
                    StockBalance.lot_id == lot_id,
                    StockBalance.warehouse_id == warehouse_id,
                )
            )
        )
        balance = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if balance is None:
            try:
                balance = StockBalance(
                    mill_id=mill_id,
                    lot_id=lot_id,
                    warehouse_id=warehouse_id,
                    fg_state="WIP",
                    qty_on_hand=0.0,
                    qty_reserved=0.0,
                    qty_quarantine=0.0,
                    weight_on_hand_kg=0.0,
                    weight_reserved_kg=0.0,
                    last_move_at=now,
                )
                self.db.add(balance)
                await self.db.flush()
            except IntegrityError:
                await self.db.rollback()
                result = await self.db.execute(
                    select(StockBalance).where(
                        and_(
                            StockBalance.mill_id == mill_id,
                            StockBalance.lot_id == lot_id,
                            StockBalance.warehouse_id == warehouse_id,
                        )
                    )
                )
                balance = result.scalar_one()

        new_qty_on_hand = balance.qty_on_hand
        new_qty_reserved = balance.qty_reserved
        new_qty_quarantine = balance.qty_quarantine
        new_weight_on_hand_kg = balance.weight_on_hand_kg
        new_weight_reserved_kg = balance.weight_reserved_kg
        new_fg_state = balance.fg_state

        if move_type == "PRODUCTION_IN":
            new_qty_on_hand += qty_in
            new_weight_on_hand_kg += weight_in_kg
            new_fg_state = "QC_PENDING"
        elif move_type == "QC_APPROVED":
            new_fg_state = "SELLABLE"
        elif move_type == "QC_REJECTED_TO_QUARANTINE":
            new_qty_on_hand -= qty_out
            new_qty_quarantine += qty_out
            new_weight_on_hand_kg -= weight_out_kg
            new_fg_state = "QUARANTINE"
        elif move_type == "SALES_RESERVED":
            new_qty_reserved += qty_in
            new_weight_reserved_kg += weight_in_kg
            new_fg_state = "RESERVED"
        elif move_type == "SALES_RESERVATION_RELEASED":
            new_qty_reserved -= qty_out
            new_weight_reserved_kg -= weight_out_kg
            new_fg_state = "SELLABLE"
        elif move_type == "DISPATCH_OUT":
            new_qty_on_hand -= qty_out
            new_weight_on_hand_kg -= weight_out_kg
            new_fg_state = "DISPATCHED"
        elif move_type == "DELIVERY_CONFIRMED":
            new_fg_state = "DELIVERED"
        elif move_type == "RETURN_IN":
            new_qty_on_hand += qty_in
            new_weight_on_hand_kg += weight_in_kg
            new_fg_state = "SELLABLE"
        elif move_type == "TRANSFER_OUT":
            new_qty_on_hand -= qty_out
            new_weight_on_hand_kg -= weight_out_kg
        elif move_type == "TRANSFER_IN":
            new_qty_on_hand += qty_in
            new_weight_on_hand_kg += weight_in_kg
        elif move_type == "ADJUSTMENT_IN":
            new_qty_on_hand += qty_in
            new_weight_on_hand_kg += weight_in_kg
        elif move_type == "ADJUSTMENT_OUT":
            new_qty_on_hand -= qty_out
            new_weight_on_hand_kg -= weight_out_kg

        if new_qty_on_hand < 0:
            raise SpinFlowException(
                status_code=400,
                code=ErrorCode.INSUFFICIENT_STOCK,
                message=f"Insufficient stock: qty_on_hand would be {new_qty_on_hand:.1f}",
            )
        if new_qty_reserved < 0:
            raise SpinFlowException(
                status_code=400,
                code=ErrorCode.INSUFFICIENT_STOCK,
                message=f"Insufficient reserved stock: qty_reserved would be {new_qty_reserved:.1f}",
            )

        balance.qty_on_hand = new_qty_on_hand
        balance.qty_reserved = new_qty_reserved
        balance.qty_quarantine = new_qty_quarantine
        balance.weight_on_hand_kg = new_weight_on_hand_kg
        balance.weight_reserved_kg = new_weight_reserved_kg
        balance.fg_state = new_fg_state
        balance.last_move_at = now
        await self.db.flush()

    async def get_balance(self, lot_id: str, warehouse_id: str) -> Optional[StockBalance]:
        result = await self.db.execute(
            select(StockBalance).where(
                and_(
                    StockBalance.lot_id == lot_id,
                    StockBalance.warehouse_id == warehouse_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_available(self, lot_id: str, warehouse_id: str) -> float:
        balance = await self.get_balance(lot_id, warehouse_id)
        if not balance:
            return 0.0
        return balance.qty_on_hand - balance.qty_reserved

    async def get_available_batch(self, keys: List[Tuple[str, str]]) -> Dict[Tuple[str, str], float]:
        if not keys:
            return {}
        conditions = [
            and_(StockBalance.lot_id == lot_id, StockBalance.warehouse_id == wh_id)
            for lot_id, wh_id in keys
        ]
        stmt = select(StockBalance).where(or_(*conditions))
        result = await self.db.execute(stmt)
        map_by = {}
        for balance in result.scalars().all():
            map_by[(balance.lot_id, balance.warehouse_id)] = balance
        output: Dict[Tuple[str, str], float] = {}
        for lot_id, wh_id in keys:
            balance = map_by.get((lot_id, wh_id))
            output[(lot_id, wh_id)] = balance.qty_on_hand - balance.qty_reserved if balance else 0.0
        return output

    async def stock_snapshot(
        self,
        mill_id: str,
        fg_state: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        yarn_count: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict:
        base_join = (
            select(StockBalance)
            .join(Lot, StockBalance.lot_id == Lot.id)
            .join(Warehouse, StockBalance.warehouse_id == Warehouse.id)
            .outerjoin(YarnCount, and_(YarnCount.mill_id == StockBalance.mill_id, YarnCount.count == Lot.type))
            .where(StockBalance.mill_id == mill_id)
        )

        if fg_state:
            base_join = base_join.where(StockBalance.fg_state == fg_state)
        if warehouse_id:
            base_join = base_join.where(StockBalance.warehouse_id == warehouse_id)
        if yarn_count:
            base_join = base_join.where(YarnCount.count == yarn_count)

        count_stmt = select(func.count()).select_from(base_join.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        stmt = (
            select(
                StockBalance, Lot.lot_no, Lot.quality_status, Warehouse.code.label("wh_code"),
                YarnCount.count.label("yc_count"),
            )
            .join(Lot, StockBalance.lot_id == Lot.id)
            .join(Warehouse, StockBalance.warehouse_id == Warehouse.id)
            .outerjoin(YarnCount, and_(YarnCount.mill_id == StockBalance.mill_id, YarnCount.count == Lot.type))
            .where(StockBalance.mill_id == mill_id)
        )

        if fg_state:
            stmt = stmt.where(StockBalance.fg_state == fg_state)
        if warehouse_id:
            stmt = stmt.where(StockBalance.warehouse_id == warehouse_id)
        if yarn_count:
            stmt = stmt.where(YarnCount.count == yarn_count)

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(stmt)
        rows = []
        for balance, lot_no, quality_status, wh_code, yc_count in result.all():
            rows.append({
                "lot_id": balance.lot_id,
                "lot_no": lot_no or "",
                "yarn_count": yc_count or "",
                "warehouse_id": balance.warehouse_id,
                "warehouse_code": wh_code or "",
                "fg_state": balance.fg_state,
                "qty_on_hand": balance.qty_on_hand,
                "qty_reserved": balance.qty_reserved,
                "qty_available": balance.qty_on_hand - balance.qty_reserved,
                "qty_quarantine": balance.qty_quarantine,
                "weight_on_hand_kg": balance.weight_on_hand_kg,
                "last_move_at": balance.last_move_at.isoformat() if balance.last_move_at else None,
            })
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": rows,
        }

    async def ledger_history(self, lot_id: str, limit: int = 50) -> List[dict]:
        stmt = (
            select(StockLedger)
            .where(StockLedger.lot_id == lot_id)
            .order_by(StockLedger.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        rows = []
        for ledger in result.scalars().all():
            rows.append({
                "id": ledger.id,
                "mill_id": ledger.mill_id,
                "lot_id": ledger.lot_id,
                "warehouse_id": ledger.warehouse_id,
                "move_type": ledger.move_type,
                "qty_in": ledger.qty_in,
                "qty_out": ledger.qty_out,
                "weight_in_kg": ledger.weight_in_kg,
                "weight_out_kg": ledger.weight_out_kg,
                "ref_doc_type": ledger.ref_doc_type,
                "ref_doc_id": ledger.ref_doc_id,
                "lot_no": ledger.lot_no,
                "yarn_count": ledger.yarn_count,
                "warehouse_code": ledger.warehouse_code,
                "user_id": ledger.user_id,
                "shift_id": ledger.shift_id,
                "notes": ledger.notes,
                "created_at": ledger.created_at.isoformat() if ledger.created_at else None,
            })
        return rows
