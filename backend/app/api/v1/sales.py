import logging
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.masters import Mill
from app.schemas.sales import SalesOrderCreate, SalesOrderOut, CancelSalesOrderRequest
from app.services.sales_service import SalesOrderService

router = APIRouter()


@router.get("/sales/orders")
async def list_orders(
    status: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("sales")),
):
    try:
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

        svc = SalesOrderService(db, current_user)
        return await svc.list_orders(
            mill_id=effective_mill_id or "",
            status=status,
            customer_id=customer_id,
            page=page,
            page_size=page_size,
        )
    except Exception as e:
        logger.error(f"sales.orders list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/sales/orders", response_model=SalesOrderOut)
async def create_order(
    req: SalesOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("sales", write=True)),
):
    svc = SalesOrderService(db, current_user)
    result = await svc.create_order(
        mill_id=req.mill_id,
        customer_id=req.customer_id,
        order_date=req.order_date,
        delivery_date=req.delivery_date,
        yarn_count=req.yarn_count,
        notes=req.notes,
        incoterms=req.incoterms,
        lines=[l.model_dump() for l in req.lines],
        creator_id=current_user.id,
        creator_role=current_user.role_rel.code if current_user.role_rel else "",
    )
    return result


@router.get("/sales/orders/{so_id}", response_model=SalesOrderOut)
async def get_order(
    so_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("sales")),
):
    svc = SalesOrderService(db, current_user)
    return await svc.get_order(so_id)


@router.post("/sales/orders/{so_id}/confirm", response_model=SalesOrderOut)
async def confirm_order(
    so_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("sales", write=True)),
):
    svc = SalesOrderService(db, current_user)
    return await svc.confirm_order(
        so_id,
        confirmer_id=current_user.id,
        confirmer_role=current_user.role_rel.code if current_user.role_rel else "",
    )


@router.put("/sales/orders/{so_id}", response_model=SalesOrderOut)
async def update_order(
    so_id: str,
    req: SalesOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("sales", write=True)),
):
    svc = SalesOrderService(db, current_user)
    result = await svc.update_order(
        so_id=so_id,
        customer_id=req.customer_id,
        order_date=req.order_date,
        delivery_date=req.delivery_date,
        yarn_count=req.yarn_count,
        notes=req.notes,
        incoterms=req.incoterms,
        lines=[l.model_dump() for l in req.lines],
        updater_id=current_user.id,
    )
    return result


@router.post("/sales/orders/{so_id}/cancel", response_model=SalesOrderOut)
async def cancel_order(
    so_id: str,
    req: CancelSalesOrderRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("sales", write=True)),
):
    svc = SalesOrderService(db, current_user)
    return await svc.cancel_order(
        so_id,
        canceller_id=current_user.id,
        canceller_role=current_user.role_rel.code if current_user.role_rel else "",
        reason=req.reason,
    )
