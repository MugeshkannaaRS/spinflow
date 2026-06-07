import logging
from datetime import date as date_type, datetime, timedelta, timezone
from typing import Optional, List, Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from sqlalchemy.orm import selectinload
from app.models.billing import SubscriptionPlan, ModulePricing, CompanySubscription, BillingInvoice
from app.models.masters import Company, Mill, CompanyModule
from app.models.user import User

logger = logging.getLogger(__name__)


class BillingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_billing_summary(self) -> dict:
        # ── Batch query: companies + subscriptions + plans in 3 round-trips ──
        companies_res = await self.db.execute(select(Company))
        companies = companies_res.scalars().all()
        total_companies = len(companies)
        company_ids = [c.id for c in companies]

        # Batch-load all subscriptions
        sub_map: Dict[str, CompanySubscription] = {}
        plan_ids_needed: set = set()
        if company_ids:
            subs_res = await self.db.execute(
                select(CompanySubscription).where(CompanySubscription.company_id.in_(company_ids))
            )
            for sub in subs_res.scalars().all():
                sub_map[sub.company_id] = sub
                if sub.plan_id:
                    plan_ids_needed.add(sub.plan_id)

        # Batch-load all plans
        plan_map: Dict[str, SubscriptionPlan] = {}
        if plan_ids_needed:
            plans_res = await self.db.execute(
                select(SubscriptionPlan).where(SubscriptionPlan.id.in_(list(plan_ids_needed)))
            )
            for plan in plans_res.scalars().all():
                plan_map[plan.id] = plan

        mrr = 0.0
        active_count = 0
        trial_count = 0
        overdue_count = 0
        suspended_count = 0

        for co in companies:
            sub = sub_map.get(co.id)
            if sub:
                s = sub.status
                if s == "active":
                    active_count += 1
                elif s == "trial":
                    trial_count += 1
                elif s in ("overdue", "expired"):
                    overdue_count += 1
                elif s == "suspended":
                    suspended_count += 1

                os = getattr(sub, "overdue_status", "active")
                if os != "active" and s not in ("suspended", "cancelled"):
                    overdue_count += 1

                plan = plan_map.get(sub.plan_id or "")
                if plan and s not in ("suspended", "cancelled"):
                    mrr += float(plan.monthly_price or 0)

        arr = mrr * 12

        total_paid_res = await self.db.execute(
            select(func.coalesce(func.sum(BillingInvoice.amount), 0)).where(
                BillingInvoice.status == "paid"
            )
        )
        total_paid = float(total_paid_res.scalar() or 0)
        total_invoiced_res = await self.db.execute(
            select(func.coalesce(func.sum(BillingInvoice.amount), 0))
        )
        total_invoiced = float(total_invoiced_res.scalar() or 0)
        collection_rate = round((total_paid / total_invoiced * 100) if total_invoiced > 0 else 100, 1)

        revenue_trend = []
        today = date_type.today()
        for i in range(5, -1, -1):
            mn = today.replace(day=1)
            for _ in range(i):
                mn = (mn - timedelta(days=1)).replace(day=1)
            me_raw = mn.replace(day=28) + timedelta(days=4)
            me = me_raw - timedelta(days=me_raw.day)
            try:
                rev_res = await self.db.execute(
                    select(func.coalesce(func.sum(BillingInvoice.amount), 0)).where(
                        BillingInvoice.status == "paid",
                        BillingInvoice.paid_at >= mn,
                        BillingInvoice.paid_at <= me,
                    )
                )
                rev = float(rev_res.scalar() or 0)
            except Exception:
                rev = 0
            revenue_trend.append({"month": mn.strftime("%b %Y"), "revenue": rev})

        prev_6m = today.replace(day=1)
        for _ in range(6):
            prev_6m = (prev_6m - timedelta(days=1)).replace(day=1)
        prev_rev_res = await self.db.execute(
            select(func.coalesce(func.sum(BillingInvoice.amount), 0)).where(
                BillingInvoice.status == "paid",
                BillingInvoice.paid_at >= prev_6m,
                BillingInvoice.paid_at < today.replace(day=1),
            )
        )
        prev_rev = float(prev_rev_res.scalar() or 0)
        current_6m = sum(r["revenue"] for r in revenue_trend[:6])
        revenue_growth = round(((current_6m - prev_rev) / prev_rev * 100) if prev_rev > 0 else 0, 1)

        return {
            "mrr": round(mrr, 2),
            "arr": round(arr, 2),
            "active_subscriptions": active_count,
            "overdue_count": overdue_count,
            "trial_count": trial_count,
            "suspended_count": suspended_count,
            "collection_rate": collection_rate,
            "revenue_growth": revenue_growth,
            "total_companies": total_companies,
            "revenue_trend": revenue_trend,
        }

    async def get_subscriptions_list(
        self, page: int = 1, page_size: int = 20,
        status_filter: Optional[str] = None,
        plan_filter: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[dict], int]:
        # ── Build base company query ──────────────────────────────────────────
        stmt = (
            select(Company)
            .options(
                selectinload(Company.mills),
                selectinload(Company.modules),
            )
            .order_by(Company.created_at.desc())
        )
        if search:
            stmt = stmt.where(
                Company.name.ilike(f"%{search}%") | Company.code.ilike(f"%{search}%")
            )

        # Fetch ALL matching companies (needed for filter-accurate count)
        result = await self.db.execute(stmt)
        all_companies = result.scalars().all()
        company_ids = [c.id for c in all_companies]

        # ── Batch-load subscriptions ──────────────────────────────────────────
        sub_map: Dict[str, CompanySubscription] = {}
        plan_ids_needed: set = set()
        if company_ids:
            subs_res = await self.db.execute(
                select(CompanySubscription).where(CompanySubscription.company_id.in_(company_ids))
            )
            for sub in subs_res.scalars().all():
                sub_map[sub.company_id] = sub
                if sub.plan_id:
                    plan_ids_needed.add(sub.plan_id)

        # ── Batch-load plans ──────────────────────────────────────────────────
        plan_map: Dict[str, SubscriptionPlan] = {}
        if plan_ids_needed:
            plans_res = await self.db.execute(
                select(SubscriptionPlan).where(SubscriptionPlan.id.in_(list(plan_ids_needed)))
            )
            for plan in plans_res.scalars().all():
                plan_map[plan.id] = plan

        # ── Batch-load user counts ────────────────────────────────────────────
        user_cnt_map: Dict[str, int] = {}
        if company_ids:
            ucnt_res = await self.db.execute(
                select(User.company_id, func.count(User.id))
                .where(
                    User.company_id.in_(company_ids),
                    User.is_active == True,
                    User.deleted_at.is_(None),
                )
                .group_by(User.company_id)
            )
            for row in ucnt_res.all():
                user_cnt_map[row[0]] = int(row[1])

        # ── Build rows with filter ────────────────────────────────────────────
        all_rows = []
        for co in all_companies:
            sub = sub_map.get(co.id)
            plan_name = "—"
            plan_code = "none"
            monthly_amount = 0.0
            status = "inactive"
            overdue_status = "active"
            renewal_date = None
            user_limit = co.max_users or 50
            mill_limit = 1

            if sub:
                status = sub.status
                overdue_status = getattr(sub, "overdue_status", "active")
                if sub.expires_at:
                    renewal_date = sub.expires_at.strftime("%Y-%m-%d")
                plan = plan_map.get(sub.plan_id or "")
                if plan:
                    plan_name = plan.name
                    plan_code = plan.code
                    monthly_amount = float(plan.monthly_price or 0)
                    user_limit = (plan.included_users or 0) + (sub.extra_users or 0)
                    mill_limit = (plan.included_mills or 0) + (sub.extra_mills or 0)

            # Apply filters before building row (accurate count)
            if status_filter and status_filter != status:
                continue
            if plan_filter and plan_filter != plan_code:
                continue

            user_count = user_cnt_map.get(co.id, 0)
            mill_count = len([m for m in (co.mills or []) if m.is_active])
            modules_enabled = len([m for m in (co.modules or []) if m.is_enabled])

            all_rows.append({
                "company_id": co.id,
                "company_name": co.name,
                "company_code": co.code,
                "plan_name": plan_name,
                "plan_code": plan_code,
                "user_count": user_count,
                "user_limit": user_limit,
                "mill_count": mill_count,
                "mill_limit": mill_limit,
                "modules_enabled": modules_enabled,
                "renewal_date": renewal_date,
                "monthly_amount": monthly_amount,
                "status": status,
                "overdue_status": overdue_status,
            })

        # ── Paginate after filter ─────────────────────────────────────────────
        total = len(all_rows)
        offset = (page - 1) * page_size
        rows = all_rows[offset: offset + page_size]
        return rows, total

    async def get_company_billing_detail(self, company_id: str) -> Optional[dict]:
        co_res = await self.db.execute(
            select(Company).where(Company.id == company_id)
        )
        co = co_res.scalar_one_or_none()
        if not co:
            return None

        sub_res = await self.db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == company_id)
        )
        sub = sub_res.scalar_one_or_none()
        plan = None
        plan_info = None
        if sub:
            plan_res = await self.db.execute(
                select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id)
            )
            plan = plan_res.scalar_one_or_none()

        if plan:
            plan_info = {
                "id": plan.id,
                "code": plan.code,
                "name": plan.name,
                "monthly_price": float(plan.monthly_price or 0),
                "yearly_price": float(plan.yearly_price or 0),
                "included_mills": plan.included_mills,
                "included_users": plan.included_users,
            }
        sub_out = None
        if sub:
            sub_out = {
                "id": sub.id,
                "status": sub.status,
                "billing_cycle": sub.billing_cycle,
                "started_at": sub.started_at.isoformat() if sub.started_at else None,
                "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
                "extra_mills": sub.extra_mills,
                "extra_users": sub.extra_users,
                "currency_symbol": getattr(sub, "currency_symbol", "₹"),
                "currency_code": getattr(sub, "currency_code", "INR"),
                "overdue_status": getattr(sub, "overdue_status", "active"),
                "overdue_since": sub.overdue_since.isoformat() if hasattr(sub, "overdue_since") and sub.overdue_since else None,
                "addon_modules": sub.addon_modules or {},
            }

        invoice_res = await self.db.execute(
            select(BillingInvoice)
            .where(BillingInvoice.company_id == company_id)
            .order_by(BillingInvoice.created_at.desc())
            .limit(20)
        )
        invoices = invoice_res.scalars().all()
        invoices_out = [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "amount": float(inv.amount),
                "currency": inv.currency,
                "status": inv.status,
                "billing_period_start": inv.billing_period_start.isoformat() if inv.billing_period_start else None,
                "billing_period_end": inv.billing_period_end.isoformat() if inv.billing_period_end else None,
                "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
                "created_at": inv.created_at.isoformat() if inv.created_at else None,
            }
            for inv in invoices
        ]

        user_count_res = await self.db.execute(
            select(func.count(User.id)).where(
                User.company_id == company_id,
                User.is_active == True,
                User.deleted_at.is_(None),
            )
        )
        user_count = int(user_count_res.scalar() or 0)
        user_limit = co.max_users or 50
        if sub and plan:
            user_limit = (plan.included_users or 0) + (sub.extra_users or 0)

        mill_count_res = await self.db.execute(
            select(func.count(Mill.id)).where(Mill.company_id == company_id, Mill.is_active == True)
        )
        mill_count = int(mill_count_res.scalar() or 0)
        mill_limit = 1
        if sub and plan:
            mill_limit = (plan.included_mills or 0) + (sub.extra_mills or 0)

        modules_res = await self.db.execute(
            select(CompanyModule).where(CompanyModule.company_id == company_id)
        )
        modules = modules_res.scalars().all()
        enabled_modules = [m.module_name for m in modules if m.enabled]

        return {
            "company": {"id": co.id, "name": co.name, "code": co.code, "is_active": co.is_active},
            "subscription": sub_out,
            "plan": plan_info,
            "user_count": user_count,
            "user_limit": user_limit,
            "mill_count": mill_count,
            "mill_limit": mill_limit,
            "enabled_modules": enabled_modules,
            "invoices": invoices_out,
        }

    async def get_invoices(
        self, page: int = 1, page_size: int = 20,
        status_filter: Optional[str] = None,
        company_id: Optional[str] = None,
    ) -> Tuple[List[dict], int]:
        stmt = (
            select(BillingInvoice)
            .order_by(BillingInvoice.created_at.desc())
        )
        if status_filter:
            stmt = stmt.where(BillingInvoice.status == status_filter)
        if company_id:
            stmt = stmt.where(BillingInvoice.company_id == company_id)
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        invoices = result.scalars().all()

        rows = []
        for inv in invoices:
            co_res = await self.db.execute(select(Company).where(Company.id == inv.company_id))
            co = co_res.scalar_one_or_none()
            rows.append({
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "company_name": co.name if co else "Unknown",
                "amount": float(inv.amount),
                "currency": inv.currency,
                "issue_date": inv.created_at.isoformat() if inv.created_at else "",
                "due_date": None,
                "status": inv.status,
                "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            })

        return rows, total

    async def get_payments(
        self, page: int = 1, page_size: int = 20,
        company_id: Optional[str] = None,
    ) -> Tuple[List[dict], int]:
        stmt = (
            select(BillingInvoice)
            .where(BillingInvoice.status == "paid")
            .order_by(BillingInvoice.paid_at.desc().nullslast(), BillingInvoice.created_at.desc())
        )
        if company_id:
            stmt = stmt.where(BillingInvoice.company_id == company_id)
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        invoices = result.scalars().all()

        rows = []
        for inv in invoices:
            co_res = await self.db.execute(select(Company).where(Company.id == inv.company_id))
            co = co_res.scalar_one_or_none()
            rows.append({
                "id": inv.id,
                "company_name": co.name if co else "Unknown",
                "invoice_number": inv.invoice_number,
                "amount": float(inv.amount),
                "currency": inv.currency,
                "method": inv.gateway or "bank_transfer",
                "reference": inv.transaction_id,
                "paid_date": inv.paid_at.isoformat() if inv.paid_at else None,
                "status": "completed",
            })

        return rows, total

    async def get_analytics(self) -> dict:
        summary = await self.get_billing_summary()
        mrr = summary["mrr"]
        arr = summary["arr"]
        active = summary["active_subscriptions"]
        total = summary["total_companies"]

        arpu = round(mrr / active, 2) if active > 0 else 0
        ltv = round(arpu * 24, 2)
        churn_rate = 0
        if total > 0:
            suspended = summary["suspended_count"]
            churn_rate = round((suspended / total) * 100, 1)

        mrr_trend = summary["revenue_trend"]

        plan_count_res = await self.db.execute(
            select(SubscriptionPlan.code, func.count(CompanySubscription.id))
            .outerjoin(CompanySubscription, SubscriptionPlan.id == CompanySubscription.plan_id)
            .group_by(SubscriptionPlan.code)
            .order_by(SubscriptionPlan.sort_order)
        )
        plan_distribution = [{"plan": row[0], "count": row[1]} for row in plan_count_res.all()]

        invoice_res = await self.db.execute(
            select(
                BillingInvoice.company_id,
                func.sum(BillingInvoice.amount).label("total_paid"),
            )
            .where(BillingInvoice.status == "paid")
            .group_by(BillingInvoice.company_id)
            .order_by(func.sum(BillingInvoice.amount).desc())
            .limit(10)
        )
        top_customers = []
        for row in invoice_res.all():
            co_res = await self.db.execute(select(Company).where(Company.id == row.company_id))
            co = co_res.scalar_one_or_none()
            top_customers.append({
                "company_name": co.name if co else "Unknown",
                "total_paid": round(float(row.total_paid), 2),
            })

        return {
            "mrr": mrr,
            "arr": arr,
            "churn_rate": churn_rate,
            "arpu": arpu,
            "ltv": ltv,
            "mrr_trend": mrr_trend,
            "top_customers": top_customers,
            "plan_distribution": plan_distribution,
        }
