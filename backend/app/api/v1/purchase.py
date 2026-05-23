from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, log_audit
from app.models.user import User
from app.models.purchase import Supplier, CottonPurchase, GRNEntry
from app.schemas.purchase import (
    SupplierCreate, SupplierOut,
    CottonPurchaseCreate, CottonPurchaseOut,
    GRNCreate, GRNOut,
)

router = APIRouter()


@router.get("/purchase/purchases")
async def get_purchases(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    stmt = select(CottonPurchase).order_by(CottonPurchase.created_at.desc())
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": items,
    }


@router.post("/purchase/purchases", response_model=CottonPurchaseOut)
async def create_purchase(
    req: CottonPurchaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase", write=True)),
):
    purchase = CottonPurchase(
        date=req.purchase_date.isoformat(),
        invoice_no=req.invoice_no or "",
        supplier_id=req.supplier_id,
        bales=req.bale_count,
        gross_kg=req.weight_kg * req.bale_count,
        net_kg=req.weight_kg * req.bale_count,
        rate_per_kg=req.rate_per_quintal / 100,
        moisture=req.moisture_pct or 0,
        status="pending",
    )
    db.add(purchase)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "create", "CottonPurchase", purchase.id,
                    f"Purchase {purchase.invoice_no} created")
    return purchase


@router.get("/purchase/suppliers")
async def get_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    stmt = select(Supplier)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": items,
    }


@router.post("/purchase/suppliers", response_model=SupplierOut)
async def create_supplier(
    req: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase", write=True)),
):
    supplier_code = req.code or req.name[:50].upper().replace(" ", "-")
    supplier = Supplier(
        code=supplier_code,
        name=req.name,
        contact_person=req.contact_person,
        phone=req.mobile,
        email=str(req.email) if req.email else None,
        address=req.address,
        gstin=req.gstin,
        status=True,
    )
    db.add(supplier)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "create", "Supplier", supplier.id,
                    f"Supplier {supplier.name} created")
    return supplier


@router.get("/purchase/grns")
async def get_grns(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    stmt = select(GRNEntry).order_by(GRNEntry.created_at.desc())
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": items,
    }


@router.post("/purchase/grn", response_model=GRNOut)
async def create_grn(
    req: GRNCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase", write=True)),
):
    grn = GRNEntry(
        date=datetime.now().strftime("%Y-%m-%d"),
        grn_no=f"GRN-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        purchase_id=req.purchase_id,
        bales_received=req.received_bales,
        net_kg=req.received_weight_kg,
        received_by=current_user.name,
        remarks=req.remarks,
        status="completed",
    )
    db.add(grn)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "create", "GRNEntry", grn.id,
                    f"GRN {grn.grn_no} created")
    return GRNOut(
        id=grn.id,
        grn_no=grn.grn_no,
        purchase_id=grn.purchase_id,
        received_bales=grn.bales_received,
        received_weight_kg=grn.net_kg,
        grn_date=datetime.strptime(grn.date, "%Y-%m-%d").date() if grn.date else None,
        created_at=grn.created_at,
    )
