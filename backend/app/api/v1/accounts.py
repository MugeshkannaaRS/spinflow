import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timezone, date

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.accounts import Invoice, Payment
from app.models.masters import Mill
from app.schemas.accounts import (
    InvoiceCreate, InvoiceOut, InvoiceListResponse,
    PaymentCreate, PaymentOut, AccountsSummary,
)
from app.services.accounts_service import AccountsService

router = APIRouter()


@router.get("/accounts/invoices")
async def get_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Invoice)
    if scope["mill_id"]:
        stmt = stmt.where(Invoice.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Invoice.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    stmt = stmt.order_by(Invoice.date.desc())
    try:
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
            "data": [InvoiceOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"accounts.invoices list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/accounts/invoices", response_model=InvoiceOut)
async def create_invoice(
    req: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts", write=True)),
):
    invoice = Invoice(
        invoice_no=f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        date=req.invoice_date.isoformat(),
        customer_name=req.party_name,
        type="sales",
        amount=req.taxable_amount,
        gst=req.tax_amount if hasattr(req, 'tax_amount') else 0,
        total=req.total_amount if hasattr(req, 'total_amount') else req.taxable_amount,
        status="draft",
        due_date=req.due_date.isoformat() if req.due_date else None,
    )
    db.add(invoice)
    await db.flush()
    return invoice


@router.put("/accounts/invoices/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(
    invoice_id: str,
    req: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts", write=True)),
):
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if req.party_name is not None:
        invoice.customer_name = req.party_name
    if req.invoice_date is not None:
        invoice.date = req.invoice_date.isoformat()
    if req.taxable_amount is not None:
        invoice.amount = req.taxable_amount
    if req.due_date is not None:
        invoice.due_date = req.due_date.isoformat()
    await db.flush()
    return invoice


@router.get("/accounts/receivables")
async def get_receivables(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Invoice).where(Invoice.status.in_(["posted", "overdue"]))
    if scope["mill_id"]:
        stmt = stmt.where(Invoice.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Invoice.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    stmt = stmt.order_by(Invoice.date.desc())
    try:
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
            "data": [InvoiceOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"accounts.receivables list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/accounts/payments", response_model=PaymentOut)
async def create_payment(
    req: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts", write=True)),
):
    payment = Payment(
        invoice_id=req.invoice_id,
        date=req.payment_date.isoformat(),
        amount=req.amount,
        mode=req.payment_mode,
        reference=req.reference_no,
        notes=req.remarks,
    )
    db.add(payment)
    inv_result = await db.execute(select(Invoice).where(Invoice.id == req.invoice_id))
    invoice = inv_result.scalar_one_or_none()
    if invoice:
        invoice.status = "paid"
        invoice.paid_at = datetime.now(timezone.utc)
    await db.flush()
    return payment


# ── Finance routes ──────────────────────────────────────────

@router.get("/accounts/pl")
async def get_pl(
    mill_id: str = Query(...),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts")),
):
    scope = await get_mill_scope(current_user)
    if scope["mill_id"]:
        mill_id = scope["mill_id"]
    elif scope["company_id"]:
        mills_result = await db.execute(select(Mill.id).where(Mill.company_id == scope["company_id"]))
        mill_ids = mills_result.scalars().all()
        if mill_ids:
            mill_id = mill_ids[0]
    svc = AccountsService(db, current_user)
    return await svc.get_pl_statement(mill_id, month, year)


@router.get("/accounts/receivables-ageing")
async def get_receivables_ageing(
    mill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts")),
):
    scope = await get_mill_scope(current_user)
    if scope["mill_id"]:
        mill_id = scope["mill_id"]
    elif scope["company_id"]:
        mills_result = await db.execute(select(Mill.id).where(Mill.company_id == scope["company_id"]))
        mill_ids = mills_result.scalars().all()
        if mill_ids:
            mill_id = mill_ids[0]
    svc = AccountsService(db, current_user)
    return await svc.receivables_ageing(mill_id)


@router.get("/accounts/payables")
async def get_payables(
    mill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts")),
):
    scope = await get_mill_scope(current_user)
    if scope["mill_id"]:
        mill_id = scope["mill_id"]
    elif scope["company_id"]:
        mills_result = await db.execute(select(Mill.id).where(Mill.company_id == scope["company_id"]))
        mill_ids = mills_result.scalars().all()
        if mill_ids:
            mill_id = mill_ids[0]
    svc = AccountsService(db, current_user)
    return await svc.payables_ageing(mill_id)


@router.get("/accounts/gst")
async def get_gst(
    mill_id: str = Query(...),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts")),
):
    scope = await get_mill_scope(current_user)
    if scope["mill_id"]:
        mill_id = scope["mill_id"]
    elif scope["company_id"]:
        mills_result = await db.execute(select(Mill.id).where(Mill.company_id == scope["company_id"]))
        mill_ids = mills_result.scalars().all()
        if mill_ids:
            mill_id = mill_ids[0]
    svc = AccountsService(db, current_user)
    return await svc.gst_summary(mill_id, month, year)


@router.get("/accounts/cogs")
async def get_cogs(
    mill_id: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts")),
):
    scope = await get_mill_scope(current_user)
    if scope["mill_id"]:
        mill_id = scope["mill_id"]
    elif scope["company_id"]:
        mills_result = await db.execute(select(Mill.id).where(Mill.company_id == scope["company_id"]))
        mill_ids = mills_result.scalars().all()
        if mill_ids:
            mill_id = mill_ids[0]
    svc = AccountsService(db, current_user)
    return await svc.get_cogs(mill_id, date_from, date_to)
