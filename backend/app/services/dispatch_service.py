from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from app.services.base import BaseService
from app.models.dispatch import Dispatch, DispatchItem, Vehicle, QRScan
from app.models.inventory import Lot
from app.core.error_handler import SpinFlowException, ErrorCode
from app.services.stock_service import StockLedgerService

VALID_TRANSITIONS = {
    "pending": ["loading", "cancelled"],
    "loading": ["ready", "cancelled"],
    "ready": ["dispatched", "cancelled"],
    "dispatched": [],
    "cancelled": [],
}


class DispatchService(BaseService):
    async def list_dispatches(self, status: Optional[str] = None, date: Optional[str] = None, page: int = 1, page_size: int = 20) -> dict:
        stmt = select(Dispatch).options(selectinload(Dispatch.items)).order_by(Dispatch.created_at.desc())

        if status:
            stmt = stmt.where(Dispatch.status == status)
        if date:
            stmt = stmt.where(Dispatch.date == date)

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

    async def get_dispatch(self, dispatch_id: str) -> Dispatch:
        result = await self.db.execute(
            select(Dispatch).options(selectinload(Dispatch.items)).where(Dispatch.id == dispatch_id)
        )
        dispatch = result.scalar_one_or_none()
        if not dispatch:
            raise SpinFlowException.not_found("Dispatch")
        return dispatch

    async def create_dispatch(
        self,
        date: str,
        customer: str,
        quantity_kg: float,
        order_no: Optional[str] = None,
        lot_no: Optional[str] = None,
        vehicle_no: Optional[str] = None,
        driver_name: Optional[str] = None,
        driver_phone: Optional[str] = None,
        mill_id: Optional[str] = None,
        company_id: Optional[str] = None,
    ) -> Dispatch:
        if vehicle_no:
            vehicle_result = await self.db.execute(
                select(Vehicle).where(Vehicle.vehicle_no == vehicle_no)
            )
            if not vehicle_result.scalar_one_or_none():
                raise SpinFlowException.not_found("Vehicle")

        dispatch = Dispatch(
            dispatch_no=f"DSP-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
            date=date,
            order_no=order_no,
            customer=customer,
            lot_no=lot_no,
            quantity_kg=quantity_kg,
            vehicle_no=vehicle_no,
            driver_name=driver_name,
            driver_phone=driver_phone,
            mill_id=mill_id,
            company_id=company_id,
            status="pending",
        )
        self.db.add(dispatch)
        await self.db.flush()
        await self.db.commit()

        await self._audit(
            action="create",
            entity="Dispatch",
            entity_id=dispatch.id,
            details=f"Created dispatch {dispatch.dispatch_no}",
        )
        return dispatch

    async def add_item(
        self,
        dispatch_id: str,
        lot_no: str,
        quantity_kg: float,
        bags_count: int,
        package_type: Optional[str] = None,
    ) -> DispatchItem:
        dispatch = await self.get_dispatch(dispatch_id)

        if dispatch.status == "dispatched":
            raise SpinFlowException.bad_request(
                "Cannot add items to already dispatched dispatch",
                ErrorCode.INVALID_STATE_TRANSITION,
            )

        lot_result = await self.db.execute(select(Lot).where(Lot.lot_no == lot_no))
        lot = lot_result.scalar_one_or_none()
        if not lot:
            raise SpinFlowException.not_found("Lot")

        if lot.quality_status != "approved":
            raise SpinFlowException.conflict(
                "Lot must be quality approved before dispatch",
                ErrorCode.QUALITY_NOT_APPROVED,
            )

        dispatched_bags_result = await self.db.execute(
            select(func.coalesce(func.sum(DispatchItem.package_count), 0))
            .where(DispatchItem.lot_no == lot_no)
        )
        already_dispatched = dispatched_bags_result.scalar() or 0
        available = (lot.total_bags or 0) - already_dispatched

        if bags_count > available:
            raise SpinFlowException.bad_request(
                f"Only {available} bags available for lot {lot_no}",
                ErrorCode.INSUFFICIENT_STOCK,
            )

        item = DispatchItem(
            dispatch_id=dispatch_id,
            lot_no=lot_no,
            quantity_kg=quantity_kg,
            package_type=package_type,
            package_count=bags_count,
        )
        self.db.add(item)

        dispatch.total_bags = (dispatch.total_bags or 0) + bags_count
        dispatch.total_weight_kg = (dispatch.total_weight_kg or 0) + quantity_kg

        if dispatch.status == "pending":
            dispatch.status = "loading"

        await self.db.flush()
        await self.db.commit()

        await self._audit(
            action="add_item",
            entity="DispatchItem",
            entity_id=item.id,
            details=f"Added {bags_count} bags ({quantity_kg}kg) from lot {lot_no} to dispatch {dispatch.dispatch_no}",
        )
        return item

    async def transition_status(self, dispatch_id: str, new_status: str) -> Dispatch:
        if new_status not in ("pending", "loading", "ready", "dispatched", "cancelled"):
            raise SpinFlowException.bad_request(
                f"Invalid status: {new_status}",
                ErrorCode.INVALID_VALUE,
            )

        dispatch = await self.get_dispatch(dispatch_id)
        current = dispatch.status
        allowed = VALID_TRANSITIONS.get(current, [])

        if new_status not in allowed:
            raise SpinFlowException.bad_request(
                f"Cannot transition from {current} to {new_status}",
                ErrorCode.INVALID_STATE_TRANSITION,
            )

        if new_status == "ready":
            items_result = await self.db.execute(
                select(func.count(DispatchItem.id)).where(DispatchItem.dispatch_id == dispatch_id)
            )
            item_count = items_result.scalar() or 0
            if item_count == 0:
                raise SpinFlowException.bad_request(
                    "Cannot mark as ready: no items added",
                    ErrorCode.INVALID_STATE_TRANSITION,
                )

        if new_status == "dispatched":
            if not dispatch.eway_bill_no:
                raise SpinFlowException.bad_request(
                    "E-way bill number is required before dispatch",
                    ErrorCode.EWAY_BILL_REQUIRED,
                )

            stock_service = StockLedgerService(self.db, self.current_user)
            items_result = await self.db.execute(
                select(DispatchItem).where(DispatchItem.dispatch_id == dispatch_id)
            )
            items = items_result.scalars().all()
            for item in items:
                lot_result = await self.db.execute(select(Lot).where(Lot.lot_no == item.lot_no))
                lot = lot_result.scalar_one_or_none()
                if lot:
                    await stock_service.record_move(
                        move_type="DISPATCH_OUT",
                        lot_id=lot.id,
                        warehouse_id=lot.warehouse_id or "",
                        mill_id=getattr(self.current_user, "mill_id", ""),
                        qty_out=item.package_count or 0,
                        weight_out_kg=item.quantity_kg or 0,
                        ref_doc_type="dispatch",
                        ref_doc_id=dispatch_id,
                        user_id=self.current_user.id,
                        lot_no=item.lot_no,
                    )

        dispatch.status = new_status
        if new_status == "dispatched":
            dispatch.approved_by = self.current_user.name
            dispatch.approved_at = datetime.now(timezone.utc)
        await self.db.flush()
        await self.db.commit()

        await self._audit(
            action="transition_status",
            entity="Dispatch",
            entity_id=dispatch.id,
            details=f"Dispatch {dispatch.dispatch_no} status changed from {current} to {new_status}",
            old_value=current,
            new_value=new_status,
        )
        return dispatch

    async def process_qr_scan(
        self,
        token: str,
        station: str,
        scanned_by: Optional[str] = None,
        location: Optional[str] = None,
    ) -> dict:
        lot_result = await self.db.execute(
            select(Lot).where(
                or_(Lot.qr_token == token, Lot.qr_code == token)
            )
        )
        lot = lot_result.scalar_one_or_none()

        scan = QRScan(
            token=token,
            entity_type="bag" if lot else "unrecognised",
            entity_id=lot.id if lot else "",
            station=station,
            scanned_by=scanned_by or self.current_user.name,
            location=location,
        )
        self.db.add(scan)
        await self.db.flush()
        await self.db.commit()

        await self._audit(
            action="qr_scan",
            entity="QRScan",
            entity_id=scan.id,
            details=f"QR scan at {station}: {'recognised' if lot else 'unrecognised'}",
        )

        if lot:
            return {
                "status": "recognised",
                "scan_id": scan.id,
                "lot": {
                    "id": lot.id,
                    "lot_no": lot.lot_no,
                    "type": lot.type,
                    "quantity": lot.quantity,
                    "quality_status": lot.quality_status,
                },
            }

        return {
            "status": "unrecognised",
            "scan_id": scan.id,
            "warning": "QR code not recognised in the system",
        }

    async def scan_history(self, dispatch_id: Optional[str] = None) -> List[QRScan]:
        stmt = select(QRScan).order_by(QRScan.scanned_at.desc())

        if dispatch_id:
            dispatch = await self.get_dispatch(dispatch_id)
            stmt = stmt.where(QRScan.entity_id == dispatch_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def dispatch_summary(self) -> dict:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        total_result = await self.db.execute(select(func.count(Dispatch.id)))
        total = total_result.scalar() or 0

        today_result = await self.db.execute(
            select(func.count(Dispatch.id)).where(Dispatch.date == today)
        )
        today_count = today_result.scalar() or 0

        pending_result = await self.db.execute(
            select(func.count(Dispatch.id)).where(Dispatch.status == "pending")
        )
        pending = pending_result.scalar() or 0

        dispatched_result = await self.db.execute(
            select(func.count(Dispatch.id)).where(Dispatch.status == "dispatched")
        )
        dispatched = dispatched_result.scalar() or 0

        kg_result = await self.db.execute(
            select(func.coalesce(func.sum(Dispatch.quantity_kg), 0))
        )
        total_kg = float(kg_result.scalar() or 0)

        return {
            "total_dispatches": total,
            "today_count": today_count,
            "pending": pending,
            "dispatched": dispatched,
            "total_quantity_kg": total_kg,
        }
