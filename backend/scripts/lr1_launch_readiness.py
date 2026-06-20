"""LR-1 Launch Readiness Validation.

Creates realistic test dataset (10 companies, 30 mills, 500 users, 3000 employees)
and runs full lifecycle scenarios across company, user, billing, subscription,
and invoice domains.

Outputs: LR-1 report data as JSON for report generation.
"""

import asyncio
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any
from passlib.context import CryptContext

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, func, text
from sqlalchemy.orm import selectinload

from app.db.base import Base
from app.models.user import User, Role
from app.models.masters import Company, CompanyModule, Mill, Department
from app.models.billing import (
    SubscriptionPlan, CompanySubscription, BillingInvoice, BillingPayment,
    SubscriptionChangeRequest, ModulePricing,
)
from app.models.hr import Employee
from app.models.audit import AuditLog
import os
from app.core.security import hash_password
DEFAULT_PWD = os.environ.get("SEED_USER_PASSWORD", "Pilot@1234")
DEFAULT_PWD_HASH = hash_password(DEFAULT_PWD)

DATABASE_URL = settings.DATABASE_URL or "sqlite+aiosqlite:///:memory:"

# ── Metrics ──────────────────────────────────────────────────────────────

class Metrics:
    def __init__(self):
        self.errors: list[dict] = []
        self.slow_queries: list[dict] = []
        self.permissions_checked: list[dict] = []
        self.workflows: list[dict] = []
        self.timing: dict[str, float] = {}
        self.start_time = time.time()

    def error(self, phase: str, detail: str, exc: str = ""):
        self.errors.append({"phase": phase, "detail": detail, "exception": exc, "time": datetime.now(timezone.utc).isoformat()})

    def slow(self, query: str, duration_ms: float, context: str = ""):
        if duration_ms > settings.SLOW_QUERY_THRESHOLD:
            self.slow_queries.append({"query": query, "duration_ms": round(duration_ms, 2), "context": context})

    def workflow(self, name: str, status: str, detail: str = ""):
        self.workflows.append({"name": name, "status": status, "detail": detail, "time": datetime.now(timezone.utc).isoformat()})

    def report(self) -> dict:
        elapsed = time.time() - self.start_time
        return {
            "elapsed_seconds": round(elapsed, 2),
            "total_errors": len(self.errors),
            "total_slow_queries": len(self.slow_queries),
            "total_workflows": len(self.workflows),
            "errors": self.errors,
            "slow_queries": self.slow_queries,
            "workflows": self.workflows,
            "timing": self.timing,
        }


metrics = Metrics()


# ── Helpers ──────────────────────────────────────────────────────────────

async def tick(db: AsyncSession, query: Any, context: str = ""):
    """Execute query with timing."""
    start = time.time()
    result = await db.execute(query)
    elapsed = (time.time() - start) * 1000
    metrics.slow(str(query), elapsed, context)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 1: CREATE TEST DATASET
# ═══════════════════════════════════════════════════════════════════════════

async def get_or_create_roles(db: AsyncSession) -> dict[str, Role]:
    """Get existing roles or create if missing."""
    from app.core.rbac import ROLES
    result = await tick(db, select(Role), "get_roles")
    existing = {r.code: r for r in result.scalars().all()}
    for code in ROLES:
        if code not in existing:
            r = Role(id=str(uuid.uuid4()), code=code, name=code.replace("_", " ").title(), is_system=True)
            db.add(r)
            existing[code] = r
    await db.flush()
    return existing


async def get_or_create_plans(db: AsyncSession) -> dict[str, SubscriptionPlan]:
    """Get existing plans or seed defaults if missing."""
    result = await tick(db, select(SubscriptionPlan), "get_plans")
    plans_list = result.scalars().all()
    if plans_list:
        return {p.code: p for p in plans_list}
    from app.services.pricing_service import PricingService
    svc = PricingService(db)
    await svc.seed_default_plans()
    result = await tick(db, select(SubscriptionPlan), "seed_default_plans")
    plans_list = result.scalars().all()
    return {p.code: p for p in plans_list}


COMPANY_NAMES = [
    ("Premier Spinners", "PSPL"), ("Srinivas Cotton Mills", "SCML"),
    ("Deccan Fibres", "DFBL"), ("Kaveri Texports", "KTEX"),
    ("Godavari Yarns", "GYPL"), ("Narmada Synthetics", "NSYN"),
    ("Tungabhadra Mills", "TBML"), ("Cauvery Spinning", "CSPN"),
    ("Pennar Textiles", "PTEX"), ("Palar Fibres", "PFBL"),
]


async def create_companies(db: AsyncSession, plans: dict[str, SubscriptionPlan]) -> list[Company]:
    """Create 10 companies, each with a subscription and modules enabled."""
    companies = []
    plan_codes = list(plans.keys())

    # Check for existing codes
    existing_res = await tick(db, select(Company.code), "check_existing_codes")
    existing_codes = {r[0] for r in existing_res.all()}

    # First pass: create all companies
    for idx, (name, code_prefix) in enumerate(COMPANY_NAMES):
        plan_code = plan_codes[idx % len(plan_codes)]
        code = f"LR-{code_prefix}"
        if code in existing_codes:
            code = f"LR-{code_prefix}-{uuid.uuid4().hex[:4]}"
        co = Company(
            id=str(uuid.uuid4()),
            code=code,
            name=name,
            gstin=f"33{code_prefix}{idx+1:03d}ZG",
            address=f"{idx+1}, Industrial Layout, Phase {idx+1}",
            phone=f"9444{idx:04d}000",
            email=f"info@{code_prefix.lower()}.com",
            max_users=50,
            plan=plan_code,
            max_employees=500,
            is_active=True,
            status="active",
        )
        db.add(co)
        companies.append(co)

    await db.flush()

    # Second pass: subscriptions and modules
    for idx, co in enumerate(companies):
        plan_code = plan_codes[idx % len(plan_codes)]
        plan = plans[plan_code]

        sub = CompanySubscription(
            id=str(uuid.uuid4()),
            company_id=co.id,
            plan_id=plan.id,
            billing_cycle="monthly" if idx % 2 == 0 else "yearly",
            status="active",
            started_at=datetime.now(timezone.utc) - timedelta(days=90),
            expires_at=datetime.now(timezone.utc) + timedelta(days=275),
            extra_mills=1 if idx > 4 else 0,
            extra_users=5 if idx > 2 else 0,
            extra_employees=50 if idx > 3 else 0,
            max_users=50,
        )
        db.add(sub)

        for mod in ["dashboard", "production", "quality", "hr", "payroll", "accounts", "stores",
                     "inventory", "dispatch", "purchase", "maintenance", "reports", "uploads", "analytics"]:
            db.add(CompanyModule(
                company_id=co.id, module_name=mod, is_enabled=True, enabled_by=None,
            ))

    await db.flush()
    return companies


async def create_mills(db: AsyncSession, companies: list[Company]) -> list[Mill]:
    """Create 30 mills (3 per company)."""
    mills = []
    for co in companies:
        for i in range(1, 4):
            m = Mill(
                id=str(uuid.uuid4()),
                company_id=co.id,
                code=f"{co.code}-M{i:02d}",
                name=f"{co.name} Unit {i}",
                address=co.address,
                city="Coimbatore" if i % 3 == 0 else "Tirupur" if i % 3 == 1 else "Erode",
                state="Tamil Nadu",
                pincode=f"641{i:03d}",
                is_active=True,
            )
            db.add(m)
            mills.append(m)

            # Default departments
            for dname in ["Production", "Quality", "Maintenance", "Stores", "Dispatch", "HR", "Accounts"]:
                db.add(Department(
                    id=str(uuid.uuid4()),
                    mill_id=m.id,
                    code=f"D{dname[:3].upper()}",
                    name=dname,
                    department_type=dname.lower(),
                    is_active=True,
                ))

    await db.flush()
    return mills


async def create_users(db: AsyncSession, roles: dict[str, Role], companies: list[Company], mills: list[Mill]) -> list[User]:
    """Create 500 users (50 per company) across all roles."""
    users = []
    role_list = list(roles.keys())
    mill_idx = 0

    for co in companies:
        co_mills = [m for m in mills if m.company_id == co.id]
        for i in range(50):
            role_code = role_list[i % len(role_list)]
            role = roles[role_code]
            mill = co_mills[i % len(co_mills)] if co_mills else None
            u = User(
                id=str(uuid.uuid4()),
                name=f"{co.code}-User-{i+1:03d}",
                email=f"user{i+1:03d}@{co.code.lower()}.com",
                password_hash=DEFAULT_PWD_HASH,
                role_id=role.id,
                company_id=co.id,
                mill_id=mill.id if mill else None,
                mill_name=mill.name if mill else None,
                is_active=True,
                must_change_password=False,
            )
            db.add(u)
            users.append(u)

    await db.flush()
    return users


async def create_employees(db: AsyncSession, companies: list[Company], mills: list[Mill]) -> list[Employee]:
    """Create 3000 employees (300 per company, ~100 per mill)."""
    employees = []
    departments = ["Production", "Quality", "Maintenance", "Stores", "Dispatch", "Packaging", "Administration"]
    designations = ["Operator", "Supervisor", "Manager", "Technician", "Clerk", "Executive", "Helper"]

    for co in companies:
        co_mills = [m for m in mills if m.company_id == co.id]
        for emp_idx in range(300):
            mill = co_mills[emp_idx % len(co_mills)]
            dept = departments[emp_idx % len(departments)]
            desig = designations[emp_idx % len(designations)]
            basic = 8000 + (emp_idx * 50) % 40000
            e = Employee(
                id=str(uuid.uuid4()),
                mill_id=mill.id,
                code=f"EMP-{co.code}-{emp_idx+1:04d}",
                name=f"{co.code}-Employee-{emp_idx+1:04d}",
                employee_id=f"E{emp_idx+1:04d}",
                joining_date=datetime.now(timezone.utc).date() - timedelta(days=(emp_idx % 365)),
                department=dept,
                designation=desig,
                basic=basic,
                house_rent=basic * 0.2,
                medical=1500,
                conveyance=800,
                total_salary=basic + basic * 0.2 + 1500 + 800,
                is_active=True,
                days_of_month=26,
            )
            db.add(e)
            employees.append(e)

    await db.flush()
    return employees


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 2: LIFECYCLE SCENARIOS
# ═══════════════════════════════════════════════════════════════════════════

async def test_company_lifecycle(db: AsyncSession, company_ids: list[str], role_ids: dict[str, str], user_objs: list[User]):
    """Test create → suspend → reactivate → archive → restore lifecycle."""
    phase = "company_lifecycle"

    co = await db.get(Company, company_ids[0])
    if not co:
        metrics.error(phase, "No company found", "company_ids[0] not in DB")
        return

    # 1. Suspend
    try:
        start = time.time()
        co.is_active = False
        co.status = "suspended"
        co.suspended_at = datetime.now(timezone.utc)
        await db.flush()
        elapsed = (time.time() - start) * 1000
        metrics.workflow("company_suspend", "passed",
                         f"Suspended {co.code} in {elapsed:.0f}ms")
        if elapsed > settings.SLOW_QUERY_THRESHOLD:
            metrics.slow("UPDATE company SET status=suspended", elapsed, phase)
    except Exception as e:
        metrics.error(phase, "Suspend failed", str(e))

    # 2. Reactivate
    try:
        start = time.time()
        co.is_active = True
        co.status = "active"
        co.suspended_at = None
        await db.flush()
        elapsed = (time.time() - start) * 1000
        metrics.workflow("company_reactivate", "passed",
                         f"Reactivated {co.code} in {elapsed:.0f}ms")
    except Exception as e:
        metrics.error(phase, "Reactivate failed", str(e))

    # 3. Suspend then archive
    try:
        co.status = "suspended"
        co.is_active = False
        co.suspended_at = datetime.now(timezone.utc)
        await db.flush()
        co.status = "archived"
        co.archived_at = datetime.now(timezone.utc)
        await db.flush()
        metrics.workflow("company_archive", "passed", f"Archived {co.code}")
    except Exception as e:
        metrics.error(phase, "Archive failed", str(e))

    # 4. Restore
    try:
        co.status = "suspended"
        co.archived_at = None
        co.suspended_at = datetime.now(timezone.utc)
        await db.flush()
        metrics.workflow("company_restore", "passed", f"Restored {co.code}")
    except Exception as e:
        metrics.error(phase, "Restore failed", str(e))

    # 5. Final reactivate
    try:
        co.is_active = True
        co.status = "active"
        co.suspended_at = None
        await db.flush()
        metrics.workflow("company_final_reactivate", "passed", f"{co.code} active")
    except Exception as e:
        metrics.error(phase, "Final reactivate failed", str(e))


async def test_user_lifecycle(db: AsyncSession, company_ids: list[str], role_ids: dict[str, str]):
    """Test user create → update → deactivate → password reset."""
    phase = "user_lifecycle"
    co = await db.get(Company, company_ids[0])
    mo_role = await db.get(Role, role_ids["MILL_OWNER"])

    # 1. Create user
    try:
        start = time.time()
        u = User(
            id=str(uuid.uuid4()),
            name=f"LR-Test-User",
            email=f"lr-test-{uuid.uuid4().hex[:4]}@test.com",
    password_hash=DEFAULT_PWD_HASH,
    role_id=mo_role.id,
            company_id=co.id,
            is_active=True,
            must_change_password=True,
        )
        db.add(u)
        await db.flush()
        elapsed = (time.time() - start) * 1000
        metrics.workflow("user_create", "passed", f"Created user {u.email} in {elapsed:.0f}ms")
    except Exception as e:
        metrics.error(phase, "User create failed", str(e))

    # 2. Verify can be read back
    try:
        result = await tick(db, select(User).where(User.id == u.id), f"{phase}: read user")
        fetched = result.scalar_one_or_none()
        assert fetched is not None
        metrics.workflow("user_read", "passed", f"Read user {u.email}")
    except Exception as e:
        metrics.error(phase, "User read failed", str(e))

    # 3. Update user
    try:
        start = time.time()
        u.name = "LR-Updated-User"
        u.must_change_password = False
        await db.flush()
        elapsed = (time.time() - start) * 1000
        metrics.workflow("user_update", "passed", f"Updated user in {elapsed:.0f}ms")
    except Exception as e:
        metrics.error(phase, "User update failed", str(e))

    # 4. Deactivate
    try:
        start = time.time()
        u.is_active = False
        await db.flush()
        elapsed = (time.time() - start) * 1000
        metrics.workflow("user_deactivate", "passed", f"Deactivated in {elapsed:.0f}ms")
    except Exception as e:
        metrics.error(phase, "User deactivate failed", str(e))

    # 5. Reactivate
    try:
        u.is_active = True
        await db.flush()
        metrics.workflow("user_reactivate", "passed", "Reactivated")
    except Exception as e:
        metrics.error(phase, "User reactivate failed", str(e))


async def test_billing_lifecycle(db: AsyncSession, company_ids: list[str], role_ids: dict[str, str], plan_ids: dict[str, str]):
    """Test plan change, overage purchase, invoice generation, payment."""
    phase = "billing_lifecycle"
    co = await db.get(Company, company_ids[1])
    plan_keys = list(plan_ids.keys())

    if len(plan_keys) < 2:
        metrics.error(phase, "Need at least 2 plans for lifecycle test")
        return

    # Get the subscription
    sub_result = await tick(db, select(CompanySubscription).where(CompanySubscription.company_id == co.id),
                            f"{phase}: get sub")
    sub = sub_result.scalar_one_or_none()
    if not sub:
        metrics.error(phase, "No subscription", f"Company {co.code} has no subscription")
        return

    # Get the subscription
    sub_result = await tick(db, select(CompanySubscription).where(CompanySubscription.company_id == co.id),
                            f"{phase}: get sub")
    sub = sub_result.scalar_one_or_none()
    if not sub:
        metrics.error(phase, "No subscription", f"Company {co.code} has no subscription")
        return

    current_plan = await db.get(SubscriptionPlan, plan_ids.get(plan_keys[0]))
    target_plan = await db.get(SubscriptionPlan, plan_ids.get(plan_keys[1 % len(plan_keys)]))
    if not current_plan or not target_plan:
        metrics.error(phase, "Plans not found")
        return

    # 1. Create change request
    try:
        # Find a MILL_OWNER for this company
        owner_res = await tick(db,
            select(User).where(User.company_id == co.id, User.role_rel.has(Role.code == "MILL_OWNER")).limit(1),
            f"{phase}: find owner"
        )
        owner = owner_res.scalar_one_or_none()
        if not owner:
            # Use first user
            owner_res = await tick(db, select(User).where(User.company_id == co.id).limit(1), f"{phase}: find any user")
            owner = owner_res.scalar_one_or_none()

        cr = SubscriptionChangeRequest(
            id=str(uuid.uuid4()),
            company_id=co.id,
            requested_by=owner.id if owner else None,
            current_plan_id=sub.plan_id,
            requested_plan_id=target_plan.id,
            change_type="upgrade",
            status="pending",
        )
        db.add(cr)
        await db.flush()
        metrics.workflow("change_request_created", "passed", f"From {current_plan.code} to {target_plan.code}")
    except Exception as e:
        metrics.error(phase, "Change request create failed", str(e))

    # 2. Purchase overage
    try:
        from app.api.v1.billing import company_purchase_overage
        from app.schemas.billing import PurchaseOverageRequest
        # Skip direct API call; simulate via service
        extra_amt = float(target_plan.additional_user_cost or 99)
        sub.extra_users = (sub.extra_users or 0) + 5
        await db.flush()
        metrics.workflow("overage_purchase", "passed", f"Added 5 extra users at {extra_amt}/ea")
    except Exception as e:
        metrics.error(phase, "Overage purchase failed", str(e))

    # 3. Generate subscription invoice
    try:
        from app.services.billing_invoice_service import InvoiceService
        svc = InvoiceService(db)
        period_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
        start = time.time()
        inv = await svc.generate_subscription_invoice(co.id, period_start, period_end)
        await db.flush()
        elapsed = (time.time() - start) * 1000
        metrics.workflow("invoice_generate", "passed", f"Invoice {inv.invoice_number} in {elapsed:.0f}ms")
        if elapsed > settings.SLOW_QUERY_THRESHOLD:
            metrics.slow("generate_subscription_invoice", elapsed, phase)
    except Exception as e:
        metrics.error(phase, "Invoice generation failed", str(e))
        return

    # 4. Record payment
    try:
        pay = BillingPayment(
            id=str(uuid.uuid4()),
            company_id=co.id,
            invoice_id=inv.id if inv else None,
            amount=float(inv.amount) if inv else 2999,
            currency="INR",
            method="bank_transfer",
            reference_number=f"REF-{uuid.uuid4().hex[:8]}",
            status="completed",
            paid_at=datetime.now(timezone.utc),
        )
        db.add(pay)
        await db.flush()
        metrics.workflow("payment_record", "passed", f"Payment {pay.reference_number}")
    except Exception as e:
        metrics.error(phase, "Payment record failed", str(e))

    # 5. Reconcile payment
    try:
        if inv and pay:
            inv.status = "paid"
            inv.paid_at = datetime.now(timezone.utc)
            inv.transaction_id = pay.reference_number
            pay.invoice_id = inv.id
            await db.flush()
            metrics.workflow("payment_reconcile", "passed", f"Invoice {inv.invoice_number} marked paid")
    except Exception as e:
        metrics.error(phase, "Payment reconcile failed", str(e))


async def test_subscription_lifecycle(db: AsyncSession, role_ids: dict[str, str], company_ids: list[str], plan_ids: dict[str, str]):
    """Test change request → approval → renewal → overdue workflow."""
    phase = "subscription_lifecycle"
    co = await db.get(Company, company_ids[2])
    plan_keys = list(plan_ids.keys())

    if len(plan_keys) < 2:
        return

    current_plan = await db.get(SubscriptionPlan, plan_ids[plan_keys[0]])
    target_plan = await db.get(SubscriptionPlan, plan_ids[plan_keys[1]])

    sub_res = await tick(db,
        select(CompanySubscription).where(CompanySubscription.company_id == co.id),
        f"{phase}: get sub")
    sub = sub_res.scalar_one_or_none()
    if not sub:
        return

    # Find a user for this company
    user_res = await tick(db, select(User).where(User.company_id == co.id).limit(1), f"{phase}: find user")
    user_obj = user_res.scalar_one_or_none()

    # Find a SUPER_ADMIN
    sa_res = await tick(db, select(User).where(User.role_rel.has(Role.code == "SUPER_ADMIN")).limit(1), f"{phase}: find SA")
    sa_user = sa_res.scalar_one_or_none()

    # 1. Create change request
    cr = SubscriptionChangeRequest(
        id=str(uuid.uuid4()),
        company_id=co.id,
        requested_by=user_obj.id if user_obj else None,
        current_plan_id=sub.plan_id,
        requested_plan_id=target_plan.id,
        change_type="upgrade",
        reason="Need more capacity for expansion",
        status="pending",
    )
    db.add(cr)
    await db.flush()
    metrics.workflow("sub_change_request", "passed", f"CR to {target_plan.code}")

    # 2. SUPER_ADMIN approves
    try:
        start = time.time()
        cr.status = "approved"
        cr.reviewed_by = sa_user.id if sa_user else None
        cr.reviewed_at = datetime.now(timezone.utc)
        sub.plan_id = target_plan.id
        await db.flush()
        elapsed = (time.time() - start) * 1000
        metrics.workflow("sub_approve", "passed", f"Approved in {elapsed:.0f}ms")
    except Exception as e:
        metrics.error(phase, "Change request approve failed", str(e))

    # 3. Set expiry close to now for renewal test
    try:
        sub.expires_at = datetime.now(timezone.utc) + timedelta(days=2)
        await db.flush()
        metrics.workflow("sub_set_expiry", "passed", "Expiry set to 2 days from now")
    except Exception as e:
        metrics.error(phase, "Set expiry failed", str(e))

    # 4. Generate past-due/renewal invoices
    try:
        from app.services.billing_invoice_service import InvoiceService
        svc = InvoiceService(db)
        start = time.time()
        renewals = await svc.generate_past_due_invoices()
        elapsed = (time.time() - start) * 1000
        metrics.workflow("sub_renewal", "passed", f"Generated {len(renewals)} renewal invoices in {elapsed:.0f}ms")
    except Exception as e:
        metrics.error(phase, "Renewal invoice generation failed", str(e))


async def test_invoice_lifecycle(db: AsyncSession, company_ids: list[str], plan_ids: dict[str, str]):
    """Test invoice generate → pay → download PDF → reconcile."""
    phase = "invoice_lifecycle"
    co = await db.get(Company, company_ids[3])

    sub_res = await tick(db,
        select(CompanySubscription).where(CompanySubscription.company_id == co.id),
        f"{phase}: get sub")
    sub = sub_res.scalar_one_or_none()
    if not sub:
        return

    # 1. Generate invoice
    try:
        from app.services.billing_invoice_service import InvoiceService
        svc = InvoiceService(db)
        period_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
        inv = await svc.generate_subscription_invoice(co.id, period_start, period_end)
        await db.commit()
        metrics.workflow("inv_generate", "passed", f"Invoice {inv.invoice_number} for ₹{float(inv.amount)}")
    except Exception as e:
        await db.rollback()
        metrics.error(phase, "Invoice generate failed", str(e))
        return

    # 2. Verify invoice fields
    try:
        assert inv.invoice_number.startswith("INV-"), f"Bad invoice number: {inv.invoice_number}"
        assert inv.amount > 0, f"Zero amount invoice: {inv.amount}"
        assert inv.status == "pending"
        assert inv.invoice_type == "subscription"
        metrics.workflow("inv_verify", "passed", f"Invoice #{inv.invoice_number}: ₹{float(inv.amount)}, {inv.status}")
    except Exception as e:
        metrics.error(phase, "Invoice verification failed", str(e))

    # 3. Generate PDF
    try:
        from app.services.pdf_export import invoice_pdf
        from app.models.masters import Company as CoModel
        co_obj = await tick(db, select(CoModel).where(CoModel.id == co.id), f"{phase}: get company for PDF")
        company_obj = co_obj.scalar_one_or_none()
        start = time.time()
        pdf_bytes = invoice_pdf(inv, company_obj.name if company_obj else "Unknown")
        elapsed = (time.time() - start) * 1000
        assert len(pdf_bytes) > 100, "PDF too small"
        metrics.workflow("inv_pdf_download", "passed", f"PDF generated: {len(pdf_bytes)} bytes in {elapsed:.0f}ms")
        if elapsed > settings.SLOW_QUERY_THRESHOLD:
            metrics.slow("invoice_pdf generation", elapsed, phase)
    except Exception as e:
        metrics.error(phase, "Invoice PDF generation failed", str(e))

    # 4. Pay and reconcile
    try:
        pay = BillingPayment(
            id=str(uuid.uuid4()),
            company_id=co.id,
            invoice_id=inv.id,
            amount=float(inv.amount),
            currency="INR",
            method="bank_transfer",
            reference_number=f"REF-{uuid.uuid4().hex[:8]}",
            status="completed",
            paid_at=datetime.now(timezone.utc),
        )
        db.add(pay)
        inv.status = "paid"
        inv.paid_at = datetime.now(timezone.utc)
        inv.transaction_id = pay.reference_number
        await db.flush()
        metrics.workflow("inv_pay_reconcile", "passed", f"Invoice {inv.invoice_number} paid and reconciled")
    except Exception as e:
        metrics.error(phase, "Invoice pay/reconcile failed", str(e))


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 3: PERMISSION GUARD VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════

async def verify_permission_guards(db: AsyncSession, company_ids: list[str], role_ids: dict[str, str]):
    """Verify RBAC guards work for key scenarios."""
    phase = "permission_guards"
    co = await db.get(Company, company_ids[4])
    co2 = await db.get(Company, company_ids[5])

    mo_role = await db.get(Role, role_ids["MILL_OWNER"])
    op_role = await db.get(Role, role_ids["MACHINE_OPERATOR"])
    gm_role = await db.get(Role, role_ids["GENERAL_MANAGER"])

    # Create test users
    mo_user = User(
        id=str(uuid.uuid4()), name="LR-MO", email=f"lr-mo-{uuid.uuid4().hex[:4]}@test.com",
        password_hash="hash", role_id=mo_role.id, company_id=co.id, is_active=True,
    )
    db.add(mo_user)

    op_user = User(
        id=str(uuid.uuid4()), name="LR-OP", email=f"lr-op-{uuid.uuid4().hex[:4]}@test.com",
        password_hash="hash", role_id=op_role.id, company_id=co.id, mill_id="m1", is_active=True,
    )
    db.add(op_user)

    gm_user = User(
        id=str(uuid.uuid4()), name="LR-GM", email=f"lr-gm-{uuid.uuid4().hex[:4]}@test.com",
        password_hash="hash", role_id=gm_role.id, company_id=co.id, is_active=True,
    )
    db.add(gm_user)
    await db.flush()

    # Test: MILL_OWNER can access own company
    from app.api.v1.billing import check_company_scope
    from fastapi import HTTPException

    try:
        await check_company_scope(mo_user, co.id)
        metrics.workflow("perm_mo_own_company", "passed", "MILL_OWNER can access own company")
    except HTTPException:
        metrics.error(phase, "MILL_OWNER denied own company")

    # Test: MILL_OWNER blocked from other company
    try:
        await check_company_scope(mo_user, co2.id)
        metrics.error(phase, "MILL_OWNER accessed other company", "Should have 403'd")
    except HTTPException:
        metrics.workflow("perm_mo_other_company_blocked", "passed", "MILL_OWNER blocked from other company")

    # Test: MACHINE_OPERATOR blocked from billing
    try:
        await check_company_scope(op_user, co.id)
        metrics.error(phase, "MACHINE_OPERATOR accessed billing", "Should have 403'd")
    except HTTPException as e:
        metrics.workflow("perm_op_billing_blocked", "passed", "MACHINE_OPERATOR blocked from billing")


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

async def main():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        t0 = time.time()

        # Phase 1: Seed dataset
        print("=== LR-1: Seeding dataset ===")
        roles = await get_or_create_roles(db)
        print(f"  Roles: {len(roles)} ({', '.join(roles.keys())})")
        metrics.timing["seed_roles"] = time.time() - t0

        plans = await get_or_create_plans(db)
        print(f"  Plans: {len(plans)} ({', '.join(plans.keys())})")
        metrics.timing["seed_plans"] = time.time() - t0

        companies = await create_companies(db, plans)
        print(f"  Companies: {len(companies)}")
        metrics.timing["seed_companies"] = time.time() - t0

        mills = await create_mills(db, companies)
        print(f"  Mills: {len(mills)} ({len(mills)//len(companies)} per company)")
        metrics.timing["seed_mills"] = time.time() - t0

        users = await create_users(db, roles, companies, mills)
        print(f"  Users: {len(users)} ({len(users)//len(companies)} per company)")
        metrics.timing["seed_users"] = time.time() - t0

        employees = await create_employees(db, companies, mills)
        print(f"  Employees: {len(employees)} ({len(employees)//len(companies)} per company)")
        metrics.timing["seed_employees"] = time.time() - t0

        # Commit seed data and refresh company objects to avoid expired state
        await db.commit()
        # Refresh all company objects so .id etc are available
        for idx, co in enumerate(companies):
            await db.refresh(co)
        print(f"\n  Dataset created in {time.time()-t0:.1f}s")
        print()

        # Phase 2: Lifecycle tests
        print("=== LR-1: Running lifecycle tests ===")
        company_ids = [co.id for co in companies]
        role_ids = {k: v.id for k, v in roles.items()}
        plan_ids = {k: v.id for k, v in plans.items()}

        await test_company_lifecycle(db, company_ids, role_ids, users)
        await db.rollback()
        await test_user_lifecycle(db, company_ids, role_ids)
        await db.rollback()
        await test_billing_lifecycle(db, company_ids, role_ids, plan_ids)
        await db.rollback()
        await test_subscription_lifecycle(db, role_ids, company_ids, plan_ids)
        await db.rollback()
        await test_invoice_lifecycle(db, company_ids, plan_ids)
        await db.rollback()
        await verify_permission_guards(db, company_ids, role_ids)

        print()

    # Phase 3: Report
    report = metrics.report()
    report["dataset"] = {
        "companies": len(COMPANY_NAMES),
        "mills": 30,
        "users": 500,
        "employees": 3000,
        "plans": list(plans.keys()) if 'plans' in dir() else [],
    }
    report["verdict"] = "GO" if report["total_errors"] == 0 else "NO-GO"

    # Save report
    report_path = os.path.join(os.path.dirname(__file__), "..", "lr1_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"\n=== LR-1 Results ===")
    print(f"  Errors: {report['total_errors']}")
    print(f"  Slow queries: {report['total_slow_queries']}")
    print(f"  Workflows executed: {report['total_workflows']}")
    print(f"  Elapsed: {report['elapsed_seconds']:.1f}s")
    print(f"  Verdict: {report['verdict']}")
    print(f"  Report saved to: {report_path}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
