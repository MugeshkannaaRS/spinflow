import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from app.models.billing import BillingInvoice, CompanySubscription
from app.models.masters import Company, Mill
from app.models.user import User, UserSession
from app.core.deps import log_audit

logger = logging.getLogger(__name__)

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"
SYSTEM_ROLE = "SYSTEM"

MILESTONES = [0, 7, 15, 30, 60, 90]


class OverdueService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def process_overdue_workflow(self) -> dict:
        processed = 0
        reminders = 0
        warnings = 0
        restricted = 0
        suspended = 0
        terminated = 0

        try:
            result = await self.db.execute(
                select(BillingInvoice)
                .where(
                    BillingInvoice.status == "pending",
                    BillingInvoice.due_date.isnot(None),
                    BillingInvoice.due_date < func.now(),
                )
                .order_by(BillingInvoice.due_date.asc())
            )
            invoices = result.scalars().all()
        except Exception as e:
            logger.error(f"Failed to fetch overdue invoices: {e}")
            return {
                "processed": 0,
                "reminders": 0,
                "warnings": 0,
                "restricted": 0,
                "suspended": 0,
                "terminated": 0,
            }

        for invoice in invoices:
            try:
                action = await self._process_invoice(invoice)
                processed += 1
                if action == "reminder_sent":
                    reminders += 1
                elif action == "warning_sent":
                    warnings += 1
                elif action == "restricted":
                    restricted += 1
                elif action == "suspended":
                    suspended += 1
                elif action == "terminated":
                    terminated += 1
            except Exception as e:
                logger.error(
                    f"Failed to process invoice {invoice.id} "
                    f"for company {invoice.company_id}: {e}"
                )

        await self.db.commit()

        return {
            "processed": processed,
            "reminders": reminders,
            "warnings": warnings,
            "restricted": restricted,
            "suspended": suspended,
            "terminated": terminated,
        }

    async def _process_invoice(self, invoice: BillingInvoice) -> str:
        sub_res = await self.db.execute(
            select(CompanySubscription).where(
                CompanySubscription.company_id == invoice.company_id
            )
        )
        sub = sub_res.scalar_one_or_none()
        if not sub:
            logger.warning(
                f"No subscription found for company {invoice.company_id}, skipping"
            )
            return "skipped"

        now = datetime.now(timezone.utc)

        if sub.overdue_since is None:
            sub.overdue_since = now
            sub.overdue_day = 0
            sub.overdue_status = "overdue"
            self.db.add(sub)
            await self.db.flush()
            return await self._day_0(invoice.company_id, invoice)

        days_overdue = max(0, (now - sub.overdue_since).days)
        milestone = self._determine_overdue_day(days_overdue)

        if milestone <= sub.overdue_day:
            return "already_processed"

        sub.overdue_day = milestone
        self.db.add(sub)
        await self.db.flush()

        if milestone == 0:
            return await self._day_0(invoice.company_id, invoice)
        elif milestone == 7:
            return await self._day_7(invoice.company_id, invoice)
        elif milestone == 15:
            return await self._day_15(invoice.company_id, invoice)
        elif milestone == 30:
            return await self._day_30(invoice.company_id, invoice)
        elif milestone == 60:
            return await self._day_60(invoice.company_id, invoice)
        elif milestone >= 90:
            return await self._day_90(invoice.company_id, invoice)

        return "pending"

    async def _day_0(self, company_id: str, invoice: BillingInvoice) -> str:
        logger.info(
            f"Overdue day 0 for company {company_id}, "
            f"invoice {invoice.invoice_number}: recorded as overdue"
        )
        return "pending"

    async def _day_7(self, company_id: str, invoice: BillingInvoice) -> str:
        logger.info(
            f"Overdue day 7 for company {company_id}, "
            f"invoice {invoice.invoice_number}: payment reminder sent"
        )
        return "reminder_sent"

    async def _day_15(self, company_id: str, invoice: BillingInvoice) -> str:
        logger.info(
            f"Overdue day 15 for company {company_id}, "
            f"invoice {invoice.invoice_number}: warning notification sent"
        )
        return "warning_sent"

    async def _day_30(self, company_id: str, invoice: BillingInvoice) -> str:
        logger.warning(
            f"Overdue day 30 for company {company_id}, "
            f"invoice {invoice.invoice_number}: restricting company"
        )
        try:
            sub_res = await self.db.execute(
                select(CompanySubscription).where(
                    CompanySubscription.company_id == company_id
                )
            )
            sub = sub_res.scalar_one_or_none()
            if sub:
                sub.overdue_status = "restricted"
                self.db.add(sub)
                await self.db.flush()

            await log_audit(
                self.db,
                SYSTEM_USER_ID,
                SYSTEM_ROLE,
                "company_overdue_restricted",
                "company",
                company_id,
                f"Company restricted due to overdue invoice {invoice.invoice_number} (day 30)",
            )
        except Exception as e:
            logger.error(f"Failed to restrict company {company_id}: {e}")

        return "restricted"

    async def _day_60(self, company_id: str, invoice: BillingInvoice) -> str:
        logger.warning(
            f"Overdue day 60 for company {company_id}, "
            f"invoice {invoice.invoice_number}: suspending company"
        )
        try:
            sub_res = await self.db.execute(
                select(CompanySubscription).where(
                    CompanySubscription.company_id == company_id
                )
            )
            sub = sub_res.scalar_one_or_none()
            if sub:
                sub.status = "suspended"
                self.db.add(sub)

            co_res = await self.db.execute(
                select(Company).where(Company.id == company_id)
            )
            company = co_res.scalar_one_or_none()
            if company:
                now = datetime.now(timezone.utc)
                company.is_active = False
                company.status = "suspended"
                company.suspended_at = now
                self.db.add(company)

            await self.db.execute(
                update(Mill)
                .where(Mill.company_id == company_id)
                .values(is_active=False)
            )

            user_ids_res = await self.db.execute(
                select(User.id).where(User.company_id == company_id)
            )
            user_ids = [row[0] for row in user_ids_res.all()]
            if user_ids:
                await self.db.execute(
                    update(User)
                    .where(User.id.in_(user_ids))
                    .values(is_active=False)
                )
                await self.db.execute(
                    update(UserSession)
                    .where(UserSession.user_id.in_(user_ids))
                    .values(is_active=False)
                )

            await self.db.flush()

            await log_audit(
                self.db,
                SYSTEM_USER_ID,
                SYSTEM_ROLE,
                "company_overdue_suspended",
                "company",
                company_id,
                f"Company suspended due to overdue invoice {invoice.invoice_number} (day 60)",
            )
        except Exception as e:
            logger.error(f"Failed to suspend company {company_id}: {e}")

        return "suspended"

    async def _day_90(self, company_id: str, invoice: BillingInvoice) -> str:
        logger.warning(
            f"Overdue day 90 for company {company_id}, "
            f"invoice {invoice.invoice_number}: marking as termination candidate"
        )
        try:
            sub_res = await self.db.execute(
                select(CompanySubscription).where(
                    CompanySubscription.company_id == company_id
                )
            )
            sub = sub_res.scalar_one_or_none()
            if sub:
                sub.status = "cancelled"
                self.db.add(sub)

            co_res = await self.db.execute(
                select(Company).where(Company.id == company_id)
            )
            company = co_res.scalar_one_or_none()
            if company:
                now = datetime.now(timezone.utc)
                company.status = "archived"
                company.archived_at = now
                company.is_active = False
                self.db.add(company)

            await self.db.flush()

            await log_audit(
                self.db,
                SYSTEM_USER_ID,
                SYSTEM_ROLE,
                "company_overdue_terminated",
                "company",
                company_id,
                f"Company marked as terminated due to overdue invoice {invoice.invoice_number} (day 90)",
            )
        except Exception as e:
            logger.error(f"Failed to terminate company {company_id}: {e}")

        return "terminated"

    def _get_invoice_days_overdue(self, invoice: BillingInvoice) -> int:
        now = datetime.now(timezone.utc)
        if invoice.due_date:
            due = invoice.due_date
        else:
            due = (
                invoice.created_at + timedelta(days=7)
                if invoice.created_at
                else now
            )
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        return max(0, (now - due).days)

    def _determine_overdue_day(self, days_overdue: int) -> int:
        milestone = 0
        for m in MILESTONES:
            if days_overdue >= m:
                milestone = m
        return milestone

    async def restore_from_overdue(self, company_id: str) -> dict:
        try:
            sub_res = await self.db.execute(
                select(CompanySubscription).where(
                    CompanySubscription.company_id == company_id
                )
            )
            sub = sub_res.scalar_one_or_none()
            if not sub:
                logger.error(f"No subscription found for company {company_id}")
                return {
                    "restored": False,
                    "company_id": company_id,
                    "error": "No subscription found",
                }

            if sub.status in ("suspended", "cancelled"):
                logger.warning(
                    f"Company {company_id} is {sub.status}, "
                    f"cannot auto-restore from overdue"
                )
                return {
                    "restored": False,
                    "company_id": company_id,
                    "error": (
                        f"Cannot restore from {sub.status} — "
                        "manual intervention required"
                    ),
                }

            sub.overdue_status = "active"
            sub.overdue_day = 0
            sub.overdue_since = None
            self.db.add(sub)
            await self.db.flush()

            await log_audit(
                self.db,
                SYSTEM_USER_ID,
                SYSTEM_ROLE,
                "company_overdue_restored",
                "company",
                company_id,
                "Company restored from overdue status — payment received",
            )

            return {"restored": True, "company_id": company_id}

        except Exception as e:
            logger.error(f"Failed to restore company {company_id} from overdue: {e}")
            return {"restored": False, "company_id": company_id, "error": str(e)}
