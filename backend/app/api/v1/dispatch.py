import logging
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, asc, desc
from datetime import datetime, timezone
from typing import Optional, Any, Dict

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import require_module, get_mill_scope
from app.models.user import User
from app.models.dispatch import Dispatch
from app.models.lotrac import Trip
from app.models.inventory import Lot
from app.models.masters import Mill, Customer, MasterVehicle
from app.models.inventory import Warehouse
from app.schemas.dispatch import (
    DispatchResponse, DispatchCreate, DispatchStatusUpdate, QRScanRequest,
)
from app.schemas.lotrac import TripOut
from app.services.dispatch_service import DispatchService

router = APIRouter()


@router.get("/dispatch/trips")
async def get_trips(
    mill_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    sort_by: Optional[str] = Query(None),
    sort_dir: Optional[str] = Query("desc"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    stmt = select(Trip)
    if effective_mill_id:
        stmt = stmt.where(Trip.mill_id == effective_mill_id)
    elif scope["company_id"]:
        from app.models.masters import Mill as MillModel
        stmt = stmt.join(MillModel, Trip.mill_id == MillModel.id).where(MillModel.company_id == scope["company_id"])
    if status:
        stmt = stmt.where(Trip.status == status)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            Trip.trip_no.ilike(pattern) |
            Trip.vehicle_no.ilike(pattern) |
            Trip.driver_name.ilike(pattern) |
            Trip.destination_name.ilike(pattern)
        )
    sort_map = {
        "trip_no": Trip.trip_no,
        "status": Trip.status,
        "vehicle_no": Trip.vehicle_no,
        "driver_name": Trip.driver_name,
        "destination_name": Trip.destination_name,
        "planned_bags": Trip.planned_bags,
        "planned_weight_kg": Trip.planned_weight_kg,
        "created_at": Trip.created_at,
    }
    sort_col = sort_map.get(sort_by) if sort_by else Trip.created_at
    order_fn = desc if sort_dir == "desc" else asc
    stmt = stmt.order_by(order_fn(sort_col))
    try:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": [TripOut.model_validate(t).model_dump() for t in items],
        }
    except Exception as e:
        logger.error(f"dispatch.trips list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/dispatch/trips")
async def create_trip(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    try:
        scope = await get_mill_scope(current_user, db)
        mill_id = scope["mill_id"] or ""
        if not mill_id:
            raise HTTPException(status_code=400, detail="Mill ID required")
        wh_result = await db.execute(
            select(Warehouse.id).where(Warehouse.mill_id == mill_id).limit(1)
        )
        warehouse = wh_result.scalar_one_or_none()
        if not warehouse:
            raise HTTPException(status_code=400, detail="No warehouse found for this mill. Create a warehouse first.")
        now = datetime.now(timezone.utc)
        trip_no = f"DSP-{now.strftime('%y%m%d-%H%M%S')}"
        trip = Trip(
            mill_id=mill_id,
            trip_no=trip_no,
            from_warehouse_id=warehouse,
            vehicle_no=body.get("vehicle_no"),
            driver_name=body.get("driver_name"),
            driver_mobile=body.get("driver_phone"),
            customer_id=body.get("customer_id"),
            notes=body.get("notes"),
            planned_bags=0,
            planned_weight_kg=0,
            created_by=current_user.id,
            departure_at=datetime.fromisoformat(body["dispatch_date"].replace("Z", "+00:00")) if body.get("dispatch_date") else None,
        )
        db.add(trip)
        await db.flush()
        await db.commit()
        return TripOut.model_validate(trip).model_dump()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"dispatch.create_trip error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dispatch/orders")
async def get_dispatches(
    mill_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    query = select(Dispatch).outerjoin(Lot, Dispatch.lot_id == Lot.id)
    if effective_mill_id:
        query = query.where(Lot.mill_id == effective_mill_id)
    elif scope["company_id"]:
        query = query.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if status:
        query = query.where(Dispatch.status == status)
    if date:
        query = query.where(Dispatch.date == date)
    query = query.order_by(Dispatch.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = list(result.scalars().all())
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "data": [DispatchResponse.model_validate(item).model_dump() for item in items],
            }
    except Exception as e:
        logger.error(f"dispatch.orders list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/dispatch/orders", response_model=DispatchResponse)
async def create_dispatch(
    req: DispatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    svc = DispatchService(db, current_user)
    return await svc.create_dispatch(
        date=req.date,
        customer=req.customer,
        quantity_kg=req.quantity_kg,
        order_no=req.order_no,
        lot_no=req.lot_no,
        vehicle_no=req.vehicle_no,
        driver_name=req.driver_name,
        driver_phone=req.driver_phone,
        mill_id=scope.get("mill_id"),
        company_id=scope.get("company_id"),
    )


@router.get("/dispatch/orders/{dispatch_id}", response_model=DispatchResponse)
async def get_dispatch(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    svc = DispatchService(db, current_user)
    return await svc.get_dispatch(dispatch_id)


@router.post("/dispatch/orders/{dispatch_id}/items")
async def add_item(
    dispatch_id: str,
    lot_no: str = Body(...),
    quantity_kg: float = Body(...),
    bags_count: int = Body(...),
    package_type: Optional[str] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    svc = DispatchService(db, current_user)
    item = await svc.add_item(dispatch_id, lot_no, quantity_kg, bags_count, package_type)
    return item


@router.patch("/dispatch/orders/{dispatch_id}/status", response_model=DispatchResponse)
async def update_status(
    dispatch_id: str,
    new_status: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    svc = DispatchService(db, current_user)
    return await svc.transition_status(dispatch_id, new_status)


@router.patch("/dispatch/orders/{dispatch_id}/confirm", response_model=DispatchResponse)
async def confirm_dispatch(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    svc = DispatchService(db, current_user)
    return await svc.transition_status(dispatch_id, "dispatched")


@router.put("/dispatch/orders/{dispatch_id}/status", response_model=DispatchResponse)
async def update_status_legacy(
    dispatch_id: str,
    req: DispatchStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    svc = DispatchService(db, current_user)
    return await svc.transition_status(dispatch_id, req.status)


@router.post("/dispatch/qr-scan")
async def qr_scan(
    req: QRScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    svc = DispatchService(db, current_user)
    return await svc.process_qr_scan(
        token=req.token,
        station=req.station,
        scanned_by=req.scanned_by,
        location=req.location,
    )


@router.get("/dispatch/orders/{dispatch_id}/scans")
async def get_scan_history(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    try:
        svc = DispatchService(db, current_user)
        return await svc.scan_history(dispatch_id)
    except Exception as e:
        logger.error(f"dispatch.scan_history error: {e}")
        return []


@router.put("/dispatch/trips/{trip_id}/dispatch")
async def dispatch_trip(
    trip_id: str,
    vehicle_no: str = Query(None),
    driver_name: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Trip).where(Trip.id == trip_id)
    if scope["mill_id"]:
        stmt = stmt.where(Trip.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Trip.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.status not in ("draft", "loading"):
        raise HTTPException(status_code=400, detail=f"Cannot dispatch trip in status: {trip.status}")
    trip.status = "dispatched"
    trip.departure_at = datetime.now(timezone.utc)
    if vehicle_no:
        trip.vehicle_no = vehicle_no
    if driver_name:
        trip.driver_name = driver_name
    await db.flush()
    await db.commit()
    return {"id": trip.id, "status": trip.status, "message": "Trip dispatched"}


@router.put("/dispatch/trips/{trip_id}/deliver")
async def deliver_trip(
    trip_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Trip).where(Trip.id == trip_id)
    if scope["mill_id"]:
        stmt = stmt.where(Trip.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Trip.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.status != "dispatched":
        raise HTTPException(status_code=400, detail=f"Cannot deliver trip in status: {trip.status}")
    trip.status = "delivered"
    trip.delivered_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    return {"id": trip.id, "status": trip.status, "message": "Trip delivered"}


@router.get("/dispatch/summary/today")
async def dispatch_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    svc = DispatchService(db, current_user)
    return await svc.dispatch_summary()


@router.get("/dispatch/page-init")
async def dispatch_page_init(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    result: Dict[str, Any] = {}
    try:
        cust_query = select(Customer.id, Customer.name, Customer.code).where(Customer.is_active == True)
        if effective_mill_id:
            cust_query = cust_query.where(Customer.mill_id == effective_mill_id)
        cust_rows = await db.execute(cust_query.order_by(Customer.name))
        result["customers"] = [{"id": r.id, "name": r.name, "code": r.code} for r in cust_rows]
    except Exception as e:
        logger.error(f"dispatch.page-init customers error: {e}")
        result["customers"] = []
    try:
        veh_query = select(MasterVehicle.id, MasterVehicle.vehicle_no, MasterVehicle.vehicle_type, MasterVehicle.driver_name).where(
            MasterVehicle.is_active == True
        )
        if effective_mill_id:
            veh_query = veh_query.where(MasterVehicle.mill_id == effective_mill_id)
        veh_rows = await db.execute(veh_query.order_by(MasterVehicle.vehicle_no))
        result["vehicles"] = [{"id": r.id, "vehicle_no": r.vehicle_no, "vehicle_type": r.vehicle_type, "driver_name": r.driver_name} for r in veh_rows]
    except Exception as e:
        logger.error(f"dispatch.page-init vehicles error: {e}")
        result["vehicles"] = []
    return result


# ---------------------------------------------------------------------------
# DELETE endpoints
# ---------------------------------------------------------------------------

@router.delete("/dispatch/orders/{dispatch_id}")
async def delete_dispatch_order(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    """Cancel a dispatch order (status=cancelled). Only pending/draft orders."""
    scope = await get_mill_scope(current_user, db)
    stmt = select(Dispatch).where(Dispatch.id == dispatch_id)
    if scope.get("mill_id"):
        stmt = stmt.where(Dispatch.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        stmt = stmt.join(Mill, Dispatch.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Dispatch order not found")
    if order.status not in ("pending", "draft", "created"):
        raise HTTPException(status_code=400, detail="Only pending orders can be cancelled")
    order.status = "cancelled"
    await db.flush()
    await db.commit()
    return {"message": "Dispatch order cancelled", "id": dispatch_id}
