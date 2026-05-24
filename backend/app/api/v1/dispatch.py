from fastapi import APIRouter, Depends, Query, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.dispatch import Dispatch, DispatchItem
from app.models.inventory import Lot
from app.models.masters import Mill
from app.schemas.dispatch import (
    DispatchResponse, DispatchCreate, DispatchStatusUpdate, QRScanRequest,
)
from app.services.dispatch_service import DispatchService

router = APIRouter()


@router.get("/dispatch/orders")
async def get_dispatches(
    status: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    scope = await get_mill_scope(current_user)
    query = select(Dispatch).outerjoin(Lot, Dispatch.lot_id == Lot.id)
    if scope["mill_id"]:
        query = query.where(Lot.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        query = query.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if status:
        query = query.where(Dispatch.status == status)
    if date:
        query = query.where(Dispatch.date == date)
    query = query.order_by(Dispatch.created_at.desc())
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
        "data": items,
    }


@router.post("/dispatch/orders", response_model=DispatchResponse)
async def create_dispatch(
    req: DispatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
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
    svc = DispatchService(db, current_user)
    return await svc.scan_history(dispatch_id)


@router.get("/dispatch/summary/today")
async def dispatch_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    svc = DispatchService(db, current_user)
    return await svc.dispatch_summary()
