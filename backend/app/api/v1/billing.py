import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Dict, Optional

from datetime import datetime, timezone

from app.db.session import get_db
from app.core.deps import get_current_user, log_audit
from app.core.module_registry import ALL_MODULE_CODES as ALL_MODULES, get_module_label
from app.models.user import User
from app.models.masters import Company, CompanyModule, Mill
from app.models.billing import SubscriptionPlan, ModulePricing, CompanySubscription, BillingInvoice, SubscriptionChangeRequest, BillingPayment, OveragePricing
from app.services.pricing_service import PricingService
from app.services.billing_service import BillingService
from app.services.billing_invoice_service import InvoiceService
from app.services.payment_service import PaymentService
from app.services.overdue_service import OverdueService
from app.schemas.billing import (
    ModulePricingOut, SubscriptionPlanOut, PlanCreate, PlanUpdate,
    CompanyCostOut, CompanySubscriptionOut, UpdateSubscriptionRequest, SetCompanyPlanRequest,
    InvoiceLineItem, InvoiceOut, ChangeRequestOut, ChangeRequestCreate, ChangeRequestReview,
    CompanyBillingRow, StatusUpdateBody, ModuleToggleBody,
    BillingSummaryOut, SubscriptionRowOut, InvoiceRowOut, PaymentRowOut, AnalyticsOut,
    PaymentCreate, PaymentOut, InvoiceDetailOut, PurchaseOverageRequest, PurchaseOverageResult,
    AutoInvoiceResult, OverdueWorkflowResult, BillingDashboardOut, SubscriptionRowEnriched,
)

logger = logging.getLogger(__name__)
router = APIRouter()
pricing_service = PricingService


# ── Plan Endpoints ────────────────────────────────────────


@router.get("/subscription/plans", response_model=List[SubscriptionPlanOut])
async def list_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = PricingService(db)
    plans = await svc.get_plans()
    return plans


@router.post("/subscription/plans", response_model=SubscriptionPlanOut)
async def create_plan(
    req: PlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    plan = SubscriptionPlan(
        code=req.code,
        name=req.name,
        description=req.description,
        monthly_price=req.monthly_price,
        yearly_price=req.yearly_price,
        included_mills=req.included_mills,
        included_users=req.included_users,
        additional_mill_cost=req.additional_mill_cost,
        additional_user_cost=req.additional_user_cost,
        sort_order=req.sort_order,
    )
    db.add(plan)
    await db.flush()
    if req.module_prices:
        for mp in req.module_prices:
            db.add(ModulePricing(
                plan_id=plan.id,
                module_name=mp["module_name"],
                monthly_price=mp.get("monthly_price", 0),
                yearly_price=mp.get("yearly_price", 0),
                is_included=mp.get("is_included", False),
            ))
        await db.flush()
    await db.refresh(plan)
    result = await db.execute(
        select(SubscriptionPlan)
        .options(selectinload(SubscriptionPlan.module_prices))
        .where(SubscriptionPlan.id == plan.id)
    )
    return result.scalar_one()


@router.put("/subscription/plans/{plan_id}", response_model=SubscriptionPlanOut)
async def update_plan(
    plan_id: str,
    req: PlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    await db.commit()
    result = await db.execute(
        select(SubscriptionPlan)
        .options(selectinload(SubscriptionPlan.module_prices))
        .where(SubscriptionPlan.id == plan_id)
    )
    return result.scalar_one()


# ── Company Subscription Endpoints ───────────────────────


@router.get("/subscription/companies/{company_id}")
async def get_company_subscription(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    svc = PricingService(db)
    status = await svc.get_subscription_status(company)
    if status is None:
        raise HTTPException(status_code=404, detail="No active plan for company")
    return status


@router.post("/subscription/companies/{company_id}/plan")
async def set_company_plan(
    company_id: str,
    req: SetCompanyPlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    plan = await db.get(SubscriptionPlan, req.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    company.plan = plan.code
    existing_sub = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = existing_sub.scalar_one_or_none()
    if sub:
        sub.plan_id = plan.id
        sub.billing_cycle = req.billing_cycle
        sub.addon_modules = req.addon_modules or {}
        sub.extra_mills = req.extra_mills or 0
        sub.extra_users = req.extra_users or 0
        sub.extra_employees = req.extra_employees or 0
        sub.status = "active"
    else:
        sub = CompanySubscription(
            company_id=company_id,
            plan_id=plan.id,
            billing_cycle=req.billing_cycle,
            status="active",
            started_at=datetime.now(timezone.utc),
            addon_modules=req.addon_modules or {},
            extra_mills=req.extra_mills or 0,
            extra_users=req.extra_users or 0,
            extra_employees=req.extra_employees or 0,
        )
        db.add(sub)

    # Sync CompanyModule records based on plan + addons
    await db.execute(
        select(ModulePricing).where(ModulePricing.plan_id == plan.id)
    )
    module_prices_result = await db.execute(
        select(ModulePricing).where(ModulePricing.plan_id == plan.id)
    )
    module_prices = module_prices_result.scalars().all()
    addon_modules = req.addon_modules or {}
    for mp in module_prices:
        is_enabled = mp.is_included or addon_modules.get(mp.module_name, False)
        existing_cm = await db.execute(
            select(CompanyModule).where(
                CompanyModule.company_id == company_id,
                CompanyModule.module_name == mp.module_name,
            )
        )
        cm = existing_cm.scalar_one_or_none()
        if cm:
            cm.is_enabled = is_enabled
        else:
            db.add(CompanyModule(
                company_id=company_id,
                module_name=mp.module_name,
                is_enabled=is_enabled,
                enabled_by=current_user.id,
            ))

    await db.commit()
    svc = PricingService(db)
    status = await svc.get_subscription_status(company)
    return status


@router.post("/subscription/companies/{company_id}/modules")
async def update_company_modules(
    company_id: str,
    body: Dict[str, bool],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    for module_name, is_enabled in body.items():
        existing = await db.execute(
            select(CompanyModule).where(
                CompanyModule.company_id == company_id,
                CompanyModule.module_name == module_name,
            )
        )
        cm = existing.scalar_one_or_none()
        if cm:
            cm.is_enabled = is_enabled
        else:
            db.add(CompanyModule(
                company_id=company_id,
                module_name=module_name,
                is_enabled=is_enabled,
                enabled_by=current_user.id,
            ))
    await db.commit()
    return {"message": "Modules updated"}


# ── Billing Dashboard (Super Admin) ──────────────────────


@router.get("/subscription/admin/summary")
async def get_billing_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = PricingService(db)

    companies_result = await db.execute(select(Company).where(Company.is_active == True))
    companies = companies_result.scalars().all()

    total_companies = len(companies)
    total_monthly = 0.0
    total_yearly = 0.0
    exceeded_mills = 0
    exceeded_users = 0
    expiring_soon = 0

    for company in companies:
        status = await svc.get_subscription_status(company)
        if status:
            if status.cost:
                total_monthly += status.cost.total_monthly
                total_yearly += status.cost.total_yearly
            if status.mills_exceeded:
                exceeded_mills += 1
            if status.users_exceeded:
                exceeded_users += 1

    return {
        "total_revenue_monthly": round(total_monthly, 2),
        "total_revenue_yearly": round(total_yearly, 2),
        "mrr": round(total_monthly, 2),
        "arr": round(total_yearly, 2),
        "active_companies": total_companies,
        "exceeded_mills": exceeded_mills,
        "exceeded_users": exceeded_users,
        "expiring_soon": expiring_soon,
    }


# ── BillingInvoice Endpoints ───────────────────────────────────


@router.post("/subscription/invoices/generate", response_model=InvoiceOut)
async def generate_invoice(
    company_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    invoice_count = await db.scalar(select(func.count(BillingInvoice.id)))
    invoice_number = f"INV-{datetime.now(timezone.utc).strftime('%Y%m')}-{(invoice_count or 0) + 1:04d}"
    invoice = BillingInvoice(
        company_id=company_id,
        company_subscription_id=body.get("subscription_id"),
        invoice_number=invoice_number,
        amount=body.get("amount", 0),
        currency=body.get("currency", "INR"),
        status="pending",
        billing_period_start=datetime.fromisoformat(body["period_start"]) if body.get("period_start") else None,
        billing_period_end=datetime.fromisoformat(body["period_end"]) if body.get("period_end") else None,
        line_items=body.get("line_items", {}),
        invoice_metadata=body.get("metadata", {}),
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    await log_audit(db, current_user.id, current_user.role or "UNKNOWN", "invoice_generated", "billing_invoice", invoice.id, f"Invoice {invoice_number} for {company.name}")
    return invoice


@router.get("/subscription/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    result = await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.company_id == company_id)
        .order_by(BillingInvoice.created_at.desc())
    )
    return result.scalars().all()


@router.get("/subscription/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await db.get(BillingInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="BillingInvoice not found")
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    return invoice


# ── Subscription Change Request Endpoints ──────────────


@router.post("/subscription/change-requests", response_model=ChangeRequestOut)
async def create_change_request(
    company_id: str,
    req: ChangeRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "MILL_OWNER":
        raise HTTPException(status_code=403, detail="Only Mill Owner can request plan changes")
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    target_plan = await db.get(SubscriptionPlan, req.requested_plan_id)
    if not target_plan or not target_plan.is_active:
        raise HTTPException(status_code=404, detail="Plan not found or inactive")
    current_sub = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = current_sub.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=400, detail="Company has no active subscription")

    change_request = SubscriptionChangeRequest(
        company_id=company_id,
        requested_by=current_user.id,
        current_plan_id=sub.plan_id,
        requested_plan_id=req.requested_plan_id,
        change_type=req.change_type,
        reason=req.reason,
    )
    db.add(change_request)
    await db.commit()
    await db.refresh(change_request)
    await log_audit(db, current_user.id, current_user.role or "UNKNOWN", "change_request_created", "subscription_change_request", change_request.id, f"{req.change_type} to {target_plan.name}")
    return change_request


@router.get("/subscription/change-requests", response_model=list[ChangeRequestOut])
async def list_change_requests(
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    conditions = []
    if company_id:
        conditions.append(SubscriptionChangeRequest.company_id == company_id)
    if status:
        conditions.append(SubscriptionChangeRequest.status == status)
    result = await db.execute(
        select(SubscriptionChangeRequest)
        .where(*conditions)
        .order_by(SubscriptionChangeRequest.created_at.desc())
    )
    return result.scalars().all()


@router.put("/subscription/change-requests/{request_id}/review", response_model=ChangeRequestOut)
async def review_change_request(
    request_id: str,
    req: ChangeRequestReview,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    change_request = await db.get(SubscriptionChangeRequest, request_id)
    if not change_request:
        raise HTTPException(status_code=404, detail="Change request not found")
    if change_request.status != "pending":
        raise HTTPException(status_code=400, detail="Change request already reviewed")

    change_request.status = req.status
    change_request.reviewed_by = current_user.id
    change_request.reviewed_at = datetime.now(timezone.utc)
    change_request.review_notes = req.review_notes

    if req.status == "approved":
        sub_result = await db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == change_request.company_id)
        )
        sub = sub_result.scalar_one_or_none()
        if sub:
            sub.plan_id = change_request.requested_plan_id
            sub.status = "active"

        # Sync CompanyModule records to match the new plan
        from app.models.masters import CompanyModule
        mp_result = await db.execute(
            select(ModulePricing).where(ModulePricing.plan_id == change_request.requested_plan_id)
        )
        module_prices = mp_result.scalars().all()
        for mp in module_prices:
            existing_cm = await db.execute(
                select(CompanyModule).where(
                    CompanyModule.company_id == change_request.company_id,
                    CompanyModule.module_name == mp.module_name,
                )
            )
            cm = existing_cm.scalar_one_or_none()
            if cm:
                cm.is_enabled = mp.is_included
            else:
                db.add(CompanyModule(
                    company_id=change_request.company_id,
                    module_name=mp.module_name,
                    is_enabled=mp.is_included,
                    enabled_by=current_user.id,
                ))

    await db.commit()
    await db.refresh(change_request)
    await log_audit(db, current_user.id, current_user.role or "UNKNOWN", "change_request_reviewed", "subscription_change_request", request_id, f"{req.status} plan change {request_id}")
    return change_request


# ── Billing History (by company) ───────────────────────


@router.get("/subscription/companies/{company_id}/billing-history")
async def get_company_billing_history(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    invoices_result = await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.company_id == company_id)
        .order_by(BillingInvoice.created_at.desc())
    )
    invoices_list = invoices_result.scalars().all()
    change_requests_result = await db.execute(
        select(SubscriptionChangeRequest)
        .where(SubscriptionChangeRequest.company_id == company_id)
        .order_by(SubscriptionChangeRequest.created_at.desc())
    )
    changes = change_requests_result.scalars().all()
    return {
        "invoices": [InvoiceOut.model_validate(inv).model_dump() for inv in invoices_list],
        "change_requests": [ChangeRequestOut.model_validate(cr).model_dump() for cr in changes],
    }


# ── Webhook Endpoint ──────────────────────────────────


@router.post("/subscription/webhook")
async def billing_webhook(
    payload: dict,
    request: "Request",
    db: AsyncSession = Depends(get_db),
):
    from app.core.config import settings
    import hashlib, hmac, json

    signature = request.headers.get("x-razorpay-signature", "")
    body = json.dumps(payload, separators=(",", ":"))
    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        logger.warning("Webhook signature mismatch")
        raise HTTPException(status_code=400, detail="Invalid signature")

    event = payload.get("event", "")
    logger.info("Billing webhook received: %s", event)

    if event == "payment.captured":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id", "")
        if order_id:
            inv_result = await db.execute(
                select(BillingInvoice).where(BillingInvoice.transaction_id == order_id)
            )
            invoice = inv_result.scalar_one_or_none()
            if invoice:
                invoice.status = "paid"
                invoice.paid_at = datetime.now(timezone.utc)
                invoice.transaction_id = payment_entity.get("id", order_id)
                invoice.gateway = "razorpay"
                await db.commit()

    elif event == "subscription.charged":
        sub_entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        sub_id = sub_entity.get("id", "")
        logger.info("Subscription charged: %s", sub_id)

    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════
# SUPER ADMIN: Revenue Control Panel endpoints
# ═══════════════════════════════════════════════════════════════════

from datetime import date as date_type, timedelta


@router.get("/admin/billing/summary", response_model=BillingSummaryOut)
async def admin_billing_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = BillingService(db)
    return await svc.get_billing_summary()


@router.get("/admin/billing/subscriptions")
async def admin_billing_subscriptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = None,
    plan_filter: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = BillingService(db)
    rows, total = await svc.get_subscriptions_list(page, page_size, status_filter, plan_filter, search)
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/billing/subscriptions/{company_id}")
async def admin_billing_company_detail(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = BillingService(db)
    detail = await svc.get_company_billing_detail(company_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Company not found")
    return detail


@router.get("/admin/billing/invoices")
async def admin_billing_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = None,
    company_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = BillingService(db)
    rows, total = await svc.get_invoices(page, page_size, status_filter, company_id)
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/billing/payments")
async def admin_billing_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = BillingService(db)
    rows, total = await svc.get_payments(page, page_size, company_id)
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/billing/analytics")
async def admin_billing_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = BillingService(db)
    return await svc.get_analytics()


@router.get("/admin/billing/overview")
async def admin_billing_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vendor revenue dashboard — SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")

    svc = PricingService(db)

    companies_res = await db.execute(select(Company))
    companies = companies_res.scalars().all()

    mrr = 0.0
    active_count = 0
    trial_count = 0
    overdue_count = 0

    for co in companies:
        try:
            sub_res = await db.execute(
                select(CompanySubscription).where(CompanySubscription.company_id == co.id)
            )
            sub = sub_res.scalar_one_or_none()
            if sub:
                status = sub.status
                if status == "active":
                    active_count += 1
                elif status == "trial":
                    trial_count += 1
                elif status in ("overdue", "expired"):
                    overdue_count += 1

                # Get plan price
                plan_res = await db.execute(
                    select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id)
                )
                plan = plan_res.scalar_one_or_none()
                if plan and status not in ("suspended", "cancelled"):
                    mrr += float(plan.monthly_price or 0)
        except Exception:
            pass

    # Revenue trend last 6 months (from BillingInvoice)
    revenue_trend = []
    today = date_type.today()
    for i in range(5, -1, -1):
        mn = today.replace(day=1)
        # go back i months
        for _ in range(i):
            mn = (mn - timedelta(days=1)).replace(day=1)
        me_raw = mn.replace(day=28) + timedelta(days=4)
        me = me_raw - timedelta(days=me_raw.day)

        try:
            rev_res = await db.execute(
                select(func.coalesce(func.sum(BillingInvoice.amount), 0)).where(
                    BillingInvoice.status == "paid",
                    BillingInvoice.paid_at >= mn,
                    BillingInvoice.paid_at <= me,
                )
            )
            rev = float(rev_res.scalar() or 0)

            new_co_res = await db.execute(
                select(func.count()).select_from(Company).where(
                    Company.created_at >= mn,
                    Company.created_at <= me,
                )
            )
            new_cos = int(new_co_res.scalar() or 0)
        except Exception:
            rev = 0
            new_cos = 0

        revenue_trend.append({
            "month": mn.strftime("%b %Y"),
            "revenue": rev,
            "new_companies": new_cos,
        })

    return {
        "mrr": round(mrr, 2),
        "total_companies": len(companies),
        "active_companies": active_count,
        "trial_companies": trial_count,
        "overdue_companies": overdue_count,
        "revenue_trend": revenue_trend,
    }


@router.get("/admin/billing/companies")
async def admin_billing_companies(
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated company billing list — SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")

    stmt = select(Company)
    if search:
        stmt = stmt.where(Company.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(Company.created_at.desc())

    total_res = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = int(total_res.scalar() or 0)

    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    cos_res = await db.execute(stmt)
    companies = cos_res.scalars().all()

    rows = []
    for co in companies:
        try:
            mills_cnt = int((await db.execute(
                select(func.count()).select_from(Mill).where(Mill.company_id == co.id)
            )).scalar() or 0)

            from app.models.user import User as UserModel
            users_cnt = int((await db.execute(
                select(func.count()).select_from(UserModel).where(
                    UserModel.company_id == co.id,
                    UserModel.is_active == True,
                    UserModel.deleted_at.is_(None),
                )
            )).scalar() or 0)

            modules_res = await db.execute(
                select(CompanyModule).where(
                    CompanyModule.company_id == co.id,
                    CompanyModule.is_enabled == True,
                )
            )
            enabled_mods = [m.module_name for m in modules_res.scalars().all()]

            sub_res = await db.execute(
                select(CompanySubscription).where(CompanySubscription.company_id == co.id)
            )
            sub = sub_res.scalar_one_or_none()

            plan_name = "starter"
            monthly_amt = 0.0
            trial_ends = None
            last_pay = None
            next_bill = None

            # Single source of truth: Company.is_active
            company_status = "active" if co.is_active else "suspended"

            if sub:
                try:
                    plan_res = await db.execute(
                        select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id)
                    )
                    plan_obj = plan_res.scalar_one_or_none()
                    if plan_obj:
                        plan_name = plan_obj.code
                        monthly_amt = float(plan_obj.monthly_price or 0)
                except Exception:
                    plan_name = str(sub.plan_id or "starter")
                if sub.expires_at:
                    trial_ends = sub.expires_at.isoformat() if company_status == "trial" else None
                    next_bill = sub.expires_at.isoformat() if company_status == "active" else None

            last_inv_res = await db.execute(
                select(BillingInvoice)
                .where(BillingInvoice.company_id == co.id, BillingInvoice.status == "paid")
                .order_by(BillingInvoice.paid_at.desc())
                .limit(1)
            )
            last_inv = last_inv_res.scalar_one_or_none()
            if last_inv and last_inv.paid_at:
                last_pay = last_inv.paid_at.isoformat()

            rows.append({
                "id": str(co.id),
                "name": co.name,
                "code": co.code,
                "plan": plan_name,
                "status": company_status,
                "mills_count": mills_cnt,
                "users_count": users_cnt,
                "enabled_modules": enabled_mods,
                "monthly_amount": monthly_amt,
                "trial_ends_at": trial_ends,
                "last_payment_at": last_pay,
                "next_billing_at": next_bill,
            })
        except Exception as e:
            logger.warning(f"admin_billing_companies row error for {co.id}: {e}")
            rows.append({
                "id": str(co.id),
                "name": co.name,
                "code": co.code,
                "plan": "starter",
                "status": "active",
                "mills_count": 0,
                "users_count": 0,
                "enabled_modules": [],
                "monthly_amount": 0.0,
                "trial_ends_at": None,
                "last_payment_at": None,
                "next_billing_at": None,
            })

    return {"companies": rows, "total": total, "page": page, "per_page": per_page}


@router.post("/admin/billing/companies/{company_id}/status")
async def admin_set_company_status(
    company_id: str,
    body: StatusUpdateBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update company subscription status — SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")

    valid = {"active", "suspended", "trial"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid}")

    sub_res = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = sub_res.scalar_one_or_none()
    if not sub:
        # Create a minimal subscription entry
        plans_res = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.sort_order).limit(1)
        )
        first_plan = plans_res.scalar_one_or_none()
        if not first_plan:
            raise HTTPException(status_code=400, detail="No subscription plans exist")
        sub = CompanySubscription(
            company_id=company_id,
            plan_id=first_plan.id,
            status=body.status,
        )
        db.add(sub)
    else:
        sub.status = body.status

    await db.commit()
    await log_audit(
        db, current_user.id, current_user.role or "SUPER_ADMIN",
        "status_changed", "company_subscription", company_id,
        f"Status set to {body.status}",
    )
    return {"ok": True, "status": body.status}


@router.post("/admin/billing/companies/{company_id}/modules")
async def admin_toggle_module(
    company_id: str,
    body: ModuleToggleBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enable/disable a single module for a company — SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")

    existing = await db.execute(
        select(CompanyModule).where(
            CompanyModule.company_id == company_id,
            CompanyModule.module_name == body.module,
        )
    )
    cm = existing.scalar_one_or_none()
    if cm:
        cm.is_enabled = body.enabled
    else:
        db.add(CompanyModule(
            company_id=company_id,
            module_name=body.module,
            is_enabled=body.enabled,
            enabled_by=current_user.id,
        ))
    await db.commit()
    return {"ok": True, "module": body.module, "enabled": body.enabled}


# ═══════════════════════════════════════════════════════════════════
# MILL OWNER: My Plan view
# ═══════════════════════════════════════════════════════════════════

@router.get("/billing/my-plan")
async def get_my_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """MILL_OWNER's current subscription view."""
    role = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role not in ("MILL_OWNER", "SUPER_ADMIN"):
        raise HTTPException(status_code=403, detail="Mill Owner only")

    company_id = current_user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No company associated with user")

    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Subscription
    sub_res = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = sub_res.scalar_one_or_none()

    plan_name = "starter"
    plan_display = "Starter"
    sub_status = "active"
    monthly_amt = 0.0
    next_billing = None
    last_payment = None

    if sub:
        sub_status = sub.status
        plan_res = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id)
        )
        plan_obj = plan_res.scalar_one_or_none()
        if plan_obj:
            plan_name = plan_obj.code
            plan_display = plan_obj.name
            monthly_amt = float(plan_obj.monthly_price or 0)
        if sub.expires_at:
            next_billing = sub.expires_at.isoformat()

    # Last invoice
    last_inv_res = await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.company_id == company_id, BillingInvoice.status == "paid")
        .order_by(BillingInvoice.paid_at.desc())
        .limit(1)
    )
    last_inv = last_inv_res.scalar_one_or_none()
    if last_inv and last_inv.paid_at:
        last_payment = last_inv.paid_at.isoformat()

    # Enabled modules
    mods_res = await db.execute(
        select(CompanyModule).where(CompanyModule.company_id == company_id)
    )
    mod_map = {m.module_name: m.is_enabled for m in mods_res.scalars().all()}
    enabled_modules = [
        {
            "name": m,
            "label": get_module_label(m),
            "enabled": mod_map.get(m, False),
        }
        for m in ALL_MODULES
    ]

    # Mills
    mills_res = await db.execute(
        select(Mill).where(Mill.company_id == company_id, Mill.is_active == True).order_by(Mill.name)
    )
    mills_list = mills_res.scalars().all()

    from app.models.user import User as UserModel
    mills_out = []
    for m in mills_list:
        uc = int((await db.execute(
            select(func.count()).select_from(UserModel).where(
                UserModel.mill_id == m.id,
                UserModel.is_active == True,
                UserModel.deleted_at.is_(None),
            )
        )).scalar() or 0)
        mills_out.append({"id": str(m.id), "name": m.name, "code": m.code, "users_count": uc})

    total_users = int((await db.execute(
        select(func.count()).select_from(UserModel).where(
            UserModel.company_id == company_id,
            UserModel.is_active == True,
            UserModel.deleted_at.is_(None),
        )
    )).scalar() or 0)

    # Invoices (last 12)
    invs_res = await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.company_id == company_id)
        .order_by(BillingInvoice.created_at.desc())
        .limit(12)
    )
    invoices_out = [
        {
            "id": str(inv.id),
            "month": inv.billing_period_start.strftime("%b %Y") if inv.billing_period_start else (
                inv.created_at.strftime("%b %Y") if inv.created_at else "—"
            ),
            "amount": float(inv.amount or 0),
            "status": inv.status,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        }
        for inv in invs_res.scalars().all()
    ]

    return {
        "company_name": company.name,
        "plan": plan_name,
        "plan_display": plan_display,
        "status": sub_status,
        "monthly_amount": monthly_amt,
        "enabled_modules": enabled_modules,
        "mills": mills_out,
        "total_users": total_users,
        "next_billing_at": next_billing,
        "last_payment_at": last_payment,
        "invoices": invoices_out,
    }


# ═══════════════════════════════════════════════════════════════════
# BILLING COMMERCE — Payment, Invoice Engine, Overage, Overdue
# ═══════════════════════════════════════════════════════════════════


# ── Payment Endpoints ────────────────────────────────────


@router.post("/admin/billing/payments", response_model=PaymentOut)
async def record_payment(
    body: PaymentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a payment (manual or gateway). SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = PaymentService(db, current_user)
    try:
        payment = await svc.record_payment(
            company_id=body.company_id,
            amount=body.amount,
            method=body.method,
            reference_number=body.reference_number,
            invoice_id=body.invoice_id,
            notes=body.notes,
        )
        co = await db.get(Company, body.company_id)
        inv = None
        inv_number = None
        if body.invoice_id:
            inv = await db.get(BillingInvoice, body.invoice_id)
            if inv:
                inv_number = inv.invoice_number
        return {
            "id": payment.id,
            "company_id": body.company_id,
            "company_name": co.name if co else None,
            "invoice_id": body.invoice_id,
            "invoice_number": inv_number,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "method": payment.method,
            "reference_number": payment.reference_number,
            "gateway": payment.gateway,
            "status": payment.status,
            "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
            "notes": payment.notes,
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/admin/billing/payments-list")
async def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all payments (from billing_payments table). SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = PaymentService(db, current_user)
    rows, total = await svc.get_payments(page, page_size, company_id, status_filter)
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/billing/company-payments/{company_id}")
async def company_payments(
    company_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List payments for a specific company."""
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    svc = PaymentService(db, current_user)
    rows, total = await svc.get_company_payments(company_id, page, page_size)
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.post("/admin/billing/payments/{payment_id}/reconcile")
async def reconcile_payment(
    payment_id: str,
    invoice_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reconcile a payment to an invoice."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = PaymentService(db, current_user)
    try:
        result = await svc.reconcile_payment(payment_id, invoice_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/billing/payments/{payment_id}/refund")
async def refund_payment(
    payment_id: str,
    reason: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Refund a payment."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = PaymentService(db, current_user)
    try:
        refund = await svc.refund_payment(payment_id, reason)
        return {
            "id": refund.id,
            "amount": float(refund.amount),
            "status": refund.status,
            "notes": refund.notes,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Invoice Engine Endpoints ────────────────────────────


@router.post("/admin/billing/invoices/generate-subscription", response_model=InvoiceDetailOut)
async def generate_subscription_invoice(
    company_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a subscription invoice for a company. SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = InvoiceService(db)
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    period_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        period_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    else:
        period_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    try:
        invoice = await svc.generate_subscription_invoice(company_id, period_start, period_end)
        await db.commit()
        co = await db.get(Company, company_id)
        return {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "company_id": company_id,
            "company_name": co.name if co else None,
            "amount": float(invoice.amount),
            "subtotal": float(invoice.subtotal),
            "tax_amount": float(invoice.tax_amount),
            "currency": invoice.currency,
            "status": invoice.status,
            "invoice_type": invoice.invoice_type,
            "billing_period_start": invoice.billing_period_start.isoformat() if invoice.billing_period_start else None,
            "billing_period_end": invoice.billing_period_end.isoformat() if invoice.billing_period_end else None,
            "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
            "paid_at": invoice.paid_at.isoformat() if invoice.paid_at else None,
            "line_items": invoice.line_items,
            "notes": invoice.notes,
            "is_auto_generated": invoice.is_auto_generated,
            "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/billing/invoices/generate-monthly", response_model=AutoInvoiceResult)
async def generate_monthly_invoices(
    year_month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate subscription invoices for all active companies. SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = InvoiceService(db)
    result = await svc.generate_all_monthly_invoices(year_month)
    await db.commit()
    return result


@router.post("/admin/billing/invoices/generate-renewals")
async def generate_renewal_invoices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate renewal invoices for subscriptions expiring soon. SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = InvoiceService(db)
    invoices = await svc.generate_past_due_invoices()
    await db.commit()
    return {"generated": len(invoices), "invoice_ids": [inv.id for inv in invoices]}


@router.get("/admin/billing/invoices/{invoice_id}", response_model=InvoiceDetailOut)
async def get_invoice_detail(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full invoice detail."""
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    invoice = await db.get(BillingInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    co = await db.get(Company, invoice.company_id)
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "company_id": invoice.company_id,
        "company_name": co.name if co else None,
        "amount": float(invoice.amount),
        "subtotal": float(invoice.subtotal),
        "tax_amount": float(invoice.tax_amount),
        "currency": invoice.currency,
        "status": invoice.status,
        "invoice_type": invoice.invoice_type,
        "billing_period_start": invoice.billing_period_start.isoformat() if invoice.billing_period_start else None,
        "billing_period_end": invoice.billing_period_end.isoformat() if invoice.billing_period_end else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "paid_at": invoice.paid_at.isoformat() if invoice.paid_at else None,
        "transaction_id": invoice.transaction_id,
        "gateway": invoice.gateway,
        "line_items": invoice.line_items,
        "notes": invoice.notes,
        "is_auto_generated": invoice.is_auto_generated,
        "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
    }


# ── Overage Purchase Endpoint ────────────────────────────


@router.post("/admin/billing/companies/{company_id}/purchase-overage", response_model=PurchaseOverageResult)
async def purchase_overage(
    company_id: str,
    body: PurchaseOverageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Purchase additional resource capacity (extra users/mills/employees). SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    sub_res = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = sub_res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=400, detail="Company has no subscription")
    plan = await db.get(SubscriptionPlan, sub.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan not found")

    # Determine unit price
    if body.resource_type == "extra_users":
        unit_price = float(plan.additional_user_cost or 0)
        sub.extra_users = (sub.extra_users or 0) + body.quantity
        label = "users"
    elif body.resource_type == "extra_mills":
        unit_price = float(plan.additional_mill_cost or 0)
        sub.extra_mills = (sub.extra_mills or 0) + body.quantity
        label = "mills"
    elif body.resource_type == "extra_employees":
        unit_price = float(plan.additional_employee_cost or 0)
        sub.extra_employees = (sub.extra_employees or 0) + body.quantity
        label = "employees"
    else:
        raise HTTPException(status_code=400, detail="Invalid resource type")

    if unit_price <= 0:
        raise HTTPException(status_code=400, detail=f"This plan includes unlimited {label} — no purchase needed")

    # Generate overage invoice
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    period_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        period_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    else:
        period_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)

    svc = InvoiceService(db)
    invoice = await svc.generate_overage_invoice(
        company_id=company_id,
        resource_type=body.resource_type,
        quantity=body.quantity,
        unit_price=unit_price,
        period_start=period_start,
        period_end=period_end,
    )
    await db.commit()
    return PurchaseOverageResult(
        success=True,
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        amount=float(invoice.amount),
        resource_type=body.resource_type,
        quantity=body.quantity,
        message=f"Added {body.quantity} {label} at {unit_price:.2f} each. Invoice {invoice.invoice_number} generated.",
    )


# ── Overdue Workflow Endpoint ────────────────────────────


@router.post("/admin/billing/overdue/process", response_model=OverdueWorkflowResult)
async def run_overdue_workflow(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run the overdue management workflow. SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = OverdueService(db)
    result = await svc.process_overdue_workflow()
    await db.commit()
    return result


@router.post("/admin/billing/companies/{company_id}/restore-overdue")
async def restore_overdue_company(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore a company from overdue status after payment. SUPER_ADMIN only."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = OverdueService(db)
    result = await svc.restore_from_overdue(company_id)
    await db.commit()
    return result


# ── Enriched Billing Dashboard ──────────────────────────


@router.get("/admin/billing/dashboard", response_model=BillingDashboardOut)
async def billing_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enriched billing dashboard with comprehensive KPIs."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = BillingService(db)
    summary = await svc.get_billing_summary()
    analytics = await svc.get_analytics()

    # Count new customers this month
    from datetime import date as date_type
    today = date_type.today()
    first_of_month = datetime(today.year, today.month, 1, tzinfo=timezone.utc)
    new_res = await db.execute(
        select(func.count()).select_from(Company).where(Company.created_at >= first_of_month)
    )
    new_customers_this_month = int(new_res.scalar() or 0)

    # Count companies over limit
    over_limit = 0
    companies_res = await db.execute(select(Company))
    for co in companies_res.scalars().all():
        sub_res = await db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == co.id)
        )
        sub = sub_res.scalar_one_or_none()
        if sub:
            plan = await db.get(SubscriptionPlan, sub.plan_id)
            if plan:
                limit = (plan.included_users or 0) + (sub.extra_users or 0)
                user_cnt = int((await db.execute(
                    select(func.count()).select_from(User).where(
                        User.company_id == co.id,
                        User.is_active == True,
                        User.deleted_at.is_(None),
                    )
                )).scalar() or 0)
                if limit > 0 and user_cnt > limit:
                    over_limit += 1

    return {
        "mrr": summary["mrr"],
        "arr": summary["arr"],
        "active_subscriptions": summary["active_subscriptions"],
        "trial_companies": summary["trial_count"],
        "overdue_companies": summary["overdue_count"],
        "suspended_companies": summary["suspended_count"],
        "collection_rate": summary["collection_rate"],
        "revenue_growth": summary["revenue_growth"],
        "new_customers": new_customers_this_month,
        "churn_rate": analytics.get("churn_rate", 0),
        "total_companies": summary["total_companies"],
        "new_customers_this_month": new_customers_this_month,
        "companies_over_limit": over_limit,
        "revenue_trend": summary["revenue_trend"],
    }


# ── Enriched Subscription Listing ────────────────────────


@router.get("/admin/billing/subscriptions-enriched")
async def enriched_subscriptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = None,
    plan_filter: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enriched subscription listing with employee counts and module names."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")
    svc = BillingService(db)
    rows, total = await svc.get_subscriptions_list(page, page_size, status_filter, plan_filter, search)

    # Enrich with employee counts and module lists
    enriched = []
    for row in rows:
        emp_res = await db.execute(
            select(func.count()).select_from(Employee).where(
                Employee.company_id == row["company_id"],
                Employee.is_active == True,
            )
        )
        emp_count = int(emp_res.scalar() or 0)

        # Get employee limit from plan + extras
        sub_res = await db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == row["company_id"])
        )
        sub = sub_res.scalar_one_or_none()
        emp_limit = 100  # default
        if sub:
            plan = await db.get(SubscriptionPlan, sub.plan_id)
            if plan:
                emp_limit = (plan.included_users or 0) * 20 + (sub.extra_employees or 0)

        # Get module names
        mods_res = await db.execute(
            select(CompanyModule).where(
                CompanyModule.company_id == row["company_id"],
                CompanyModule.is_enabled == True,
            )
        )
        modules_list = [m.module_name for m in mods_res.scalars().all()]

        enriched.append({
            **row,
            "employee_count": emp_count,
            "employee_limit": emp_limit,
            "modules_list": modules_list,
            "subscription_type": sub.billing_cycle if sub else "monthly",
            "monthly_value": row["monthly_amount"],
        })

    return {"items": enriched, "total": total, "page": page, "page_size": page_size}


# ── Company billing detail enriched with employee data ──


@router.get("/admin/billing/company-detail/{company_id}")
async def company_billing_detail_enriched(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Company billing detail with employee counts and payment history."""
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Super Admin or Mill Owner only")
    svc = BillingService(db)
    detail = await svc.get_company_billing_detail(company_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Company not found")

    # Add employee info
    emp_res = await db.execute(
        select(func.count()).select_from(Employee).where(
            Employee.company_id == company_id,
            Employee.is_active == True,
        )
    )
    detail["employee_count"] = int(emp_res.scalar() or 0)

    # Add payment history
    pay_svc = PaymentService(db)
    payments, pay_total = await pay_svc.get_company_payments(company_id, 1, 10)
    detail["payments"] = payments

    # Subscription changes
    changes_res = await db.execute(
        select(SubscriptionChangeRequest)
        .where(SubscriptionChangeRequest.company_id == company_id)
        .order_by(SubscriptionChangeRequest.created_at.desc())
        .limit(10)
    )
    detail["change_requests"] = [
        {
            "id": cr.id,
            "change_type": cr.change_type,
            "status": cr.status,
            "created_at": cr.created_at.isoformat() if cr.created_at else None,
        }
        for cr in changes_res.scalars().all()
    ]

    return detail
