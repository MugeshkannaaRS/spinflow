import logging
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.billing import BillingPayment, BillingInvoice, CompanySubscription
from app.models.masters import Company
from app.models.user import User

logger = logging.getLogger(__name__)


class PaymentService:
    def __init__(self, db: AsyncSession, current_user: Optional[User] = None):
        self.db = db
        self.current_user = current_user

    async def record_payment(
        self,
        company_id: str,
        amount: float,
        method: str = "bank_transfer",
        reference_number: Optional[str] = None,
        invoice_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> BillingPayment:
        company = await self.db.get(Company, company_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")

        if invoice_id:
            invoice = await self.db.get(BillingInvoice, invoice_id)
            if not invoice:
                raise ValueError(f"Invoice {invoice_id} not found")
            if invoice.company_id != company_id:
                raise ValueError("Invoice does not belong to this company")

        sub_res = await self.db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == company_id)
        )
        sub = sub_res.scalar_one_or_none()
        currency = sub.currency_code if sub else "INR"

        payment = BillingPayment(
            company_id=company_id,
            invoice_id=invoice_id,
            amount=amount,
            currency=currency,
            method=method,
            reference_number=reference_number,
            status="completed",
            paid_at=datetime.now(timezone.utc),
            notes=notes,
            entered_by=self.current_user.id if self.current_user else None,
        )
        self.db.add(payment)
        await self.db.flush()

        if invoice_id:
            invoice = await self.db.get(BillingInvoice, invoice_id)
            invoice.status = "paid"
            invoice.paid_at = datetime.now(timezone.utc)
            invoice.transaction_id = payment.id
            await self.db.flush()

        await self._log_audit(
            action="payment.recorded",
            entity="payment",
            entity_id=payment.id,
            details=f"Payment of {amount} {currency} recorded for company {company_id}"
            + (f" against invoice {invoice_id}" if invoice_id else ""),
        )

        await self.db.commit()
        await self.db.refresh(payment)
        return payment

    async def record_manual_payment(
        self,
        company_id: str,
        amount: float,
        invoice_id: Optional[str] = None,
        reference_number: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> BillingPayment:
        payment = await self.record_payment(
            company_id=company_id,
            amount=amount,
            method="bank_transfer",
            reference_number=reference_number,
            invoice_id=invoice_id,
            notes=notes,
        )
        return payment

    async def record_razorpay_payment(
        self,
        company_id: str,
        invoice_id: str,
        gateway_payment_id: str,
        amount: float,
        gateway_response: Optional[dict] = None,
    ) -> BillingPayment:
        company = await self.db.get(Company, company_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")

        invoice = await self.db.get(BillingInvoice, invoice_id)
        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")
        if invoice.company_id != company_id:
            raise ValueError("Invoice does not belong to this company")

        sub_res = await self.db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == company_id)
        )
        sub = sub_res.scalar_one_or_none()
        currency = sub.currency_code if sub else "INR"

        payment = BillingPayment(
            company_id=company_id,
            invoice_id=invoice_id,
            amount=amount,
            currency=currency,
            method="razorpay",
            reference_number=gateway_payment_id,
            gateway="razorpay",
            gateway_response=gateway_response or {},
            status="completed",
            paid_at=datetime.now(timezone.utc),
            entered_by=self.current_user.id if self.current_user else None,
        )
        self.db.add(payment)
        await self.db.flush()

        invoice.status = "paid"
        invoice.paid_at = datetime.now(timezone.utc)
        invoice.transaction_id = gateway_payment_id
        invoice.gateway = "razorpay"
        await self.db.flush()

        await self._log_audit(
            action="payment.razorpay",
            entity="payment",
            entity_id=payment.id,
            details=f"Razorpay payment {gateway_payment_id} of {amount} {currency} for invoice {invoice_id}",
        )

        await self.db.commit()
        await self.db.refresh(payment)
        return payment

    async def get_company_payments(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[dict], int]:
        stmt = (
            select(BillingPayment)
            .where(BillingPayment.company_id == company_id)
            .order_by(BillingPayment.paid_at.desc().nullslast(), BillingPayment.created_at.desc())
        )
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        payments = result.scalars().all()

        rows = []
        for p in payments:
            invoice_number = None
            if p.invoice_id:
                inv = await self.db.get(BillingInvoice, p.invoice_id)
                if inv:
                    invoice_number = inv.invoice_number

            rows.append({
                "id": p.id,
                "amount": float(p.amount),
                "currency": p.currency,
                "method": p.method,
                "reference_number": p.reference_number,
                "invoice_number": invoice_number,
                "status": p.status,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "notes": p.notes,
            })

        return rows, total

    async def get_payments(
        self,
        page: int = 1,
        page_size: int = 20,
        company_id: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> Tuple[List[dict], int]:
        stmt = (
            select(BillingPayment)
            .order_by(BillingPayment.paid_at.desc().nullslast(), BillingPayment.created_at.desc())
        )
        if company_id:
            stmt = stmt.where(BillingPayment.company_id == company_id)
        if status_filter:
            stmt = stmt.where(BillingPayment.status == status_filter)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        payments = result.scalars().all()

        rows = []
        for p in payments:
            co = await self.db.get(Company, p.company_id)
            invoice_number = None
            if p.invoice_id:
                inv = await self.db.get(BillingInvoice, p.invoice_id)
                if inv:
                    invoice_number = inv.invoice_number

            rows.append({
                "id": p.id,
                "company_name": co.name if co else "Unknown",
                "company_id": p.company_id,
                "amount": float(p.amount),
                "currency": p.currency,
                "method": p.method,
                "reference_number": p.reference_number,
                "invoice_number": invoice_number,
                "gateway": p.gateway,
                "status": p.status,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "notes": p.notes,
            })

        return rows, total

    async def reconcile_payment(self, payment_id: str, invoice_id: str) -> dict:
        payment = await self.db.get(BillingPayment, payment_id)
        if not payment:
            raise ValueError(f"Payment {payment_id} not found")

        invoice = await self.db.get(BillingInvoice, invoice_id)
        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")

        if invoice.company_id != payment.company_id:
            raise ValueError("Payment and invoice belong to different companies")

        old_invoice_id = payment.invoice_id
        payment.invoice_id = invoice_id
        await self.db.flush()

        amount_matches = abs(float(payment.amount) - float(invoice.amount)) < 0.01
        if amount_matches and invoice.status != "paid":
            invoice.status = "paid"
            invoice.paid_at = datetime.now(timezone.utc)
            invoice.transaction_id = payment.id
            await self.db.flush()

        await self._log_audit(
            action="payment.reconciled",
            entity="payment",
            entity_id=payment_id,
            details=f"Payment {payment_id} reconciled to invoice {invoice_id}",
            old_value=old_invoice_id,
            new_value=invoice_id,
        )

        await self.db.commit()

        return {
            "payment_id": payment_id,
            "invoice_id": invoice_id,
            "invoice_number": invoice.invoice_number,
            "payment_amount": float(payment.amount),
            "invoice_amount": float(invoice.amount),
            "invoice_status": invoice.status,
            "amount_matches": amount_matches,
        }

    async def refund_payment(
        self,
        payment_id: str,
        reason: Optional[str] = None,
    ) -> BillingPayment:
        original = await self.db.get(BillingPayment, payment_id)
        if not original:
            raise ValueError(f"Payment {payment_id} not found")

        if original.status == "refunded":
            raise ValueError("Payment has already been refunded")

        original.status = "refunded"
        await self.db.flush()

        refund = BillingPayment(
            company_id=original.company_id,
            invoice_id=original.invoice_id,
            amount=-abs(float(original.amount)),
            currency=original.currency,
            method=original.method,
            reference_number=f"REFUND-{original.reference_number or original.id}",
            gateway=original.gateway,
            status="completed",
            paid_at=datetime.now(timezone.utc),
            notes=f"Refund of payment {payment_id}" + (f": {reason}" if reason else ""),
            entered_by=self.current_user.id if self.current_user else None,
        )
        self.db.add(refund)
        await self.db.flush()

        if original.invoice_id:
            invoice = await self.db.get(BillingInvoice, original.invoice_id)
            if invoice:
                invoice.status = "refunded"
                await self.db.flush()

        await self._log_audit(
            action="payment.refunded",
            entity="payment",
            entity_id=payment_id,
            details=f"Payment {payment_id} refunded" + (f". Reason: {reason}" if reason else ""),
        )

        await self.db.commit()
        await self.db.refresh(refund)
        return refund

    async def _log_audit(
        self,
        action: str,
        entity: str,
        entity_id: str,
        details: str,
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
    ) -> None:
        try:
            from app.models.audit import AuditLog
            log = AuditLog(
                user_id=self.current_user.id if self.current_user else "system",
                role=self.current_user.role if self.current_user else "system",
                action=action,
                entity=entity,
                entity_id=entity_id,
                details=details,
                old_value=old_value,
                new_value=new_value,
                ip_address=getattr(self.current_user, '_current_ip', None) if self.current_user else None,
            )
            self.db.add(log)
            await self.db.flush()
        except Exception as e:
            logger.warning("Failed to write audit log: %s", e, exc_info=True)
