from typing import Dict
from datetime import datetime, timezone, date
from sqlalchemy import select, func, and_
from app.services.base import BaseService
from app.models.accounts import Invoice, GSTEntry
from app.models.payroll import PayrollMonth
from app.models.stock import StockLedger
from app.models.purchase import CottonPurchase


class AccountsService(BaseService[Invoice]):
    async def get_cogs(
        self,
        mill_id: str,
        date_from: date,
        date_to: date,
    ) -> dict:
        dt_from = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
        dt_to = datetime(date_to.year, date_to.month, date_to.day, tzinfo=timezone.utc)
        result = await self.db.execute(
            select(
                StockLedger.yarn_count,
                func.coalesce(func.sum(StockLedger.weight_out_kg), 0),
            )
            .where(
                and_(
                    StockLedger.mill_id == mill_id,
                    StockLedger.move_type.in_(["DISPATCH_OUT", "DELIVERY_CONFIRMED"]),
                    StockLedger.created_at >= dt_from,
                    StockLedger.created_at < dt_to,
                )
            )
            .group_by(StockLedger.yarn_count)
        )
        rate_result = await self.db.execute(
            select(func.avg(CottonPurchase.rate_per_kg))
            .where(CottonPurchase.mill_id == mill_id)
        )
        avg_unit_cost = float(rate_result.scalar() or 0)

        by_yarn = []
        total_cogs = 0.0
        for yarn_count, weight_kg in result.all():
            weight_kg = float(weight_kg)
            estimated_value = round(weight_kg * avg_unit_cost, 2)
            total_cogs += estimated_value
            by_yarn.append({
                "yarn_count": yarn_count or "Unknown",
                "weight_kg": weight_kg,
                "estimated_value": estimated_value,
            })
        return {"total_cogs": round(total_cogs, 2), "by_yarn_count": by_yarn}

    async def get_pl_statement(
        self,
        mill_id: str,
        month: int,
        year: int,
    ) -> dict:
        date_prefix = f"{year}-{month:02d}"

        rev_result = await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total), 0))
            .where(
                and_(
                    Invoice.status != "cancelled",
                    Invoice.date.like(f"{date_prefix}%"),
                )
            )
        )
        revenue = float(rev_result.scalar() or 0)

        date_from = date(year, month, 1)
        if month == 12:
            date_to = date(year + 1, 1, 1)
        else:
            date_to = date(year, month + 1, 1)

        cogs_data = await self.get_cogs(mill_id, date_from, date_to)
        cogs = cogs_data["total_cogs"]
        gross_profit = round(revenue - cogs, 2)
        gross_margin_pct = round((gross_profit / revenue * 100), 2) if revenue > 0 else 0.0

        payroll_result = await self.db.execute(
            select(func.coalesce(func.sum(PayrollMonth.total_net), 0))
            .where(
                and_(
                    PayrollMonth.mill_id == mill_id,
                    PayrollMonth.month == month,
                    PayrollMonth.year == year,
                )
            )
        )
        payroll_expense = float(payroll_result.scalar() or 0)

        expenses = {
            "payroll": payroll_expense,
            "other": 0.0,
            "total": payroll_expense,
        }
        net_profit = round(gross_profit - expenses["total"], 2)
        net_margin_pct = round((net_profit / revenue * 100), 2) if revenue > 0 else 0.0

        return {
            "revenue": revenue,
            "cogs": cogs,
            "gross_profit": gross_profit,
            "gross_margin_pct": gross_margin_pct,
            "expenses": expenses,
            "net_profit": net_profit,
            "net_margin_pct": net_margin_pct,
            "month": month,
            "year": year,
        }

    async def receivables_ageing(
        self,
        mill_id: str,
    ) -> dict:
        today = date.today()
        result = await self.db.execute(
            select(Invoice).where(
                Invoice.status.in_(["posted", "overdue"]),
                Invoice.mill_id == mill_id,
            )
        )
        invoices = result.scalars().all()

        buckets = {"current": 0.0, "days_31_60": 0.0, "days_61_90": 0.0, "over_90": 0.0}
        total_outstanding = 0.0
        oldest_invoice_days = 0

        for inv in invoices:
            due_date_str = inv.due_date
            if due_date_str:
                try:
                    due = date.fromisoformat(due_date_str)
                except (ValueError, TypeError):
                    due = None
            else:
                due = None

            if due:
                days_overdue = (today - due).days
            else:
                days_overdue = 0

            outstanding = inv.total
            total_outstanding += outstanding
            oldest_invoice_days = max(oldest_invoice_days, days_overdue)

            if days_overdue <= 30:
                buckets["current"] += outstanding
            elif days_overdue <= 60:
                buckets["days_31_60"] += outstanding
            elif days_overdue <= 90:
                buckets["days_61_90"] += outstanding
            else:
                buckets["over_90"] += outstanding

        return {
            "buckets": buckets,
            "total_outstanding": round(total_outstanding, 2),
            "invoice_count": len(invoices),
            "oldest_invoice_days": oldest_invoice_days,
        }

    async def payables_ageing(
        self,
        mill_id: str,
    ) -> dict:
        result = await self.db.execute(
            select(CottonPurchase).where(
                CottonPurchase.status.in_(["completed", "grn_pending", "pending"]),
                CottonPurchase.mill_id == mill_id,
            )
        )
        purchases = result.scalars().all()

        today = date.today()
        by_supplier: Dict[str, dict] = {}
        total_payables = 0.0

        for p in purchases:
            total_value = p.net_kg * p.rate_per_kg
            supplier_name = p.supplier_name or "Unknown"
            days_since_grn = 0
            if p.date:
                try:
                    purchase_date = date.fromisoformat(p.date)
                    days_since_grn = (today - purchase_date).days
                except (ValueError, TypeError):
                    pass

            total_payables += total_value
            if supplier_name not in by_supplier:
                by_supplier[supplier_name] = {
                    "supplier_name": supplier_name,
                    "amount": 0.0,
                    "days_since_grn": days_since_grn,
                }
            by_supplier[supplier_name]["amount"] += total_value

        return {
            "total_payables": round(total_payables, 2),
            "by_supplier": list(by_supplier.values()),
        }

    async def gst_summary(
        self,
        mill_id: str,
        month: int,
        year: int,
    ) -> dict:
        date_prefix = f"{year}-{month:02d}"

        output_result = await self.db.execute(
            select(
                func.coalesce(func.sum(GSTEntry.cgst), 0),
                func.coalesce(func.sum(GSTEntry.sgst), 0),
                func.coalesce(func.sum(GSTEntry.igst), 0),
            )
            .select_from(GSTEntry)
            .join(Invoice, GSTEntry.invoice_id == Invoice.id)
            .where(
                and_(
                    Invoice.status != "cancelled",
                    Invoice.date.like(f"{date_prefix}%"),
                )
            )
        )
        cgst, sgst, igst = output_result.one()
        output_gst = {
            "cgst": float(cgst or 0),
            "sgst": float(sgst or 0),
            "igst": float(igst or 0),
            "total": float(cgst or 0) + float(sgst or 0) + float(igst or 0),
        }

        input_result = await self.db.execute(
            select(func.coalesce(func.sum(CottonPurchase.gst_amount), 0))
            .where(
                CottonPurchase.date.like(f"{date_prefix}%")
            )
        )
        input_gst_total = float(input_result.scalar() or 0)

        return {
            "output_gst": output_gst,
            "input_gst": {"total": input_gst_total},
            "net_payable": round(output_gst["total"] - input_gst_total, 2),
            "month": month,
            "year": year,
        }
