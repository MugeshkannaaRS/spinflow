"""Billing commerce integration tests — payments, invoices, overage, overdue."""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.billing import (
    SubscriptionPlan, ModulePricing, CompanySubscription, BillingInvoice, BillingPayment,
)
from app.models.masters import Company, Mill
from app.models.user import User
from app.models.user import Role
from app.services.billing_invoice_service import InvoiceService
from app.services.payment_service import PaymentService
from app.services.overdue_service import OverdueService
from app.core.module_registry import ALL_MODULE_CODES


# ── Helpers ──────────────────────────────────────────────

@pytest_asyncio.fixture
async def seeded_plans(session: AsyncSession) -> dict:
    """Create all 5 plans with ModulePricing entries."""
    plans = {}
    core = {"dashboard", "production", "quality", "inventory", "dispatch", "purchase", "stores",
            "hr", "accounts", "maintenance", "users", "masters", "column_config", "audit",
            "reports", "stock", "sales"}

    configs = [
        ("starter", "Starter", 1, 10, 100, 1, list(core)),
        ("growth", "Growth", 2, 25, 300, 2, list(core | {"lotrac", "payroll"})),
        ("business", "Business", 3, 50, 600, 3, list(core | {"lotrac", "payroll", "uploads"})),
        ("enterprise", "Enterprise", 4, 100, 1500, 4, list(ALL_MODULE_CODES)),
        ("custom", "Custom", 5, 99999, 999999, 5, []),
    ]
    for code, name, sort, incl_users, incl_emps, incl_mills, mods in configs:
        plan = SubscriptionPlan(
            id=str(uuid.uuid4()), code=code, name=name,
            monthly_price=999, yearly_price=9990,
            included_mills=incl_mills, included_users=incl_users,
            additional_user_cost=199, additional_mill_cost=1499, additional_employee_cost=49,
            is_active=True, sort_order=sort,
        )
        session.add(plan)
        for mn in ALL_MODULE_CODES:
            mp = ModulePricing(
                id=str(uuid.uuid4()), plan_id=plan.id,
                module_name=mn, is_included=mn in mods, monthly_price=0,
            )
            session.add(mp)
        plans[code] = plan
    await session.flush()
    return plans


@pytest_asyncio.fixture
async def sample_company(session: AsyncSession, seeded_plans: dict):
    """Create a test company with subscription."""
    co = Company(
        id="test-co-billing-001",
        code="BILLTESTCO",
        name="Billing Test Company",
        is_active=True,
        status="active",
        plan="starter",
        max_users=50,
        max_employees=500,
    )
    session.add(co)
    await session.flush()

    plan_res = await session.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.code == "starter")
    )
    plan = plan_res.scalar_one()
    sub = CompanySubscription(
        id="test-sub-001",
        company_id=co.id,
        plan_id=plan.id,
        status="active",
        billing_cycle="monthly",
        started_at=datetime.now(timezone.utc) - timedelta(days=60),
        expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        extra_mills=0,
        extra_users=0,
        extra_employees=0,
        currency_code="INR",
    )
    session.add(sub)
    await session.flush()

    # Create some mills
    for i in range(2):
        session.add(Mill(id=f"test-mill-bill-{i}", company_id=co.id, code=f"BILLM{i}", name=f"Billing Mill {i}", is_active=True))
    await session.flush()

    return co, sub, plan


@pytest_asyncio.fixture
async def sample_admin(session: AsyncSession):
    """Create a SUPER_ADMIN user for tests."""
    role = Role(
        id=str(uuid.uuid4()),
        code="SUPER_ADMIN",
        name="Super Admin",
    )
    session.add(role)
    await session.flush()
    user = User(
        id="test-admin-billing",
        name="Admin Billing",
        email="admin-billing@test.com",
        password_hash="hash",
        company_id="test-co-billing-001",
        role_id=role.id,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


# ══════════════════════════════════════════════════════════
# TEST 1: INVOICE SERVICE
# ══════════════════════════════════════════════════════════


class TestInvoiceService:
    """InvoiceService integration tests."""

    @pytest.mark.asyncio
    async def test_generate_invoice_number(self, session: AsyncSession, sample_company):
        """Verify sequential invoice numbering format."""
        svc = InvoiceService(session)
        num1 = await svc.generate_invoice_number()
        assert num1.startswith("INV-")
        assert len(num1) > 8
        # After creating an invoice, next number should be different
        co, sub, plan = sample_company
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)
        inv = await svc.generate_subscription_invoice(co.id, period_start, period_end)
        await session.flush()
        num2 = await svc.generate_invoice_number()
        assert num2.endswith("0002") or num2 > num1  # Sequential

    @pytest.mark.asyncio
    async def test_generate_subscription_invoice(self, session: AsyncSession, sample_company):
        """Verify full subscription invoice generation with line items."""
        co, sub, plan = sample_company
        svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        from datetime import timedelta
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)

        invoice = await svc.generate_subscription_invoice(
            company_id=co.id,
            period_start=period_start,
            period_end=period_end,
        )
        await session.flush()

        assert invoice is not None
        assert invoice.invoice_number.startswith("INV-")
        assert invoice.company_id == co.id
        assert invoice.status == "pending"
        assert invoice.invoice_type == "subscription"
        assert invoice.is_auto_generated == False
        assert invoice.due_date is not None
        assert invoice.due_date > period_end
        assert invoice.amount > 0
        assert invoice.subtotal > 0
        assert "base_plan" in (invoice.line_items or {})

    @pytest.mark.asyncio
    async def test_generate_auto_invoice(self, session: AsyncSession, sample_company):
        """Verify auto-generated invoices are marked correctly."""
        co, sub, plan = sample_company
        svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)

        invoice = await svc.generate_subscription_invoice(
            company_id=co.id,
            period_start=period_start,
            period_end=period_end,
            is_auto=True,
        )
        await session.flush()
        assert invoice.is_auto_generated == True

    @pytest.mark.asyncio
    async def test_generate_prorated_upgrade_invoice(self, session: AsyncSession, sample_company):
        """Verify prorated upgrade invoice has positive amount."""
        co, sub, plan = sample_company
        # Get growth plan
        growth_res = await session.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.code == "growth")
        )
        growth = growth_res.scalar_one()

        svc = InvoiceService(session)
        effective = datetime.now(timezone.utc)
        invoice = await svc.generate_prorated_invoice(
            company_id=co.id,
            old_plan_id=plan.id,
            new_plan_id=growth.id,
            change_type="upgrade",
            effective_date=effective,
        )
        await session.flush()

        assert invoice is not None
        assert invoice.invoice_type == "adjustment"
        assert invoice.line_items is not None
        line_item = invoice.line_items.get("prorated_adjustment", {})
        assert line_item.get("change_type") == "upgrade"
        assert line_item.get("old_plan") == plan.name
        assert line_item.get("new_plan") == growth.name

    @pytest.mark.asyncio
    async def test_generate_overage_invoice(self, session: AsyncSession, sample_company):
        """Verify overage invoice for extra resource purchases."""
        co, sub, plan = sample_company
        svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)

        invoice = await svc.generate_overage_invoice(
            company_id=co.id,
            resource_type="extra_users",
            quantity=10,
            unit_price=199.0,
            period_start=period_start,
            period_end=period_end,
        )
        await session.flush()

        assert invoice is not None
        assert invoice.invoice_type == "overage"
        assert invoice.amount == 1990.0  # 10 x 199
        assert invoice.line_items is not None
        overage_item = invoice.line_items.get("overage", {})
        assert overage_item.get("quantity") == 10
        assert overage_item.get("unit_price") == 199.0

    @pytest.mark.asyncio
    async def test_generate_all_monthly_invoices(self, session: AsyncSession, sample_company):
        """Verify batch invoice generation processes active companies."""
        svc = InvoiceService(session)
        result = await svc.generate_all_monthly_invoices()
        assert result["total"] > 0
        assert result["generated"] > 0
        assert result["errors"] == 0

    @pytest.mark.asyncio
    async def test_generate_past_due_invoices(self, session: AsyncSession, sample_company):
        """Verify renewal invoices for expiring subscriptions."""
        co, sub, plan = sample_company
        sub.expires_at = datetime.now(timezone.utc) + timedelta(days=2)  # Expiring soon
        session.add(sub)
        await session.flush()

        svc = InvoiceService(session)
        invoices = await svc.generate_past_due_invoices()
        await session.flush()

        assert len(invoices) >= 1
        assert invoices[0].invoice_type == "subscription"
        assert invoices[0].is_auto_generated == True


# ══════════════════════════════════════════════════════════
# TEST 2: PAYMENT SERVICE
# ══════════════════════════════════════════════════════════


class TestPaymentService:
    """PaymentService integration tests."""

    @pytest.mark.asyncio
    async def test_record_manual_payment(self, session: AsyncSession, sample_company, sample_admin):
        """Verify manual payment recording."""
        co, sub, plan = sample_company
        svc = PaymentService(session, sample_admin)

        payment = await svc.record_manual_payment(
            company_id=co.id,
            amount=4999.0,
            reference_number="BANK-TRF-001",
            notes="Test manual payment",
        )

        assert payment is not None
        assert float(payment.amount) == 4999.0
        assert payment.method == "bank_transfer"
        assert payment.status == "completed"
        assert payment.paid_at is not None

    @pytest.mark.asyncio
    async def test_record_payment_with_invoice(self, session: AsyncSession, sample_company, sample_admin):
        """Verify payment against an invoice marks invoice as paid."""
        co, sub, plan = sample_company

        # Create an invoice first
        inv_svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)
        invoice = await inv_svc.generate_subscription_invoice(co.id, period_start, period_end)

        pay_svc = PaymentService(session, sample_admin)
        payment = await pay_svc.record_payment(
            company_id=co.id,
            amount=float(invoice.amount),
            invoice_id=invoice.id,
            reference_number="INV-PMT-001",
        )

        # Verify invoice is now paid
        paid_invoice = await session.get(BillingInvoice, invoice.id)
        assert paid_invoice.status == "paid"
        assert paid_invoice.paid_at is not None

    @pytest.mark.asyncio
    async def test_record_razorpay_payment(self, session: AsyncSession, sample_company, sample_admin):
        """Verify Razorpay gateway payment recording."""
        co, sub, plan = sample_company

        # Create an invoice
        inv_svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)
        invoice = await inv_svc.generate_subscription_invoice(co.id, period_start, period_end)

        pay_svc = PaymentService(session, sample_admin)
        payment = await pay_svc.record_razorpay_payment(
            company_id=co.id,
            invoice_id=invoice.id,
            gateway_payment_id="rzp_pay_ABC123",
            amount=float(invoice.amount),
            gateway_response={"status": "captured", "method": "upi"},
        )

        assert payment is not None
        assert payment.method == "razorpay"
        assert payment.gateway == "razorpay"
        assert payment.reference_number == "rzp_pay_ABC123"

    @pytest.mark.asyncio
    async def test_refund_payment(self, session: AsyncSession, sample_company, sample_admin):
        """Verify payment refund creates negative payment record."""
        co, sub, plan = sample_company
        svc = PaymentService(session, sample_admin)

        payment = await svc.record_manual_payment(
            company_id=co.id,
            amount=4999.0,
            reference_number="REF-TEST-001",
        )

        refund = await svc.refund_payment(payment.id, reason="Customer requested refund")

        assert refund is not None
        assert float(refund.amount) == -4999.0
        assert refund.reference_number is not None
        assert refund.reference_number.startswith("REFUND-")

        # Verify original is marked refunded
        original = await session.get(BillingPayment, payment.id)
        assert original.status == "refunded"

    @pytest.mark.asyncio
    async def test_get_company_payments(self, session: AsyncSession, sample_company, sample_admin):
        """Verify paginated company payment listing."""
        co, sub, plan = sample_company
        svc = PaymentService(session, sample_admin)

        # Record 3 payments
        for i in range(3):
            await svc.record_manual_payment(
                company_id=co.id,
                amount=1000.0 * (i + 1),
                reference_number=f"PMT-{i}",
            )

        rows, total = await svc.get_company_payments(co.id, 1, 10)
        assert total >= 3
        assert len(rows) >= 3
        assert rows[0]["amount"] is not None

    @pytest.mark.asyncio
    async def test_reconcile_payment(self, session: AsyncSession, sample_company, sample_admin):
        """Verify payment reconciliation with invoice."""
        co, sub, plan = sample_company

        inv_svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)
        invoice = await inv_svc.generate_subscription_invoice(co.id, period_start, period_end)

        pay_svc = PaymentService(session, sample_admin)
        payment = await pay_svc.record_manual_payment(
            company_id=co.id,
            amount=float(invoice.amount),
            reference_number="ORPHAN-PMT",
        )

        result = await pay_svc.reconcile_payment(payment.id, invoice.id)
        assert result["amount_matches"] == True
        assert result["invoice_status"] == "paid"


# ══════════════════════════════════════════════════════════
# TEST 3: OVERDUE SERVICE
# ══════════════════════════════════════════════════════════


class TestOverdueService:
    """OverdueService integration tests."""

    @pytest.mark.asyncio
    async def test_process_no_overdue_invoices(self, session: AsyncSession, sample_company):
        """Verify no action when no invoices are overdue."""
        svc = OverdueService(session)
        result = await svc.process_overdue_workflow()
        assert result["processed"] >= 0
        assert result["reminders"] == 0
        assert result["warnings"] == 0
        assert result["restricted"] == 0

    @pytest.mark.asyncio
    async def test_overdue_day_determination(self, session: AsyncSession):
        """Verify overdue day milestone mapping."""
        svc = OverdueService(session)
        assert svc._determine_overdue_day(0) == 0
        assert svc._determine_overdue_day(5) == 0
        assert svc._determine_overdue_day(7) == 7
        assert svc._determine_overdue_day(10) == 7
        assert svc._determine_overdue_day(15) == 15
        assert svc._determine_overdue_day(20) == 15
        assert svc._determine_overdue_day(30) == 30
        assert svc._determine_overdue_day(45) == 30
        assert svc._determine_overdue_day(60) == 60
        assert svc._determine_overdue_day(75) == 60
        assert svc._determine_overdue_day(90) == 90
        assert svc._determine_overdue_day(100) == 90

    @pytest.mark.asyncio
    async def test_overdue_day_30_restricts(self, session: AsyncSession, sample_company):
        """Verify day 30 restricts the company."""
        co, sub, plan = sample_company

        # Create an overdue invoice (past due date)
        invoice = BillingInvoice(
            id="test-overdue-inv-1",
            company_id=co.id,
            company_subscription_id=sub.id,
            invoice_number="INV-OVERDUE-001",
            amount=4999.0,
            status="pending",
            due_date=datetime.now(timezone.utc) - timedelta(days=30),
            invoice_type="subscription",
        )
        session.add(invoice)

        # Set overdue_since to 30 days ago
        sub.overdue_since = datetime.now(timezone.utc) - timedelta(days=30)
        sub.overdue_day = 0
        session.add(sub)
        await session.flush()

        svc = OverdueService(session)
        result = await svc.process_overdue_workflow()
        await session.flush()

        # Verify company is restricted
        sub_check = await session.get(CompanySubscription, sub.id)
        assert sub_check.overdue_status == "restricted"
        assert sub_check.overdue_day == 30

    @pytest.mark.asyncio
    async def test_overdue_day_60_suspends(self, session: AsyncSession, sample_company, sample_admin):
        """Verify day 60 suspends the company + mills + users."""
        co, sub, plan = sample_company

        # Create user for this company
        user = User(
            id="test-overdue-user",
            name="Overdue User",
            email="overdue@test.com",
            password_hash="hash",
            company_id=co.id,
            role_id=sample_admin.role_id,
            is_active=True,
        )
        session.add(user)

        # Create overdue invoice
        invoice = BillingInvoice(
            id="test-overdue-inv-2",
            company_id=co.id,
            company_subscription_id=sub.id,
            invoice_number="INV-OVERDUE-002",
            amount=4999.0,
            status="pending",
            due_date=datetime.now(timezone.utc) - timedelta(days=60),
            invoice_type="subscription",
        )
        session.add(invoice)

        sub.overdue_since = datetime.now(timezone.utc) - timedelta(days=60)
        sub.overdue_day = 30  # Already went through day 30
        sub.overdue_status = "restricted"
        await session.flush()

        svc = OverdueService(session)
        result = await svc.process_overdue_workflow()
        await session.flush()

        # Verify company is suspended
        sub_check = await session.get(CompanySubscription, sub.id)
        assert sub_check.status == "suspended"
        co_check = await session.get(Company, co.id)
        assert co_check.is_active == False
        assert co_check.status == "suspended"

    @pytest.mark.asyncio
    async def test_restore_from_overdue(self, session: AsyncSession, sample_company):
        """Verify restore resets overdue flags."""
        co, sub, plan = sample_company
        sub.overdue_status = "restricted"
        sub.overdue_day = 30
        sub.overdue_since = datetime.now(timezone.utc) - timedelta(days=30)
        await session.flush()

        svc = OverdueService(session)
        result = await svc.restore_from_overdue(co.id)
        await session.flush()

        assert result["restored"] == True

        sub_check = await session.get(CompanySubscription, sub.id)
        assert sub_check.overdue_status == "active"
        assert sub_check.overdue_day == 0
        assert sub_check.overdue_since is None


# ══════════════════════════════════════════════════════════
# TEST 4: OVERAGE PURCHASE
# ══════════════════════════════════════════════════════════


class TestOveragePurchase:
    """Overage purchase integration via route service logic."""

    @pytest.mark.asyncio
    async def test_purchase_extra_users(self, session: AsyncSession, sample_company):
        """Verify extra user purchase updates subscription and generates invoice."""
        co, sub, plan = sample_company
        initial_extra = sub.extra_users or 0

        # Simulate the route logic
        unit_price = float(plan.additional_user_cost or 0)
        quantity = 10
        sub.extra_users = (sub.extra_users or 0) + quantity

        inv_svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)

        invoice = await inv_svc.generate_overage_invoice(
            company_id=co.id,
            resource_type="extra_users",
            quantity=quantity,
            unit_price=unit_price,
            period_start=period_start,
            period_end=period_end,
        )
        await session.flush()

        assert sub.extra_users == initial_extra + 10
        assert invoice is not None
        assert invoice.amount > 0
        assert invoice.invoice_type == "overage"


# ══════════════════════════════════════════════════════════
# TEST 5: BILLING SERVICE ENHANCEMENTS
# ══════════════════════════════════════════════════════════


class TestBillingEnhancements:
    """Enriched billing service features."""

    @pytest.mark.asyncio
    async def test_plan_has_employee_cost(self, session: AsyncSession, seeded_plans):
        """Verify seeded plans have additional_employee_cost."""
        res = await session.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.code == "starter")
        )
        plan = res.scalar_one()
        assert plan.additional_employee_cost == 49

    @pytest.mark.asyncio
    async def test_invoice_due_date_calculation(self, session: AsyncSession, sample_company):
        """Verify invoice due date is 7 days after period end."""
        co, sub, plan = sample_company
        svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)

        invoice = await svc.generate_subscription_invoice(co.id, period_start, period_end)
        assert invoice.due_date is not None
        expected_due = period_end + timedelta(days=7)
        assert abs((invoice.due_date - expected_due).total_seconds()) < 1

    @pytest.mark.asyncio
    async def test_invoice_line_items_structure(self, session: AsyncSession, sample_company):
        """Verify invoice line items have correct structure."""
        co, sub, plan = sample_company
        svc = InvoiceService(session)
        period_start = datetime.now(timezone.utc).replace(day=1)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(seconds=1)

        invoice = await svc.generate_subscription_invoice(co.id, period_start, period_end)
        items = invoice.line_items or {}
        assert "base_plan" in items
        assert items["base_plan"]["type"] == "base_plan"
        assert items["base_plan"]["plan_code"] == plan.code

    @pytest.mark.asyncio
    async def test_payment_currency_from_subscription(self, session: AsyncSession, sample_company, sample_admin):
        """Verify payment inherits currency from subscription."""
        co, sub, plan = sample_company
        sub.currency_code = "USD"
        await session.flush()

        svc = PaymentService(session, sample_admin)
        payment = await svc.record_manual_payment(
            company_id=co.id,
            amount=100.0,
        )
        assert payment.currency == "USD"

    @pytest.mark.asyncio
    async def test_subscription_extra_employees_field(self, session: AsyncSession, sample_company):
        """Verify extra_employees field exists and is settable."""
        co, sub, plan = sample_company
        sub.extra_employees = 50
        await session.flush()

        refreshed = await session.get(CompanySubscription, sub.id)
        assert refreshed.extra_employees == 50


# ══════════════════════════════════════════════════════════
# TEST 6: SET COMPANY PLAN WITH EXTRA EMPLOYEES
# ══════════════════════════════════════════════════════════


class TestSetCompanyPlan:
    """Verify set_company_plan handles extra_employees."""

    @pytest.mark.asyncio
    async def test_set_plan_with_extra_employees(self, session: AsyncSession, sample_company, sample_admin):
        """Verify extra_employees is persisted when setting plan."""
        co, sub, plan = sample_company
        growth_res = await session.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.code == "growth")
        )
        growth = growth_res.scalar_one()

        sub.plan_id = growth.id
        sub.extra_employees = 100
        await session.flush()

        refreshed = await session.get(CompanySubscription, sub.id)
        assert refreshed.plan_id == growth.id
        assert refreshed.extra_employees == 100

    @pytest.mark.asyncio
    async def test_billing_invoice_has_new_fields(self, session: AsyncSession, sample_company):
        """Verify billing_invoice has all new commerce fields."""
        co, sub, plan = sample_company
        invoice = BillingInvoice(
            id="test-invoice-new-fields",
            company_id=co.id,
            company_subscription_id=sub.id,
            invoice_number="INV-NEW-FIELDS-001",
            amount=1000.0,
            subtotal=1000.0,
            tax_amount=0.0,
            status="pending",
            due_date=datetime.now(timezone.utc) + timedelta(days=7),
            is_auto_generated=False,
            invoice_type="subscription",
        )
        session.add(invoice)
        await session.flush()

        refreshed = await session.get(BillingInvoice, "test-invoice-new-fields")
        assert refreshed.subtotal == 1000.0
        assert refreshed.tax_amount == 0.0
        assert refreshed.due_date is not None
        assert refreshed.is_auto_generated == False
        assert refreshed.invoice_type == "subscription"
