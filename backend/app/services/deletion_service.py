import json
import logging
import os
import io
import zipfile
import uuid
from datetime import datetime
from typing import Dict, Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func

from app.models.user import User
from app.models.masters import Company, Mill
from app.models.deletion_log import DeletionLog
from app.core.deps import log_audit

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
BACKUP_DIR = os.getenv("BACKUP_DIR", "backups")


class CompanyDeletionService:
    """Enterprise-grade company deletion with safe cascade and rollback."""

    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.current_user = current_user
        self.company_id = None
        self.company_name = None
        self.company_code = None
        self.affected_counts: Dict[str, int] = {}

    async def _table_count(self, table: str, where: str, param: Any) -> int:
        result = await self.db.execute(text(f"SELECT COUNT(*) FROM {table} WHERE {where}"), {"p": param})
        return result.scalar() or 0

    async def _delete_from(self, table: str, where: str, param: Any) -> int:
        result = await self.db.execute(text(f"DELETE FROM {table} WHERE {where}"), {"p": param})
        return result.rowcount

    async def _delete_from_two(self, table: str, where: str, p1: Any, p2: Any) -> int:
        result = await self.db.execute(text(f"DELETE FROM {table} WHERE {where}"), {"p1": p1, "p2": p2})
        return result.rowcount

    def _inc(self, key: str, count: int = 1):
        self.affected_counts[key] = self.affected_counts.get(key, 0) + count

    async def count_all(self, company_id: str) -> Dict[str, int]:
        """Count all records that would be affected by a deletion."""
        c = company_id
        counts = {}

        mills_q = await self.db.execute(text("SELECT id FROM mills WHERE company_id = :p"), {"p": c})
        mill_ids = [row[0] for row in mills_q.fetchall()]

        if not mill_ids:
            counts["mills"] = 0
        else:
            counts["mills"] = len(mill_ids)
            placeholders = ",".join(f"'{m}'" for m in mill_ids)
            mp = placeholders

            for table, col in [
                ("master_departments", "mill_id"),
                ("employees", "mill_id"),
                ("machines", "mill_id"),
                ("shifts", "mill_id"),
                ("lots", "mill_id"),
                ("inventory_bags", "mill_id"),
                ("warehouses", "mill_id"),
                ("stock_ledger", "mill_id"),
                ("stock_balance", "mill_id"),
                ("sales_orders", "mill_id"),
                ("customers", "mill_id"),
                ("suppliers", "mill_id"),
                ("cotton_purchases", "mill_id"),
                ("yarn_counts", "mill_id"),
                ("master_vehicles", "mill_id"),
                ("master_routes", "mill_id"),
                ("mill_settings", "mill_id"),
                ("spares", "mill_id"),
                ("spare_issues", "mill_id"),
                ("monthly_payroll", "mill_id"),
                ("payroll_months", "mill_id"),
                ("payslip_entries", "mill_id"),
                ("invoices", "mill_id"),
                ("trips", "mill_id"),
                ("stock_transfers", "mill_id"),
                ("mill_masters", "mill_id"),
                ("mill_custom_fields", "mill_id"),
                ("mill_record_values", "mill_id"),
                ("column_configs", "mill_id"),
                ("column_dropdown_options", "mill_id"),
                ("import_mappings", "mill_id"),
            ]:
                q = await self.db.execute(text(f"SELECT COUNT(*) FROM {table} WHERE {col} IN ({mp})"))
                cnt = q.scalar() or 0
                if cnt:
                    counts[table] = cnt

            for table, parent_col, parent_table in [
                ("attendance", "employee_id", "employees"),
                ("leaves", "employee_id", "employees"),
                ("employee_shifts", "employee_id", "employees"),
                ("employee_custom_values", "employee_id", "employees"),
            ]:
                q = await self.db.execute(text(
                    f"SELECT COUNT(*) FROM {table} t WHERE EXISTS (SELECT 1 FROM {parent_table} e WHERE e.id = t.{parent_col} AND e.mill_id IN ({mp}))"
                ))
                cnt = q.scalar() or 0
                if cnt:
                    counts[table] = cnt

            for table, parent_col, parent_table, parent_fk in [
                ("trip_items", "trip_id", "trips", "mill_id"),
                ("trip_scan_logs", "trip_id", "trips", "mill_id"),
                ("sales_order_lines", "so_id", "sales_orders", "mill_id"),
                ("stock_movements", "lot_id", "lots", "mill_id"),
            ]:
                q = await self.db.execute(text(
                    f"SELECT COUNT(*) FROM {table} t WHERE EXISTS (SELECT 1 FROM {parent_table} p WHERE p.id = t.{parent_col} AND p.{parent_fk} IN ({mp}))"
                ))
                cnt = q.scalar() or 0
                if cnt:
                    counts[table] = cnt

            for table in ["bale_stock", "grn_entries"]:
                q = await self.db.execute(text(
                    f"SELECT COUNT(*) FROM {table} t WHERE EXISTS (SELECT 1 FROM cotton_purchases c WHERE c.id = t.purchase_id AND c.mill_id IN ({mp}))"
                ))
                cnt = q.scalar() or 0
                if cnt:
                    counts[table] = cnt

            for table in ["payments", "gst_entries"]:
                q = await self.db.execute(text(
                    f"SELECT COUNT(*) FROM {table} t WHERE EXISTS (SELECT 1 FROM invoices i WHERE i.id = t.invoice_id AND i.mill_id IN ({mp}))"
                ))
                cnt = q.scalar() or 0
                if cnt:
                    counts[table] = cnt

            for table in ["production_entries", "downtime_logs"]:
                for col in ["machine_code"]:
                    q = await self.db.execute(text(
                        f"SELECT COUNT(*) FROM {table} t WHERE EXISTS (SELECT 1 FROM machines m WHERE m.code = t.{col} AND m.mill_id IN ({mp}))"
                    ))
                    cnt = q.scalar() or 0
                    if cnt:
                        key = f"{table}_via_{col}"
                        counts[key] = counts.get(key, 0) + cnt

            for table in ["quality_tests", "lab_reports", "quality_approvals"]:
                q = await self.db.execute(text(
                    f"SELECT COUNT(*) FROM {table} t WHERE EXISTS (SELECT 1 FROM lots l WHERE l.id = t.lot_id AND l.mill_id IN ({mp}))"
                ))
                cnt = q.scalar() or 0
                if cnt:
                    counts[table] = cnt

            for table in ["maintenance_logs", "maintenance_schedule", "machine_parameters"]:
                for col in ["machine_code"]:
                    q = await self.db.execute(text(
                        f"SELECT COUNT(*) FROM {table} t WHERE EXISTS (SELECT 1 FROM machines m WHERE m.code = t.{col} AND m.mill_id IN ({mp}))"
                    ))
                    cnt = q.scalar() or 0
                    if cnt:
                        key = f"{table}_via_{col}"
                        counts[key] = counts.get(key, 0) + cnt

            dispatches_q = await self.db.execute(text(
                f"SELECT COUNT(*) FROM dispatches d WHERE EXISTS (SELECT 1 FROM lots l WHERE l.id = d.lot_id AND l.mill_id IN ({mp}))"
            ))
            dc = dispatches_q.scalar() or 0
            if dc:
                counts["dispatches"] = dc
                di_q = await self.db.execute(text(
                    f"SELECT COUNT(*) FROM dispatch_items di WHERE EXISTS (SELECT 1 FROM dispatches d WHERE d.id = di.dispatch_id AND EXISTS (SELECT 1 FROM lots l WHERE l.id = d.lot_id AND l.mill_id IN ({mp})))"
                ))
                dic = di_q.scalar() or 0
                if dic:
                    counts["dispatch_items"] = dic

            bale_stock_q = await self.db.execute(text(
                f"SELECT COUNT(*) FROM cotton_bales b WHERE EXISTS (SELECT 1 FROM bale_stock bs WHERE bs.bale_no = b.bale_number AND EXISTS (SELECT 1 FROM cotton_purchases c WHERE c.id = bs.purchase_id AND c.mill_id IN ({mp})))"
            ))
            bc = bale_stock_q.scalar() or 0
            if bc:
                counts["cotton_bales"] = bc

        counts["company_modules"] = await self._table_count("company_modules", "company_id = :p", c)
        counts["company_subscriptions"] = await self._table_count("company_subscriptions", "company_id = :p", c)
        counts["billing_invoices"] = await self._table_count("billing_invoices", "company_id = :p", c)
        counts["billing_payments"] = await self._table_count("billing_payments", "company_id = :p", c)
        counts["overage_pricing"] = await self._table_count("overage_pricing", "company_id = :p", c)
        counts["subscription_change_requests"] = await self._table_count("subscription_change_requests", "company_id = :p", c)
        counts["employee_custom_fields"] = await self._table_count("employee_custom_fields", "company_id = :p", c)

        users_q = await self.db.execute(text("SELECT COUNT(*) FROM users WHERE company_id = :p"), {"p": c})
        user_count = users_q.scalar() or 0
        if user_count:
            sessions_q = await self.db.execute(text(
                f"SELECT COUNT(*) FROM user_sessions us WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = us.user_id AND u.company_id = :p)"
            ), {"p": c})
            sc = sessions_q.scalar() or 0
            if sc:
                counts["user_sessions"] = sc
            counts["users"] = user_count

        audit_q = await self.db.execute(text(
            f"SELECT COUNT(*) FROM audit_logs al WHERE al.user_id IN (SELECT id FROM users WHERE company_id = :p)"
        ), {"p": c})
        ac = audit_q.scalar() or 0
        if ac:
            counts["audit_logs"] = ac

        qr_q = await self.db.execute(text(
            f"SELECT COUNT(*) FROM qr_scans qs WHERE qs.entity_id IN (SELECT id FROM users WHERE company_id = :p)"
        ), {"p": c})
        qc = qr_q.scalar() or 0
        if qc:
            counts["qr_scans"] = qc

        document_q = await self.db.execute(text("SELECT COUNT(*) FROM document_attachments"))
        total_docs = document_q.scalar() or 0
        if total_docs:
            counts["document_attachments"] = total_docs

        filter_ = {"company_id": "company_id", "mill_id": "mill_id"}
        for table, col in [
            ("dispatches", None),
        ]:
            pass

        return counts

    async def generate_backup(self, company_id: str) -> str:
        """Generate a ZIP backup of all company data. Returns the backup key."""
        c = company_id
        mills_q = await self.db.execute(text("SELECT id, code, name FROM mills WHERE company_id = :p"), {"p": c})
        mills = mills_q.fetchall()
        mill_ids = [m[0] for m in mills]
        mp = ",".join(f"'{m}'" for m in mill_ids) if mill_ids else "''"

        backup_id = str(uuid.uuid4())
        os.makedirs(BACKUP_DIR, exist_ok=True)
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            tables = ["companies", "mills"]
            for t in tables:
                try:
                    rows = (await self.db.execute(text(f"SELECT * FROM {t} WHERE id = :p" if t == "companies" else f"SELECT * FROM {t} WHERE company_id = :p"), {"p": c})).fetchall()
                    if rows:
                        zf.writestr(f"{t}.json", json.dumps([dict(r._mapping) for r in rows], default=str))
                except Exception as e:
                    logger.warning(f"Backup table {t}: {e}")

            for table, col in [
                ("master_departments", "mill_id"), ("employees", "mill_id"),
                ("machines", "mill_id"), ("lots", "mill_id"),
                ("warehouses", "mill_id"), ("customers", "mill_id"),
                ("suppliers", "mill_id"), ("sales_orders", "mill_id"),
                ("invoices", "mill_id"),
            ]:
                try:
                    rows = (await self.db.execute(text(f"SELECT * FROM {table} WHERE {col} IN ({mp})"))).fetchall()
                    if rows:
                        zf.writestr(f"{table}.json", json.dumps([dict(r._mapping) for r in rows], default=str))
                except Exception as e:
                    logger.warning(f"Backup table {table}: {e}")

        backup_path = os.path.join(BACKUP_DIR, f"company_{company_id}_{backup_id}.zip")
        with open(backup_path, "wb") as f:
            f.write(buf.getvalue())

        logger.info(f"Backup created: {backup_path}")
        return backup_id

    async def hard_delete(self, company_id: str) -> Dict[str, Any]:
        """Permanently delete a company and all related data."""
        company_q = await self.db.execute(select(Company).where(Company.id == company_id))
        company = company_q.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

        self.company_id = company_id
        self.company_name = company.name
        self.company_code = company.code

        mills_q = await self.db.execute(text("SELECT id FROM mills WHERE company_id = :p"), {"p": company_id})
        mill_ids = [row[0] for row in mills_q.fetchall()]
        mp = ",".join(f"'{m}'" for m in mill_ids) if mill_ids else "''"

        deletion_log_entry = DeletionLog(
            company_id=company_id,
            company_name=self.company_name,
            company_code=self.company_code,
            deleted_by=self.current_user.id,
            deleted_by_name=self.current_user.name,
            mode="hard",
            deletion_result="in_progress",
        )
        self.db.add(deletion_log_entry)
        await self.db.flush()

        try:
            counts = {}
            tables_to_log = [
                ("trip_scan_logs", f"trip_id IN (SELECT id FROM trips WHERE mill_id IN ({mp}))"),
                ("trip_items", f"trip_id IN (SELECT id FROM trips WHERE mill_id IN ({mp}))"),
                ("sales_order_lines", f"so_id IN (SELECT id FROM sales_orders WHERE mill_id IN ({mp}))"),
                ("stock_movements", f"lot_id IN (SELECT id FROM lots WHERE mill_id IN ({mp}))"),
                ("bale_stock", f"purchase_id IN (SELECT id FROM cotton_purchases WHERE mill_id IN ({mp}))"),
                ("grn_entries", f"purchase_id IN (SELECT id FROM cotton_purchases WHERE mill_id IN ({mp}))"),
                ("dispatch_items", f"dispatch_id IN (SELECT id FROM dispatches WHERE lot_id IN (SELECT id FROM lots WHERE mill_id IN ({mp})))"),
                ("payments", f"invoice_id IN (SELECT id FROM invoices WHERE mill_id IN ({mp}))"),
                ("gst_entries", f"invoice_id IN (SELECT id FROM invoices WHERE mill_id IN ({mp}))"),
                ("employee_custom_values", f"employee_id IN (SELECT id FROM employees WHERE mill_id IN ({mp}))"),
                ("attendance", f"employee_id IN (SELECT id FROM employees WHERE mill_id IN ({mp}))"),
                ("leaves", f"employee_id IN (SELECT id FROM employees WHERE mill_id IN ({mp}))"),
                ("employee_shifts", f"employee_id IN (SELECT id FROM employees WHERE mill_id IN ({mp}))"),
                ("payslip_entries", f"payroll_month_id IN (SELECT id FROM payroll_months WHERE mill_id IN ({mp}))"),
                ("quality_tests", f"lot_id IN (SELECT id FROM lots WHERE mill_id IN ({mp}))"),
                ("lab_reports", f"lot_id IN (SELECT id FROM lots WHERE mill_id IN ({mp}))"),
                ("quality_approvals", f"lot_id IN (SELECT id FROM lots WHERE mill_id IN ({mp}))"),
                ("production_entries", f"machine_code IN (SELECT code FROM machines WHERE mill_id IN ({mp}))"),
                ("downtime_logs", f"machine_code IN (SELECT code FROM machines WHERE mill_id IN ({mp}))"),
                ("maintenance_logs", f"machine_code IN (SELECT code FROM machines WHERE mill_id IN ({mp}))"),
                ("maintenance_schedule", f"machine_code IN (SELECT code FROM machines WHERE mill_id IN ({mp}))"),
                ("machine_parameters", f"machine_code IN (SELECT code FROM machines WHERE mill_id IN ({mp}))"),
                ("dispatches", f"lot_id IN (SELECT id FROM lots WHERE mill_id IN ({mp}))"),
            ]

            if mill_ids:
                cnt_cb = await self.db.execute(text(
                    f"DELETE FROM cotton_bales WHERE bale_number IN (SELECT bs.bale_no FROM bale_stock bs WHERE bs.purchase_id IN (SELECT id FROM cotton_purchases WHERE mill_id IN ({mp})))"
                ))
                cb_cnt = cnt_cb.rowcount
                if cb_cnt:
                    counts["cotton_bales"] = cb_cnt

                direct_mill_tables = [
                    "stock_balance",
                    "stock_ledger",
                    "inventory_bags",
                    "lots",
                    "stock_transfers",
                    "trips",
                    "spare_issues",
                    "spares",
                    "monthly_payroll",
                    "payroll_months",
                    "invoices",
                    "suppliers",
                    "cotton_purchases",
                    "sales_orders",
                    "customers",
                    "master_vehicles",
                    "master_routes",
                    "yarn_counts",
                    "mill_settings",
                    "machines",
                    "shifts",
                    "warehouses",
                    "employees",
                    "master_departments",
                    "mill_masters",
                    "mill_custom_fields",
                    "mill_record_values",
                    "column_configs",
                    "column_dropdown_options",
                    "import_mappings",
                ]

                for table in direct_mill_tables:
                    cnt = await self._delete_from(table, f"mill_id IN ({mp})", None)
                    if cnt:
                        counts[table] = cnt

                for table, cond in tables_to_log:
                    cnt = await self._delete_from(table, cond, None)
                    if cnt:
                        counts[table] = cnt

            user_ids = []
            users_q = await self.db.execute(text("SELECT id FROM users WHERE company_id = :p"), {"p": company_id})
            user_ids = [row[0] for row in users_q.fetchall()]
            if user_ids:
                up = ",".join(f"'{u}'" for u in user_ids)
                for table, cond in [
                    ("user_sessions", f"user_id IN ({up})"),
                    ("audit_logs", f"user_id IN ({up})"),
                    ("qr_scans", f"scanned_by IN ({up})"),
                ]:
                    cnt = await self._delete_from(table, cond, None)
                    if cnt:
                        counts[table] = cnt
                cnt = await self._delete_from("users", "company_id = :p", company_id)
                if cnt:
                    counts["users"] = cnt

            for table in ["billing_payments", "billing_invoices"]:
                cnt = await self._delete_from(table, "company_id = :p", company_id)
                if cnt:
                    counts[table] = cnt

            for table in ["overage_pricing", "company_modules", "company_subscriptions", "subscription_change_requests", "employee_custom_fields"]:
                cnt = await self._delete_from(table, "company_id = :p", company_id)
                if cnt:
                    counts[table] = cnt

            cnt = await self._delete_from("mills", "company_id = :p", company_id)
            if cnt:
                counts["mills"] = cnt

            cnt = await self._delete_from("companies", "id = :p", company_id)
            if cnt:
                counts["company"] = cnt

            self.affected_counts = counts
            deletion_log_entry.affected_records = counts
            deletion_log_entry.deletion_result = "success"
            await self.db.flush()

            role_code = self.current_user.role_rel.code if self.current_user.role_rel else "SUPER_ADMIN"
            await log_audit(
                self.db, self.current_user.id, role_code,
                "company_deleted", "company", company_id,
                f"Company '{self.company_name}' ({self.company_code}) permanently deleted. Records affected: {json.dumps(counts)}",
            )

            return {"success": True, "company_name": self.company_name, "affected_records": counts}

        except Exception as e:
            deletion_log_entry.deletion_result = "failed"
            deletion_log_entry.error_message = str(e)
            await self.db.flush()
            logger.error(f"Company deletion failed for {company_id}: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Deletion failed: {str(e)}")

    async def archive(self, company_id: str) -> Dict[str, Any]:
        """Soft-delete (archive) a company. Marks as inactive, data remains."""
        company_q = await self.db.execute(select(Company).where(Company.id == company_id))
        company = company_q.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

        company.is_active = False
        company.status = "archived"
        company.archived_at = datetime.utcnow()
        self.db.add(company)
        await self.db.flush()

        mills_q = await self.db.execute(text("UPDATE mills SET is_active = false WHERE company_id = :p"), {"p": company_id})
        user_q = await self.db.execute(text("UPDATE users SET is_active = false WHERE company_id = :p"), {"p": company_id})

        role_code = self.current_user.role_rel.code if self.current_user.role_rel else "SUPER_ADMIN"
        await log_audit(
            self.db, self.current_user.id, role_code,
            "company_archived", "company", company_id,
            f"Company '{company.name}' ({company.code}) archived (soft-deleted)",
        )

        return {"success": True, "company_name": company.name, "status": "archived"}
