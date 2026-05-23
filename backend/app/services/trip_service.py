from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from app.services.base import BaseService
from app.models.lotrac import Trip, TripItem, TripScanLog
from app.models.inventory import Lot, InventoryBag, Warehouse
from app.models.masters import MasterVehicle
from app.models.stock import SalesOrder
from app.core.error_handler import SpinFlowException, ErrorCode
from app.core.qr_signing import generate_qr_payload, verify_qr_payload
from app.services.stock_service import StockLedgerService
from app.ws.notifications import manager as ws_manager


class TripService(BaseService[Trip]):
    async def list_trips(
        self, *,
        mill_id: str,
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        stmt = select(Trip).where(Trip.mill_id == mill_id).order_by(Trip.created_at.desc())

        if status:
            stmt = stmt.where(Trip.status == status)
        if customer_id:
            stmt = stmt.where(Trip.customer_id == customer_id)

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

    async def get_trip_detail(self, trip_id: str) -> Trip:
        result = await self.db.execute(
            select(Trip)
            .options(selectinload(Trip.items))
            .where(Trip.id == trip_id)
        )
        trip = result.scalar_one_or_none()
        if not trip:
            raise SpinFlowException.not_found("Trip")
        return trip

    async def create_trip(
        self, *,
        mill_id: str,
        sales_order_id: Optional[str] = None,
        vehicle_id: Optional[str] = None,
        vehicle_no: Optional[str] = None,
        driver_name: Optional[str] = None,
        driver_mobile: Optional[str] = None,
        from_warehouse_id: str,
        destination_route_id: Optional[str] = None,
        destination_name: Optional[str] = None,
        customer_id: Optional[str] = None,
        planned_bags: int,
        planned_weight_kg: float,
        bag_ids: List[str],
        notes: Optional[str] = None,
        creator_id: str,
        creator_role: str,
    ) -> dict:
        wh_result = await self.db.execute(select(Warehouse).where(Warehouse.id == from_warehouse_id))
        if not wh_result.scalar_one_or_none():
            raise SpinFlowException.not_found("Warehouse")

        if sales_order_id:
            so_result = await self.db.execute(
                select(SalesOrder).where(SalesOrder.id == sales_order_id, SalesOrder.status == "confirmed")
            )
            if not so_result.scalar_one_or_none():
                raise SpinFlowException.bad_request(
                    "Sales order not found or not confirmed",
                    ErrorCode.INVALID_VALUE,
                )

        if vehicle_id:
            v_result = await self.db.execute(select(MasterVehicle).where(MasterVehicle.id == vehicle_id))
            if not v_result.scalar_one_or_none():
                raise SpinFlowException.not_found("Vehicle")

        now = datetime.now(timezone.utc)
        trip_no = f"TRP-{now.strftime('%y%m%d')}-{now.strftime('%H%M%S%f')}"

        trip = Trip(
            mill_id=mill_id,
            trip_no=trip_no,
            sales_order_id=sales_order_id,
            vehicle_id=vehicle_id,
            vehicle_no=vehicle_no,
            driver_name=driver_name,
            driver_mobile=driver_mobile,
            from_warehouse_id=from_warehouse_id,
            destination_route_id=destination_route_id,
            destination_name=destination_name,
            customer_id=customer_id,
            status="draft",
            planned_bags=planned_bags,
            planned_weight_kg=planned_weight_kg,
            notes=notes,
            created_by=creator_id,
        )
        self.db.add(trip)
        await self.db.flush()

        for bag_id in bag_ids:
            bag_result = await self.db.execute(
                select(InventoryBag).where(InventoryBag.id == bag_id)
            )
            bag = bag_result.scalar_one_or_none()
            if not bag:
                raise SpinFlowException.not_found(f"Bag {bag_id}")

            lot_result = await self.db.execute(select(Lot).where(Lot.id == bag.lot_id))
            lot = lot_result.scalar_one_or_none()
            if lot and lot.quality_status not in ("approved",):
                raise SpinFlowException.bad_request(
                    f"Lot {lot.lot_no} is not approved for dispatch",
                    ErrorCode.QUALITY_NOT_APPROVED,
                )

            qr_code = generate_qr_payload(
                bag_id=bag.id,
                lot_id=bag.lot_id,
                lot_no=bag.lot_no,
                bag_no=bag.bag_no,
                yarn_count=bag.yarn_count or "",
                weight_kg=bag.weight_kg or 0,
                mill_id=mill_id,
                warehouse_id=from_warehouse_id,
                destination_route_id=destination_route_id,
            )

            item = TripItem(
                trip_id=trip.id,
                lot_id=bag.lot_id,
                bag_id=bag.id,
                bag_no=bag.bag_no,
                lot_no=bag.lot_no,
                yarn_count=bag.yarn_count,
                planned_weight_kg=bag.weight_kg or 0,
                qr_code=qr_code,
                item_status="pending",
            )
            self.db.add(item)

            bag.qr_code = qr_code
            bag.status = "reserved_for_trip"

        await self.db.flush()

        await self._audit(
            action="create",
            entity="Trip",
            entity_id=trip.id,
            details=f"Created trip {trip_no} with {len(bag_ids)} bags",
        )

        return {"id": trip.id, "trip_no": trip_no, "status": "draft", "total_items": len(bag_ids)}

    async def start_loading(self, trip_id: str, *, loader_id: str, loader_role: str) -> dict:
        trip = await self.get_trip_detail(trip_id)
        if trip.status != "draft":
            raise SpinFlowException.bad_request(
                f"Cannot start loading — trip is in '{trip.status}' status",
                ErrorCode.INVALID_STATE_TRANSITION,
            )
        trip.status = "loading"
        trip.loader_id = loader_id
        trip.loading_started_at = datetime.now(timezone.utc)
        await self.db.flush()

        await self._audit(
            action="start_loading",
            entity="Trip",
            entity_id=trip.id,
            details=f"Loading started for trip {trip.trip_no}",
        )
        return {"id": trip.id, "trip_no": trip.trip_no, "status": trip.status}

    async def process_loader_scan(
        self,
        trip_id: str,
        qr_string: str,
        *,
        scanner_id: str,
        scanner_role: str,
        device_info: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> dict:
        trip = await self.get_trip_detail(trip_id)
        if trip.status != "loading":
            raise SpinFlowException.bad_request(
                f"Trip is in '{trip.status}' status — must be 'loading' to scan",
                ErrorCode.INVALID_STATE_TRANSITION,
            )

        payload = verify_qr_payload(qr_string)

        item = None
        for ti in trip.items:
            if ti.bag_no == payload.get("bag_no"):
                item = ti
                break

        if not item:
            log = TripScanLog(
                trip_id=trip_id, scan_type="loader", qr_code=qr_string,
                scanned_by=scanner_id, result="not_found",
                device_info=device_info, ip_address=ip_address,
                payload_data=payload,
            )
            self.db.add(log)
            await self.db.flush()
            return {"result": "not_found", "message": "Bag not found in this trip"}

        if item.item_status == "loaded":
            log = TripScanLog(
                trip_id=trip_id, trip_item_id=item.id, scan_type="loader",
                qr_code=qr_string, scanned_by=scanner_id, result="already_scanned",
                device_info=device_info, ip_address=ip_address, payload_data=payload,
            )
            self.db.add(log)
            await self.db.flush()
            return {"result": "already_scanned", "message": "Bag already loaded"}

        weight = payload.get("weight_kg", 0)
        item.item_status = "loaded"
        item.loader_scan_at = datetime.now(timezone.utc)
        item.loader_scan_by = scanner_id
        item.loaded_weight_kg = weight

        log = TripScanLog(
            trip_id=trip_id, trip_item_id=item.id, scan_type="loader",
            qr_code=qr_string, scanned_by=scanner_id, result="success",
            device_info=device_info, ip_address=ip_address, payload_data=payload,
        )
        self.db.add(log)

        trip.loaded_bags = (trip.loaded_bags or 0) + 1
        trip.loaded_weight_kg = (trip.loaded_weight_kg or 0) + weight

        trip_complete = False
        if trip.loaded_bags >= trip.planned_bags:
            trip.status = "loaded"
            trip.loading_completed_at = datetime.now(timezone.utc)
            trip_complete = True

        await self.db.flush()

        await self._audit(
            action="loader_scan",
            entity="TripItem",
            entity_id=item.id,
            details=f"Loader scan: bag {payload.get('bag_no')} loaded on trip {trip.trip_no}",
        )

        return {
            "result": "success",
            "bag_no": payload.get("bag_no"),
            "lot_no": payload.get("lot_no"),
            "yarn_count": payload.get("yarn_count"),
            "weight_kg": weight,
            "loaded_count": trip.loaded_bags,
            "planned_count": trip.planned_bags,
            "trip_complete": trip_complete,
        }

    async def depart_trip(self, trip_id: str, *, user_id: str, user_role: str) -> dict:
        trip = await self.get_trip_detail(trip_id)
        if trip.status not in ("loaded", "loading"):
            raise SpinFlowException.bad_request(
                f"Cannot depart — trip is in '{trip.status}' status",
                ErrorCode.INVALID_STATE_TRANSITION,
            )
        trip.status = "in_transit"
        trip.departure_at = datetime.now(timezone.utc)
        await self.db.flush()

        await self._audit(
            action="depart",
            entity="Trip",
            entity_id=trip.id,
            details=f"Trip {trip.trip_no} departed",
        )
        return {"id": trip.id, "trip_no": trip.trip_no, "status": trip.status}

    async def process_receiver_scan(
        self,
        trip_id: str,
        qr_string: str,
        *,
        scanner_id: str,
        scanner_role: str,
        scanned_route_id: Optional[str] = None,
        device_info: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> dict:
        trip = await self.get_trip_detail(trip_id)
        if trip.status not in ("in_transit", "arrived"):
            raise SpinFlowException.bad_request(
                f"Trip is in '{trip.status}' status — must be 'in_transit' or 'arrived' to receive",
                ErrorCode.INVALID_STATE_TRANSITION,
            )

        payload = verify_qr_payload(qr_string)

        if (
            payload.get("destination_route_id")
            and scanned_route_id
            and str(payload["destination_route_id"]) != scanned_route_id
        ):
            item = None
            for ti in trip.items:
                if ti.bag_no == payload.get("bag_no"):
                    item = ti
                    break

            if item:
                item.item_status = "wrong_destination"
                item.wrong_destination_detected = True
                item.wrong_destination_scanned_at = datetime.now(timezone.utc)

            log = TripScanLog(
                trip_id=trip_id, trip_item_id=item.id if item else None,
                scan_type="receiver", qr_code=qr_string,
                scanned_by=scanner_id, result="wrong_destination",
                device_info=device_info, ip_address=ip_address, payload_data=payload,
            )
            self.db.add(log)
            await self.db.flush()

            await ws_manager.broadcast({
                "type": "wrong_destination",
                "trip_no": trip.trip_no,
                "bag_no": payload.get("bag_no"),
                "lot_no": payload.get("lot_no"),
                "expected_route": payload.get("destination_route_id"),
                "actual_route": scanned_route_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            return {
                "result": "wrong_destination",
                "alert": "WRONG DESTINATION — this bag is not for this location",
                "bag_no": payload.get("bag_no"),
                "expected_route": payload.get("destination_route_id"),
                "scanned_route": scanned_route_id,
            }

        item = None
        for ti in trip.items:
            if ti.bag_no == payload.get("bag_no"):
                item = ti
                break

        if not item:
            log = TripScanLog(
                trip_id=trip_id, scan_type="receiver", qr_code=qr_string,
                scanned_by=scanner_id, result="not_found",
                device_info=device_info, ip_address=ip_address, payload_data=payload,
            )
            self.db.add(log)
            await self.db.flush()
            return {"result": "not_found", "message": "Bag not found in this trip"}

        if item.item_status == "delivered":
            log = TripScanLog(
                trip_id=trip_id, trip_item_id=item.id, scan_type="receiver",
                qr_code=qr_string, scanned_by=scanner_id, result="already_scanned",
                device_info=device_info, ip_address=ip_address, payload_data=payload,
            )
            self.db.add(log)
            await self.db.flush()
            return {"result": "already_scanned", "message": "Bag already delivered"}

        weight = payload.get("weight_kg", 0)
        item.item_status = "delivered"
        item.receiver_scan_at = datetime.now(timezone.utc)
        item.receiver_scan_by = scanner_id
        item.delivered_weight_kg = weight

        log = TripScanLog(
            trip_id=trip_id, trip_item_id=item.id, scan_type="receiver",
            qr_code=qr_string, scanned_by=scanner_id, result="success",
            device_info=device_info, ip_address=ip_address, payload_data=payload,
        )
        self.db.add(log)

        trip.delivered_bags = (trip.delivered_bags or 0) + 1
        trip.delivered_weight_kg = (trip.delivered_weight_kg or 0) + weight

        trip_complete = False
        if trip.delivered_bags >= trip.planned_bags:
            trip.status = "arrived"
            trip.arrived_at = datetime.now(timezone.utc)
            trip_complete = True

            stock_svc = StockLedgerService(self.db, self.current_user)
            for ti in trip.items:
                if ti.item_status == "delivered":
                    try:
                        await stock_svc.record_move(
                            move_type="DELIVERY_CONFIRMED",
                            lot_id=ti.lot_id,
                            warehouse_id=trip.from_warehouse_id,
                            mill_id=trip.mill_id,
                            user_id=scanner_id,
                            ref_doc_type="trip",
                            ref_doc_id=trip_id,
                            lot_no=ti.lot_no,
                        )
                    except Exception:
                        pass

        await self.db.flush()

        return {
            "result": "success",
            "bag_no": payload.get("bag_no"),
            "lot_no": payload.get("lot_no"),
            "yarn_count": payload.get("yarn_count"),
            "weight_kg": weight,
            "delivered_count": trip.delivered_bags,
            "planned_count": trip.planned_bags,
            "trip_complete": trip_complete,
        }

    async def confirm_pod(
        self, trip_id: str, *, confirmer_id: str, confirmer_role: str, notes: Optional[str] = None
    ) -> dict:
        trip = await self.get_trip_detail(trip_id)
        if trip.status != "arrived":
            raise SpinFlowException.bad_request(
                f"Cannot confirm POD — trip is in '{trip.status}' status",
                ErrorCode.INVALID_STATE_TRANSITION,
            )
        trip.status = "delivered"
        trip.pod_confirmed_at = datetime.now(timezone.utc)
        trip.pod_confirmed_by = confirmer_id
        if notes:
            trip.notes = notes
        await self.db.flush()

        await self._audit(
            action="confirm_pod",
            entity="Trip",
            entity_id=trip.id,
            details=f"POD confirmed for trip {trip.trip_no}",
        )
        return {"id": trip.id, "trip_no": trip.trip_no, "status": "delivered"}

    async def get_scan_log(self, trip_id: str, limit: int = 100) -> List[dict]:
        result = await self.db.execute(
            select(TripScanLog)
            .where(TripScanLog.trip_id == trip_id)
            .order_by(TripScanLog.scanned_at.desc())
            .limit(limit)
        )
        logs = result.scalars().all()
        return [
            {
                "id": log.id,
                "trip_id": log.trip_id,
                "scan_type": log.scan_type,
                "result": log.result,
                "scanned_by": log.scanned_by,
                "scanned_at": log.scanned_at.isoformat() if log.scanned_at else None,
                "device_info": log.device_info,
                "ip_address": log.ip_address,
            }
            for log in logs
        ]
