from typing import Optional, List
from datetime import datetime, timezone, date
import random
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from app.services.base import BaseService
from app.models.stock import SalesOrder, SalesOrderLine
from app.models.inventory import Lot
from app.services.stock_service import StockLedgerService
from app.core.error_handler import SpinFlowException, ErrorCode


def _generate_so_no() -> str:
    today = date.today()
    rand = random.randint(10000, 99999)
    return f"SO-{today.strftime('%y%m%d')}-{rand}"


class SalesOrderService(BaseService[SalesOrder]):
    async def list_orders(
        self,
        *,
        mill_id: str,
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        stmt = (
            select(SalesOrder)
            .options(selectinload(SalesOrder.lines))
            .where(SalesOrder.mill_id == mill_id)
            .order_by(SalesOrder.created_at.desc())
        )
        if status:
            stmt = stmt.where(SalesOrder.status == status)
        if customer_id:
            stmt = stmt.where(SalesOrder.customer_id == customer_id)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        items = list(result.scalars().all())
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": items,
        }

    async def create_order(
        self,
        *,
        mill_id: str,
        customer_id: str,
        order_date: str,
        delivery_date: Optional[str] = None,
        yarn_count: Optional[str] = None,
        notes: Optional[str] = None,
        incoterms: Optional[str] = None,
        lines: List[dict],
        creator_id: str,
        creator_role: str,
    ) -> dict:
        total_bags = sum(l["bags_ordered"] for l in lines)
        total_weight = sum(l["weight_kg"] for l in lines)
        total_value = None
        rate_per_kg = None

        if lines and lines[0].get("rate_per_kg"):
            rate_per_kg = lines[0]["rate_per_kg"]
            total_value = total_weight * rate_per_kg

        so = SalesOrder(
            mill_id=mill_id,
            so_no=_generate_so_no(),
            customer_id=customer_id,
            status="draft",
            order_date=order_date,
            delivery_date=delivery_date,
            yarn_count=yarn_count,
            total_bags=total_bags,
            total_weight_kg=total_weight,
            rate_per_kg=rate_per_kg,
            total_value=total_value,
            incoterms=incoterms,
            notes=notes,
            created_by=creator_id,
        )
        self.db.add(so)
        await self.db.flush()

        for l in lines:
            line = SalesOrderLine(
                so_id=so.id,
                lot_id=l["lot_id"],
                warehouse_id=l["warehouse_id"],
                bags_ordered=l["bags_ordered"],
                weight_kg=l["weight_kg"],
                rate_per_kg=l.get("rate_per_kg"),
                line_amount=(l.get("rate_per_kg") or 0) * l["weight_kg"] if l.get("rate_per_kg") else None,
            )
            self.db.add(line)
        await self.db.flush()

        await self._audit(
            action="create",
            entity="SalesOrder",
            entity_id=so.id,
            details=f"Created sales order {so.so_no} with {len(lines)} lines",
        )

        return await self._load_order(so.id)

    async def update_order(
        self,
        so_id: str,
        *,
        customer_id: Optional[str] = None,
        order_date: Optional[str] = None,
        delivery_date: Optional[str] = None,
        yarn_count: Optional[str] = None,
        notes: Optional[str] = None,
        incoterms: Optional[str] = None,
        lines: Optional[List[dict]] = None,
        updater_id: str = "",
    ) -> dict:
        result = await self.db.execute(
            select(SalesOrder)
            .options(selectinload(SalesOrder.lines))
            .where(SalesOrder.id == so_id)
        )
        so = result.scalar_one_or_none()
        if not so:
            raise SpinFlowException.not_found("SalesOrder")

        if customer_id is not None:
            so.customer_id = customer_id
        if order_date is not None:
            so.order_date = order_date
        if delivery_date is not None:
            so.delivery_date = delivery_date
        if yarn_count is not None:
            so.yarn_count = yarn_count
        if notes is not None:
            so.notes = notes
        if incoterms is not None:
            so.incoterms = incoterms

        if lines is not None:
            # Build new lines first, THEN delete old ones.
            # This avoids data loss if flush fails between delete and insert.
            new_line_objs = []
            for l in lines:
                new_line_objs.append(SalesOrderLine(
                    so_id=so.id,
                    lot_id=l["lot_id"],
                    warehouse_id=l["warehouse_id"],
                    bags_ordered=l["bags_ordered"],
                    weight_kg=l["weight_kg"],
                    rate_per_kg=l.get("rate_per_kg"),
                    line_amount=(l.get("rate_per_kg") or 0) * l["weight_kg"] if l.get("rate_per_kg") else None,
                ))

            # Delete existing lines only after new objects are ready
            for old_line in list(so.lines):
                await self.db.delete(old_line)
            await self.db.flush()  # commit deletes before inserting to avoid PK conflicts

            for new_line in new_line_objs:
                self.db.add(new_line)

            total_bags = sum(l["bags_ordered"] for l in lines)
            total_weight = sum(l["weight_kg"] for l in lines)
            so.total_bags = total_bags
            so.total_weight_kg = total_weight
            if lines and lines[0].get("rate_per_kg"):
                so.rate_per_kg = lines[0]["rate_per_kg"]
                so.total_value = total_weight * so.rate_per_kg
            else:
                so.rate_per_kg = None
                so.total_value = None

        await self.db.flush()
        return await self._load_order(so.id)

    async def confirm_order(
        self,
        so_id: str,
        *,
        confirmer_id: str,
        confirmer_role: str,
    ) -> dict:
        result = await self.db.execute(
            select(SalesOrder)
            .options(selectinload(SalesOrder.lines))
            .where(SalesOrder.id == so_id)
        )
        so = result.scalar_one_or_none()
        if not so:
            raise SpinFlowException.not_found("SalesOrder")

        if so.status != "draft":
            raise SpinFlowException.bad_request(
                f"Cannot confirm order in status '{so.status}'",
                ErrorCode.INVALID_STATE_TRANSITION,
            )

        if so.created_by == confirmer_id:
            raise SpinFlowException.forbidden(
                "Cannot confirm your own order — separation of duties required"
            )

        stock_service = StockLedgerService(self.db, self.current_user)

        avail_keys = [(line.lot_id, line.warehouse_id) for line in so.lines]
        avail_map = await stock_service.get_available_batch(avail_keys)

        for line in so.lines:
            available = avail_map.get((line.lot_id, line.warehouse_id), 0.0)
            if available < line.bags_ordered:
                lot_result = await self.db.execute(select(Lot).where(Lot.id == line.lot_id))
                lot = lot_result.scalar_one_or_none()
                lot_no = lot.lot_no if lot else line.lot_id
                raise SpinFlowException(
                    status_code=400,
                    code=ErrorCode.INSUFFICIENT_STOCK,
                    message=f"Lot {lot_no}: only {available:.0f} bags available, {line.bags_ordered} requested",
                )

        for line in so.lines:
            await stock_service.record_move(
                move_type="SALES_RESERVED",
                lot_id=line.lot_id,
                warehouse_id=line.warehouse_id,
                mill_id=so.mill_id,
                qty_in=line.bags_ordered,
                weight_in_kg=line.weight_kg,
                ref_doc_type="sales_order",
                ref_doc_id=so_id,
                user_id=confirmer_id,
            )
            line.bags_reserved = line.bags_ordered

        so.status = "confirmed"
        so.confirmed_by = confirmer_id
        so.confirmed_at = datetime.now(timezone.utc)
        await self.db.flush()

        await self._audit(
            action="confirm",
            entity="SalesOrder",
            entity_id=so.id,
            details=f"Confirmed sales order {so.so_no}",
            new_value="confirmed",
        )

        return await self._load_order(so.id)

    async def cancel_order(
        self,
        so_id: str,
        *,
        canceller_id: str,
        canceller_role: str,
        reason: str,
    ) -> dict:
        result = await self.db.execute(
            select(SalesOrder)
            .options(selectinload(SalesOrder.lines))
            .where(SalesOrder.id == so_id)
        )
        so = result.scalar_one_or_none()
        if not so:
            raise SpinFlowException.not_found("SalesOrder")

        if so.status not in ("draft", "confirmed"):
            raise SpinFlowException.bad_request(
                f"Cannot cancel order in status '{so.status}'",
                ErrorCode.INVALID_STATE_TRANSITION,
            )

        if so.status == "confirmed":
            stock_service = StockLedgerService(self.db, self.current_user)
            for line in so.lines:
                if line.bags_reserved > 0:
                    await stock_service.record_move(
                        move_type="SALES_RESERVATION_RELEASED",
                        lot_id=line.lot_id,
                        warehouse_id=line.warehouse_id,
                        mill_id=so.mill_id,
                        qty_out=line.bags_reserved,
                        weight_out_kg=line.weight_kg,
                        ref_doc_type="sales_order",
                        ref_doc_id=so_id,
                        user_id=canceller_id,
                    )

        so.status = "cancelled"
        so.cancelled_by = canceller_id
        so.cancelled_at = datetime.now(timezone.utc)
        await self.db.flush()

        await self._audit(
            action="cancel",
            entity="SalesOrder",
            entity_id=so.id,
            details=f"Cancelled sales order {so.so_no}: {reason}",
            new_value="cancelled",
        )

        return await self._load_order(so.id)

    async def get_order(self, so_id: str) -> dict:
        return await self._load_order(so_id)

    async def _load_order(self, so_id: str) -> dict:
        result = await self.db.execute(
            select(SalesOrder)
            .options(selectinload(SalesOrder.lines))
            .where(SalesOrder.id == so_id)
        )
        so = result.scalar_one_or_none()
        if not so:
            raise SpinFlowException.not_found("SalesOrder")

        stock_service = StockLedgerService(self.db, self.current_user)
        avail_keys = [(line.lot_id, line.warehouse_id) for line in so.lines]
        avail_map = await stock_service.get_available_batch(avail_keys)
        lines_out = []
        for line in so.lines:
            available = avail_map.get((line.lot_id, line.warehouse_id), 0.0)
            lines_out.append({
                "id": line.id,
                "so_id": line.so_id,
                "lot_id": line.lot_id,
                "warehouse_id": line.warehouse_id,
                "bags_ordered": line.bags_ordered,
                "bags_delivered": line.bags_delivered,
                "bags_reserved": line.bags_reserved,
                "weight_kg": line.weight_kg,
                "rate_per_kg": line.rate_per_kg,
                "line_amount": line.line_amount,
                "status": line.status,
                "available_qty": available,
            })

        return {
            "id": so.id,
            "mill_id": so.mill_id,
            "so_no": so.so_no,
            "customer_id": so.customer_id,
            "status": so.status,
            "order_date": so.order_date,
            "delivery_date": so.delivery_date,
            "yarn_count": so.yarn_count,
            "total_bags": so.total_bags,
            "total_weight_kg": so.total_weight_kg,
            "rate_per_kg": so.rate_per_kg,
            "total_value": so.total_value,
            "incoterms": so.incoterms,
            "notes": so.notes,
            "confirmed_by": so.confirmed_by,
            "confirmed_at": so.confirmed_at.isoformat() if so.confirmed_at else None,
            "cancelled_by": so.cancelled_by,
            "cancelled_at": so.cancelled_at.isoformat() if so.cancelled_at else None,
            "created_by": so.created_by,
            "created_at": so.created_at.isoformat() if so.created_at else None,
            "updated_at": so.updated_at.isoformat() if so.updated_at else None,
            "lines": lines_out,
        }
