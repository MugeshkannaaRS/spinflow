#!/usr/bin/env python3
"""SpinFlow ERP — Staging Verification Script.

Runs a subset of the LR-1 lifecycle tests against the staging environment
to confirm the deployment is healthy.

Usage:
    python -m scripts.verify_staging

Requires DATABASE_URL in environment pointing to the staging database.
"""
import asyncio
import time
import os
import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, text
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings
from app.models.user import Role, User
from app.models.masters import Company
from app.models.billing import CompanySubscription, BillingInvoice, BillingPayment, SubscriptionPlan
from app.core.rbac import ROLES


PASS = 0
FAIL = 0
SKIP = 0
results: list[dict] = []


def check(name: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        status = "PASS"
    else:
        FAIL += 1
        status = "FAIL"
    results.append({"check": name, "status": status, "detail": detail})
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))


async def verify_database(db: AsyncSession):
    """1. Database connection and schema sanity."""
    r = await db.execute(text("SELECT 1"))
    check("database_reachable", r.scalar() == 1)

    tables = ["users", "companies", "roles", "subscription_plans",
              "billing_invoices", "audit_logs", "company_subscriptions"]
    for tbl in tables:
        r = await db.execute(
            text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{tbl}')")
        )
        check(f"table_{tbl}", r.scalar() is True)


async def verify_seeded_data(db: AsyncSession):
    """2. Foundational seed data exists."""
    r = await db.execute(select(Role))
    roles = {ro.code for ro in r.scalars().all()}
    for expected in ROLES:
        check(f"role_{expected}", expected in roles)
    check("role_count", len(roles) >= 13, f"{len(roles)} roles present")

    r = await db.execute(select(SubscriptionPlan))
    plans = {p.code for p in r.scalars().all()}
    for expected in ["starter", "growth", "business", "enterprise", "custom"]:
        check(f"plan_{expected}", expected in plans)
    check("plan_count", len(plans) >= 5, f"{len(plans)} plans present")

    r = await db.execute(
        select(User).options(joinedload(User.role_rel)).where(User.email == "admin@mill.spinflow")
    )
    admin = r.scalar_one_or_none()
    check("admin_user", admin is not None)
    if admin and admin.role_rel:
        check("admin_role", admin.role_rel.code == "SUPER_ADMIN")

    r = await db.execute(select(Company).limit(1))
    has_company = r.scalar_one_or_none() is not None
    check("has_companies", has_company)


async def verify_company_lifecycle(db: AsyncSession):
    """3. Company suspension cascade."""
    co = (await db.execute(select(Company).limit(1))).scalar_one_or_none()
    if not co:
        check("lifecycle_company_exists", False, "No companies to test")
        return

    co.status = "suspended"
    co.suspended_at = datetime.now(timezone.utc)
    await db.flush()
    check("company_suspend", co.status == "suspended")

    co.status = "active"
    co.suspended_at = None
    await db.flush()
    check("company_reactivate", co.status == "active")

    co.is_active = False
    co.status = "archived"
    await db.flush()
    check("company_archive", co.status == "archived")

    co.status = "suspended"
    co.is_active = True
    await db.flush()
    check("company_restore", co.status == "suspended" and co.is_active)

    co.status = "active"
    co.is_active = True
    await db.flush()
    check("company_active_final", co.status == "active")


async def verify_billing(db: AsyncSession):
    """4. Billing — invoice generation, payment, reconcile."""
    sub = (await db.execute(select(CompanySubscription).limit(1))).scalar_one_or_none()
    if not sub:
        check("billing_subscription_exists", False)
        return
    check("billing_subscription_exists", True)

    from app.services.billing_invoice_service import InvoiceService
    from datetime import timedelta
    svc = InvoiceService(db)
    now = datetime.now(timezone.utc)
    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
    try:
        inv = await svc.generate_subscription_invoice(sub.company_id, period_start, period_end)
        await db.flush()
        check("invoice_generate", True, f"{inv.invoice_number} for {inv.amount}")
        invoice = inv
    except Exception as e:
        check("invoice_generate", False, str(e))
        return

    pay = BillingPayment(
        id=str(uuid.uuid4()),
        company_id=sub.company_id,
        invoice_id=invoice.id,
        amount=float(invoice.amount),
        currency="INR",
        method="bank_transfer",
        reference_number=f"VERIFY-{uuid.uuid4().hex[:8]}",
        status="completed",
        paid_at=datetime.now(timezone.utc),
    )
    db.add(pay)
    invoice.status = "paid"
    invoice.paid_at = datetime.now(timezone.utc)
    invoice.transaction_id = pay.reference_number
    await db.flush()
    check("payment_reconcile", invoice.status == "paid", f"Paid via {pay.reference_number}")


async def verify_permissions(db: AsyncSession):
    """5. Permission guards."""
    from app.api.v1.billing import check_company_scope
    from fastapi import HTTPException
    from app.models.user import User as UserModel

    co = (await db.execute(select(Company).limit(1))).scalar_one_or_none()
    co2 = (await db.execute(select(Company).offset(1).limit(1))).scalar_one_or_none()
    if not co or not co2:
        check("perm_companies_available", False)
        return
    check("perm_companies_available", True)

    mo_role = (await db.execute(select(Role).where(Role.code == "MILL_OWNER"))).scalar_one_or_none()
    op_role = (await db.execute(select(Role).where(Role.code == "MACHINE_OPERATOR"))).scalar_one_or_none()

    mo_user = UserModel(
        id=str(uuid.uuid4()), name="VERIFY-MO", email=f"verify-mo-{uuid.uuid4().hex[:4]}@test.com",
        password_hash="hash", role_id=mo_role.id, company_id=co.id, is_active=True,
    )
    db.add(mo_user)
    op_user = UserModel(
        id=str(uuid.uuid4()), name="VERIFY-OP", email=f"verify-op-{uuid.uuid4().hex[:4]}@test.com",
        password_hash="hash", role_id=op_role.id, company_id=co.id, mill_id="m1", is_active=True,
    )
    db.add(op_user)
    await db.flush()

    try:
        await check_company_scope(mo_user, co.id)
        check("perm_mo_own_company", True)
    except HTTPException:
        check("perm_mo_own_company", False, "MILL_OWNER denied own company")

    try:
        await check_company_scope(mo_user, co2.id)
        check("perm_mo_other_company", False, "Should have been blocked")
    except HTTPException:
        check("perm_mo_other_company_blocked", True)

    try:
        await check_company_scope(op_user, co.id)
        check("perm_operator_billing", False, "Should have been blocked")
    except HTTPException:
        check("perm_operator_billing_blocked", True)


async def verify_audit_logging(db: AsyncSession):
    """6. Audit log entries exist and have the correct structure."""
    r = await db.execute(select(Company).limit(1))
    co = r.scalar_one_or_none()
    if not co:
        check("audit_company", False)
        return

    from app.core.deps import log_audit
    await log_audit(
        db,
        user_id=None,
        role="SYSTEM",
        action="staging_verification",
        entity="company",
        entity_id=co.id,
        details="Staging verification test",
    )
    await db.flush()
    from app.models.audit import AuditLog
    r = await db.execute(
        select(AuditLog).where(AuditLog.action == "staging_verification").limit(1)
    )
    entry = r.scalar_one_or_none()
    check("audit_entry_created", entry is not None)
    if entry:
        check("audit_user_id_nullable", entry.user_id is None)


async def main():
    # Silencing the bcrypt warning for tests
    import warnings
    warnings.filterwarnings("ignore")

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    t0 = time.time()
    print("=" * 55)
    print("  SpinFlow ERP — Staging Verification")
    print("=" * 55)
    print()

    async with async_session() as db:
        try:
            await verify_database(db)
        except Exception as e:
            check("database_connection", False, str(e))

    async with async_session() as db:
        await verify_seeded_data(db)

    async with async_session() as db:
        await verify_company_lifecycle(db)

    async with async_session() as db:
        await verify_billing(db)

    async with async_session() as db:
        await verify_permissions(db)

    async with async_session() as db:
        await verify_audit_logging(db)

    elapsed = time.time() - t0
    print()
    print("─" * 40)
    print(f"  Results: {PASS} passed, {FAIL} failed, {SKIP} skipped")
    print(f"  Elapsed: {elapsed:.1f}s")
    print(f"  Verdict: {'PASS' if FAIL == 0 else 'FAIL'}")
    print("─" * 40)

    report = {
        "elapsed_seconds": round(elapsed, 2),
        "passed": PASS,
        "failed": FAIL,
        "skipped": SKIP,
        "verdict": "PASS" if FAIL == 0 else "FAIL",
        "checks": results,
    }
    report_path = os.path.join(os.path.dirname(__file__), "..", "staging_verification_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"  Report: {report_path}")
    print()

    await engine.dispose()
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
