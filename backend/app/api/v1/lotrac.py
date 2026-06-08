import logging
from fastapi import APIRouter, Depends, Query, Body, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module
from app.models.user import User
from app.services.trip_service import TripService
from app.schemas.lotrac import (
    TripCreate, TripOut, TripListResponse,
    LoaderScanRequest, ReceiverScanRequest, ScanResult, TripScanLogOut,
)
from app.models.inventory import InventoryBag
from app.core.qr_signing import generate_qr_payload
from sqlalchemy import select

router = APIRouter()


SCANNER_ROLES = {"loader", "dispatch_clerk", "shift_supervisor", "warehouse_manager", "SUPER_ADMIN", "MILL_OWNER"}


@router.get("/trips", response_model=TripListResponse)
async def list_trips(
    status: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac")),
):
    try:
        svc = TripService(db, current_user)
        mill_id = getattr(current_user, "mill_id", "")
        return await svc.list_trips(
            mill_id=mill_id, status=status, customer_id=customer_id,
            page=page, page_size=page_size,
        )
    except Exception as e:
        logger.error(f"trips list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/trips", response_model=dict)
async def create_trip(
    req: TripCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac", write=True)),
):
    svc = TripService(db, current_user)
    result = await svc.create_trip(
        mill_id=req.mill_id,
        sales_order_id=req.sales_order_id,
        vehicle_id=req.vehicle_id,
        vehicle_no=req.vehicle_no,
        driver_name=req.driver_name,
        driver_mobile=req.driver_mobile,
        from_warehouse_id=req.from_warehouse_id,
        destination_route_id=req.destination_route_id,
        destination_name=req.destination_name,
        customer_id=req.customer_id,
        planned_bags=req.planned_bags,
        planned_weight_kg=req.planned_weight_kg,
        bag_ids=req.bag_ids,
        notes=req.notes,
        creator_id=current_user.id,
        creator_role=current_user.role_rel.code if current_user.role_rel else "",
    )
    return result


@router.get("/trips/{trip_id}", response_model=TripOut)
async def get_trip(
    trip_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac")),
):
    svc = TripService(db, current_user)
    return await svc.get_trip_detail(trip_id)


@router.post("/trips/{trip_id}/start-loading", response_model=dict)
async def start_loading(
    trip_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac", write=True)),
):
    svc = TripService(db, current_user)
    return await svc.start_loading(
        trip_id,
        loader_id=current_user.id,
        loader_role=current_user.role_rel.code if current_user.role_rel else "",
    )


@router.post("/trips/{trip_id}/loader-scan", response_model=ScanResult)
async def loader_scan(
    trip_id: str,
    req: LoaderScanRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac", write=True)),
):
    svc = TripService(db, current_user)
    role = current_user.role_rel.code if current_user.role_rel else ""
    result = await svc.process_loader_scan(
        trip_id, req.qr_string,
        scanner_id=current_user.id,
        scanner_role=role,
        device_info=req.device_info,
        ip_address=request.client.host if request.client else "0.0.0.0",
    )
    return result


@router.post("/trips/{trip_id}/depart", response_model=dict)
async def depart_trip(
    trip_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac", write=True)),
):
    svc = TripService(db, current_user)
    return await svc.depart_trip(
        trip_id,
        user_id=current_user.id,
        user_role=current_user.role_rel.code if current_user.role_rel else "",
    )


@router.post("/trips/{trip_id}/receiver-scan", response_model=ScanResult)
async def receiver_scan(
    trip_id: str,
    req: ReceiverScanRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac", write=True)),
):
    svc = TripService(db, current_user)
    role = current_user.role_rel.code if current_user.role_rel else ""
    result = await svc.process_receiver_scan(
        trip_id, req.qr_string,
        scanner_id=current_user.id,
        scanner_role=role,
        scanned_route_id=req.scanned_route_id,
        device_info=req.device_info,
        ip_address=request.client.host if request.client else "0.0.0.0",
    )
    return result


@router.post("/trips/{trip_id}/confirm-pod", response_model=dict)
async def confirm_pod(
    trip_id: str,
    notes: Optional[str] = Body(None, embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac", write=True)),
):
    svc = TripService(db, current_user)
    return await svc.confirm_pod(
        trip_id,
        confirmer_id=current_user.id,
        confirmer_role=current_user.role_rel.code if current_user.role_rel else "",
        notes=notes,
    )


@router.get("/trips/{trip_id}/scan-log", response_model=list[TripScanLogOut])
async def get_scan_log(
    trip_id: str,
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("lotrac")),
):
    try:
        svc = TripService(db, current_user)
        return await svc.get_scan_log(trip_id, limit=limit)
    except Exception as e:
        logger.error(f"trips.scan_log error: {e}")
        return []


@router.post("/qr/generate/{bag_id}", response_model=dict)
async def generate_qr_for_bag(
    bag_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("inventory", write=True)),
):
    result = await db.execute(select(InventoryBag).where(InventoryBag.id == bag_id))
    bag = result.scalar_one_or_none()
    if not bag:
        from app.core.error_handler import SpinFlowException
        raise SpinFlowException.not_found("Bag")

    qr = generate_qr_payload(
        bag_id=bag.id,
        lot_id=bag.lot_id,
        lot_no=bag.lot_no,
        bag_no=bag.bag_no,
        yarn_count=bag.yarn_count or "",
        weight_kg=bag.weight_kg or 0,
        mill_id=bag.mill_id,
        warehouse_id=bag.warehouse_id or "",
    )
    bag.qr_code = qr
    await db.flush()
    return {"qr_code": qr, "bag_id": bag.id, "bag_no": bag.bag_no}
