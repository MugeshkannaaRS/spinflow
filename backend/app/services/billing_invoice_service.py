"""Invoice generation service — auto-generates subscription, prorated, and overage invoices."""

import logging
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from typing import Optional, List, Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.billing import (
    BillingInvoice,
    CompanySubscription,
    SubscriptionPlan,
    ModulePricing,
    OveragePricing,
)
from app.models.masters import Company, Mill
from app.models.user import User
from app.models.hr import Employee
from app.core.deps import log_audit

logger = logging.getLogger(__name__)


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_invoice_number(self) -> str:
        now = datetime.now(timezone.utc)
        prefix = f"INV-{now.strftime('%Y%m')}-"
        result = await self.db.execute(
            select(func.count(BillingInvoice.id)).where(
                BillingInvoice.invoice_number.like(f"{prefix}%")
            )
        )
        count = result.scalar() or 0
        return f"{prefix}{count + 1:04d}"

    async def generate_subscription_invoice(
        self,
        company_id: str,
        period_start: datetime,
        period_end: datetime,
        is_auto: bool = False,
    ) -> BillingInvoice:
        company = await self.db.get(Company, company_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")

        result = await self.db.execute(
            select(CompanySubscription).where(
                CompanySubscription.company_id == company_id,
                CompanySubscription.status.in_(["active", "overdue"]),
            )
        )
        subscription = result.scalar_one_or_none()
        if not subscription:
            raise ValueError(f"No active subscription for company {company_id}")

        plan = await self.db.get(SubscriptionPlan, subscription.plan_id)
        if not plan:
            raise ValueError(f"Plan {subscription.plan_id} not found")

        line_items = await self._calculate_line_items(company, plan, subscription)

        subtotal = sum(
            float(item["amount"]) for item in line_items.values()
        )
        tax_amount = 0.0
        invoice_number = await self.generate_invoice_number()

        invoice = BillingInvoice(
            company_id=company_id,
            company_subscription_id=subscription.id,
            invoice_number=invoice_number,
            amount=subtotal + tax_amount,
            currency=subscription.currency_code or "INR",
            status="pending",
            billing_period_start=period_start,
            billing_period_end=period_end,
            due_date=period_end + timedelta(days=7),
            line_items=line_items,
            subtotal=subtotal,
            tax_amount=tax_amount,
            is_auto_generated=is_auto,
            invoice_type="subscription",
            invoice_metadata={
                "plan_id": plan.id,
                "plan_code": plan.code,
                "plan_name": plan.name,
                "billing_cycle": subscription.billing_cycle,
            },
        )
        self.db.add(invoice)
        await self.db.flush()

        try:
            await log_audit(
                self.db,
                user_id=None,
                role="SYSTEM",
                action="invoice_generated",
                entity="billing_invoice",
                entity_id=invoice.id,
                details=(
                    f"Subscription invoice {invoice_number} for {company.name}: "
                    f"{subscription.currency_code or 'INR'} {invoice.amount:.2f} "
                    f"({plan.name}), auto={is_auto}"
                ),
            )
        except Exception as e:
            logger.warning("Failed to log audit for invoice %s: %s", invoice.id, e)
            await self.db.rollback()
            raise

        return invoice

    async def generate_prorated_invoice(
        self,
        company_id: str,
        old_plan_id: str,
        new_plan_id: str,
        change_type: str,
        effective_date: datetime,
    ) -> BillingInvoice:
        company = await self.db.get(Company, company_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")

        old_plan = await self.db.get(SubscriptionPlan, old_plan_id)
        if not old_plan:
            raise ValueError(f"Old plan {old_plan_id} not found")

        new_plan = await self.db.get(SubscriptionPlan, new_plan_id)
        if not new_plan:
            raise ValueError(f"New plan {new_plan_id} not found")

        result = await self.db.execute(
            select(CompanySubscription).where(
                CompanySubscription.company_id == company_id,
                CompanySubscription.status.in_(["active", "overdue"]),
            )
        )
        subscription = result.scalar_one_or_none()
        if not subscription:
            raise ValueError(f"No active subscription for company {company_id}")

        period_start, period_end = self._get_billing_period(subscription)
        total_days = (period_end - period_start).days
        if total_days <= 0:
            total_days = 30

        remaining_days = (period_end - effective_date).days
        if remaining_days < 0:
            remaining_days = 0

        old_daily_rate = float(old_plan.monthly_price) / 30.0
        new_daily_rate = float(new_plan.monthly_price) / 30.0

        old_remaining_cost = old_daily_rate * remaining_days
        new_remaining_cost = new_daily_rate * remaining_days

        if change_type == "downgrade":
            amount = new_remaining_cost - old_remaining_cost
            description = (
                f"Prorated credit for downgrade from {old_plan.name} to {new_plan.name}: "
                f"credit of {abs(amount):.2f} for {remaining_days} remaining days"
            )
        elif change_type == "upgrade":
            amount = new_remaining_cost - old_remaining_cost
            description = (
                f"Prorated charge for upgrade from {old_plan.name} to {new_plan.name}: "
                f"charge of {amount:.2f} for {remaining_days} remaining days"
            )
        else:
            amount = new_remaining_cost - old_remaining_cost
            description = (
                f"Prorated adjustment for {change_type} from {old_plan.name} "
                f"to {new_plan.name}: {(amount):+.2f}"
            )

        invoice_number = await self.generate_invoice_number()
        line_items = {
            "prorated_adjustment": {
                "description": description,
                "old_plan": old_plan.name,
                "new_plan": new_plan.name,
                "change_type": change_type,
                "remaining_days": remaining_days,
                "total_days": total_days,
                "effective_date": effective_date.isoformat(),
                "amount": round(amount, 2),
            }
        }

        subtotal = round(amount, 2)
        tax_amount = 0.0

        invoice = BillingInvoice(
            company_id=company_id,
            company_subscription_id=subscription.id,
            invoice_number=invoice_number,
            amount=subtotal + tax_amount,
            currency=subscription.currency_code or "INR",
            status="pending",
            billing_period_start=period_start,
            billing_period_end=period_end,
            due_date=effective_date + timedelta(days=7),
            line_items=line_items,
            subtotal=subtotal,
            tax_amount=tax_amount,
            is_auto_generated=False,
            invoice_type="adjustment",
            invoice_metadata={
                "old_plan_id": old_plan_id,
                "new_plan_id": new_plan_id,
                "old_plan_code": old_plan.code,
                "new_plan_code": new_plan.code,
                "change_type": change_type,
                "effective_date": effective_date.isoformat(),
                "remaining_days": remaining_days,
                "total_days": total_days,
            },
        )
        self.db.add(invoice)
        await self.db.flush()

        try:
            await log_audit(
                self.db,
                user_id=None,
                role="SYSTEM",
                action="prorated_invoice_generated",
                entity="billing_invoice",
                entity_id=invoice.id,
                details=(
                    f"Prorated {change_type} invoice {invoice_number} for "
                    f"{company.name}: {old_plan.name} -> {new_plan.name}, "
                    f"amount={invoice.amount:.2f}"
                ),
            )
        except Exception as e:
            logger.warning("Failed to log audit for prorated invoice %s: %s", invoice.id, e)
            await self.db.rollback()
            raise

        return invoice

    async def generate_overage_invoice(
        self,
        company_id: str,
        resource_type: str,
        quantity: int,
        unit_price: float,
        period_start: datetime,
        period_end: datetime,
    ) -> BillingInvoice:
        company = await self.db.get(Company, company_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")

        result = await self.db.execute(
            select(CompanySubscription).where(
                CompanySubscription.company_id == company_id,
                CompanySubscription.status.in_(["active", "overdue"]),
            )
        )
        subscription = result.scalar_one_or_none()

        amount = round(quantity * unit_price, 2)
        invoice_number = await self.generate_invoice_number()

        line_items = {
            "overage": {
                "description": f"Overage charge for {resource_type}: {quantity} x {unit_price:.2f}",
                "resource_type": resource_type,
                "quantity": quantity,
                "unit_price": unit_price,
                "amount": amount,
            }
        }

        invoice = BillingInvoice(
            company_id=company_id,
            company_subscription_id=subscription.id if subscription else None,
            invoice_number=invoice_number,
            amount=amount,
            currency=subscription.currency_code if subscription else "INR",
            status="pending",
            billing_period_start=period_start,
            billing_period_end=period_end,
            due_date=period_end + timedelta(days=7),
            line_items=line_items,
            subtotal=amount,
            tax_amount=0.0,
            is_auto_generated=False,
            invoice_type="overage",
            invoice_metadata={
                "resource_type": resource_type,
                "quantity": quantity,
                "unit_price": unit_price,
            },
        )
        self.db.add(invoice)
        await self.db.flush()

        try:
            await log_audit(
                self.db,
                user_id=None,
                role="SYSTEM",
                action="overage_invoice_generated",
                entity="billing_invoice",
                entity_id=invoice.id,
                details=(
                    f"Overage invoice {invoice_number} for {company.name}: "
                    f"{resource_type} x{quantity} @ {unit_price:.2f} = {amount:.2f}"
                ),
            )
        except Exception as e:
            logger.warning("Failed to log audit for overage invoice %s: %s", invoice.id, e)
            await self.db.rollback()
            raise

        return invoice

    async def generate_past_due_invoices(self) -> List[BillingInvoice]:
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=3)
        generated: List[BillingInvoice] = []

        result = await self.db.execute(
            select(CompanySubscription).where(
                CompanySubscription.status == "active",
                CompanySubscription.expires_at.isnot(None),
                CompanySubscription.expires_at <= cutoff,
            )
        )
        subscriptions = result.scalars().all()

        for subscription in subscriptions:
            try:
                expires_at = subscription.expires_at
                if not expires_at:
                    continue

                period_start = expires_at
                if subscription.billing_cycle == "yearly":
                    period_end = expires_at + timedelta(days=365)
                else:
                    period_end = expires_at + timedelta(days=30)

                invoice = await self.generate_subscription_invoice(
                    company_id=subscription.company_id,
                    period_start=period_start,
                    period_end=period_end,
                    is_auto=True,
                )
                generated.append(invoice)

                previous_invoices = await self.db.execute(
                    select(BillingInvoice)
                    .where(
                        BillingInvoice.company_id == subscription.company_id,
                        BillingInvoice.invoice_type == "subscription",
                        BillingInvoice.status == "pending",
                        BillingInvoice.id != invoice.id,
                    )
                    .order_by(BillingInvoice.created_at.desc())
                    .limit(1)
                )
                prev_invoice = previous_invoices.scalar_one_or_none()
                if prev_invoice and prev_invoice.due_date and prev_invoice.due_date < now:
                    prev_invoice.status = "overdue"

                subscription.expires_at = period_end
                self.db.add(subscription)

            except Exception as e:
                logger.error(
                    "Failed to generate renewal invoice for subscription %s (%s): %s",
                    subscription.id, subscription.company_id, e,
                )
                continue

        if generated:
            await self.db.flush()

        return generated

    async def generate_all_monthly_invoices(
        self, year_month: str = None
    ) -> dict:
        now = datetime.now(timezone.utc)
        if year_month:
            try:
                year, month = map(int, year_month.split("-"))
                period_start = datetime(year, month, 1, tzinfo=timezone.utc)
                if month == 12:
                    period_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
                else:
                    period_end = datetime(year, month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
            except (ValueError, IndexError):
                raise ValueError("year_month must be in YYYY-MM format")
        else:
            period_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
            if now.month == 12:
                period_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
            else:
                period_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)

        result = await self.db.execute(
            select(Company).where(
                Company.is_active == True,
                Company.status.in_(["active", "suspended"]),
            )
        )
        companies = result.scalars().all()

        total = len(companies)
        generated = 0
        errors = 0
        details: List[dict] = []

        for company in companies:
            sub_result = await self.db.execute(
                select(CompanySubscription).where(
                    CompanySubscription.company_id == company.id,
                    CompanySubscription.status == "active",
                )
            )
            subscription = sub_result.scalar_one_or_none()
            if not subscription:
                details.append({
                    "company_id": company.id,
                    "company_name": company.name,
                    "status": "skipped",
                    "reason": "No active subscription",
                })
                continue

            try:
                invoice = await self.generate_subscription_invoice(
                    company_id=company.id,
                    period_start=period_start,
                    period_end=period_end,
                    is_auto=True,
                )
                generated += 1
                details.append({
                    "company_id": company.id,
                    "company_name": company.name,
                    "status": "generated",
                    "invoice_id": invoice.id,
                    "invoice_number": invoice.invoice_number,
                    "amount": float(invoice.amount),
                })
            except Exception as e:
                errors += 1
                logger.error("Failed to generate invoice for %s (%s): %s", company.id, company.name, e)
                details.append({
                    "company_id": company.id,
                    "company_name": company.name,
                    "status": "error",
                    "error": str(e),
                })

        if generated:
            try:
                await self.db.flush()
            except Exception as e:
                logger.error("Flush failed after monthly invoice generation: %s", e)
                await self.db.rollback()
                errors += generated
                generated = 0
                for d in details:
                    if d["status"] == "generated":
                        d["status"] = "error"
                        d["error"] = str(e)

        return {
            "total": total,
            "generated": generated,
            "errors": errors,
            "details": details,
        }

    async def _calculate_line_items(
        self,
        company: Company,
        plan: SubscriptionPlan,
        subscription: CompanySubscription,
    ) -> dict:
        line_items: Dict[str, dict] = {}

        line_items["base_plan"] = {
            "description": f"Base plan: {plan.name} ({plan.code})",
            "type": "base_plan",
            "plan_id": plan.id,
            "plan_code": plan.code,
            "plan_name": plan.name,
            "amount": float(plan.monthly_price),
        }

        if subscription.addon_modules:
            addon_cost = 0.0
            addon_details = []
            plan_module_result = await self.db.execute(
                select(ModulePricing).where(
                    ModulePricing.plan_id == plan.id,
                    ModulePricing.is_included == False,
                )
            )
            addon_prices = {
                mp.module_name: float(mp.monthly_price)
                for mp in plan_module_result.scalars().all()
            }

            for module_name, is_added in (subscription.addon_modules or {}).items():
                if is_added:
                    price = addon_prices.get(module_name, 999.0)
                    addon_cost += price
                    addon_details.append({
                        "module": module_name,
                        "price": price,
                    })

            if addon_details:
                line_items["addon_modules"] = {
                    "description": "Addon modules",
                    "type": "addon_modules",
                    "modules": addon_details,
                    "amount": round(addon_cost, 2),
                }

        included_mills = plan.included_mills or 0
        extra_mills = subscription.extra_mills or 0
        if extra_mills > 0:
            extra_mill_cost = extra_mills * float(plan.additional_mill_cost or 0)
            line_items["extra_mills"] = {
                "description": f"Extra mills: {extra_mills} x {float(plan.additional_mill_cost or 0):.2f}",
                "type": "extra_mills",
                "quantity": extra_mills,
                "unit_price": float(plan.additional_mill_cost or 0),
                "amount": round(extra_mill_cost, 2),
            }

        included_users = plan.included_users or 0
        extra_users = subscription.extra_users or 0
        if extra_users > 0:
            extra_user_cost = extra_users * float(plan.additional_user_cost or 0)
            line_items["extra_users"] = {
                "description": f"Extra users: {extra_users} x {float(plan.additional_user_cost or 0):.2f}",
                "type": "extra_users",
                "quantity": extra_users,
                "unit_price": float(plan.additional_user_cost or 0),
                "amount": round(extra_user_cost, 2),
            }

        included_employees = 0
        extra_employees = subscription.extra_employees or 0
        if extra_employees > 0:
            extra_employee_cost = extra_employees * float(plan.additional_employee_cost or 0)
            line_items["extra_employees"] = {
                "description": f"Extra employees: {extra_employees} x {float(plan.additional_employee_cost or 0):.2f}",
                "type": "extra_employees",
                "quantity": extra_employees,
                "unit_price": float(plan.additional_employee_cost or 0),
                "amount": round(extra_employee_cost, 2),
            }

        return line_items

    def _get_billing_period(
        self, subscription: CompanySubscription
    ) -> Tuple[datetime, datetime]:
        now = datetime.now(timezone.utc)
        if subscription.started_at and subscription.expires_at:
            period_start = subscription.started_at
            period_end = subscription.expires_at
        elif subscription.started_at:
            period_start = subscription.started_at
            if subscription.billing_cycle == "yearly":
                period_end = period_start + timedelta(days=365)
            else:
                period_end = period_start + timedelta(days=30)
        elif subscription.expires_at:
            period_end = subscription.expires_at
            if subscription.billing_cycle == "yearly":
                period_start = period_end - timedelta(days=365)
            else:
                period_start = period_end - timedelta(days=30)
        else:
            period_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
            if now.month == 12:
                period_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
            else:
                period_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)

        return period_start, period_end
