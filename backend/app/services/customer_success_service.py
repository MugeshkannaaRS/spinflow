"""Customer Success Service — Wave 5.3

Modules:
  Onboarding progress (auto-detected from actual data)
  System recommendations (diagnostic engine)
  Help article seed (default articles)
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.customer_success import SetupProgress, HelpCategory, HelpArticle
from app.models.user import User
from app.models.masters import Mill, Department
from app.models.hr import Employee
from app.models.production import Machine, Shift
from app.models.quality import QualityTest

logger = logging.getLogger(__name__)

SETUP_STEPS = [
    "company_info",
    "mill_setup",
    "departments",
    "employees",
    "machines",
    "shifts",
    "roles",
    "billing",
    "go_live",
]


class OnboardingProgressService:
    """Auto-detect onboarding progress from actual data."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def compute_progress(self, company_id: str) -> dict:
        """Scan company data and return step completion status + overall %."""
        steps = {}

        # company_info — company exists (implicitly true)
        steps["company_info"] = True

        # mill_setup — at least one mill
        mills = (await self.db.execute(
            select(func.count(Mill.id)).where(Mill.company_id == company_id)
        )).scalar() or 0
        steps["mill_setup"] = mills > 0

        # departments — at least 1 department (Department has mill_id, not company_id)
        depts = (await self.db.execute(
            select(func.count(Department.id))
            .join(Mill, Mill.id == Department.mill_id)
            .where(Mill.company_id == company_id)
        )).scalar() or 0
        steps["departments"] = depts > 0

        # employees — at least 1 employee
        emps = (await self.db.execute(
            select(func.count(Employee.id))
            .join(Mill, Mill.id == Employee.mill_id)
            .where(Mill.company_id == company_id, Employee.is_active == True)
        )).scalar() or 0
        steps["employees"] = emps > 0

        # machines — at least 1 machine
        machs = (await self.db.execute(
            select(func.count(Machine.id))
            .join(Mill, Mill.id == Machine.mill_id)
            .where(Mill.company_id == company_id)
        )).scalar() or 0
        steps["machines"] = machs > 0

        # shifts — at least 1 shift (Shift has mill_id, not company_id)
        shifts = (await self.db.execute(
            select(func.count(Shift.id))
            .join(Mill, Mill.id == Shift.mill_id)
            .where(Mill.company_id == company_id)
        )).scalar() or 0
        steps["shifts"] = shifts > 0

        # roles — more than just MILL_OWNER
        users = (await self.db.execute(
            select(func.count(User.id)).where(
                User.company_id == company_id, User.is_active == True,
            )
        )).scalar() or 0
        steps["roles"] = users > 1

        # billing — subscription active
        from app.models.billing import CompanySubscription
        sub = (await self.db.execute(
            select(func.count(CompanySubscription.id)).where(
                CompanySubscription.company_id == company_id,
                CompanySubscription.status == "active",
            )
        )).scalar() or 0
        steps["billing"] = sub > 0

        # go_live — all previous steps complete
        steps["go_live"] = all(v for k, v in steps.items() if k != "go_live")

        completed = sum(1 for v in steps.values() if v)
        total = len(steps)
        pct = round(completed / total * 100)

        return {
            "steps": steps,
            "completed": completed,
            "total": total,
            "percent": pct,
        }

    async def get_or_create_progress(self, company_id: str) -> dict:
        """Return persisted progress, computing if not yet stored."""
        row = (await self.db.execute(
            select(SetupProgress).where(SetupProgress.company_id == company_id)
        )).scalar_one_or_none()
        if row:
            return row.step_data
        data = await self.compute_progress(company_id)
        sp = SetupProgress(company_id=company_id, step_data=data)
        self.db.add(sp)
        await self.db.flush()
        return data

    async def refresh_progress(self, company_id: str) -> dict:
        """Recompute and update persisted progress."""
        data = await self.compute_progress(company_id)
        row = (await self.db.execute(
            select(SetupProgress).where(SetupProgress.company_id == company_id)
        )).scalar_one_or_none()
        if row:
            row.step_data = data
        else:
            sp = SetupProgress(company_id=company_id, step_data=data)
            self.db.add(sp)
        await self.db.flush()
        return data


class RecommendationService:
    """Scan company data for actionable recommendations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_recommendations(self, company_id: str, mill_id: Optional[str] = None) -> list:
        recs = []

        # 1. Incomplete machines (no type or specs)
        mach_q = select(Machine).join(Mill, Mill.id == Machine.mill_id).where(
            Mill.company_id == company_id
        )
        if mill_id:
            mach_q = mach_q.where(Machine.mill_id == mill_id)
        machines = (await self.db.execute(mach_q)).scalars().all()
        incomplete = [m for m in machines if not m.machine_type]
        if incomplete:
            recs.append({
                "type": "incomplete_records",
                "severity": "warning",
                "title": f"{len(incomplete)} machine(s) missing type/specifications",
                "description": "Update machine details to enable production tracking and maintenance scheduling.",
                "action_label": "View Machines",
                "action_link": "/masters/machines",
            })

        # 2. Inactive users (>30 days no login)
        cutoff = datetime.utcnow() - timedelta(days=30)
        inactive = (await self.db.execute(
            select(func.count(User.id)).where(
                User.company_id == company_id,
                User.is_active == True,
                or_(User.last_login.is_(None), User.last_login < cutoff),
            )
        )).scalar() or 0
        if inactive > 0:
            recs.append({
                "type": "inactive_users",
                "severity": "info",
                "title": f"{inactive} user(s) haven't logged in for 30+ days",
                "description": "Reach out to team members who haven't logged in recently to ensure adoption.",
                "action_label": "View Users",
                "action_link": "/users",
            })

        # 3. No shifts configured (Shift has mill_id, not company_id)
        shifts = (await self.db.execute(
            select(func.count(Shift.id))
            .join(Mill, Mill.id == Shift.mill_id)
            .where(Mill.company_id == company_id)
        )).scalar() or 0
        if shifts == 0 and len(machines) > 0:
            recs.append({
                "type": "missing_setup",
                "severity": "warning",
                "title": "No shifts configured",
                "description": "Create shifts to track production hours and attendance.",
                "action_label": "Create Shifts",
                "action_link": "/masters",
            })

        # 4. Pending quality tests (status is lowercase "pending" in model)
        pending_qc = (await self.db.execute(
            select(func.count(QualityTest.id)).where(
                QualityTest.company_id == company_id,
                QualityTest.status == "pending",
            )
        )).scalar() or 0
        if pending_qc > 0:
            recs.append({
                "type": "pending_quality",
                "severity": "info",
                "title": f"{pending_qc} quality test(s) pending",
                "description": "Complete pending quality tests to release lots for dispatch.",
                "action_label": "View Quality",
                "action_link": "/quality",
            })

        # 5. No employees imported
        emps = (await self.db.execute(
            select(func.count(Employee.id))
            .join(Mill, Mill.id == Employee.mill_id)
            .where(Mill.company_id == company_id, Employee.is_active == True)
        )).scalar() or 0
        if emps == 0:
            recs.append({
                "type": "missing_setup",
                "severity": "warning",
                "title": "No employees imported",
                "description": "Import employees to enable HR, attendance, and payroll features.",
                "action_label": "Import Employees",
                "action_link": "/import-hub",
            })

        return recs


# ── Default help articles ─────────────────────────────────────────────

DEFAULT_CATEGORIES = [
    {"name": "Getting Started", "slug": "getting-started", "icon": "rocket", "sort_order": 1},
    {"name": "Production", "slug": "production", "icon": "factory", "sort_order": 2},
    {"name": "Quality", "slug": "quality", "icon": "check-circle", "sort_order": 3},
    {"name": "Inventory", "slug": "inventory", "icon": "package", "sort_order": 4},
    {"name": "HR & Payroll", "slug": "hr-payroll", "icon": "users", "sort_order": 5},
    {"name": "Billing", "slug": "billing", "icon": "credit-card", "sort_order": 6},
    {"name": "Settings", "slug": "settings", "icon": "settings", "sort_order": 7},
]

DEFAULT_ARTICLES = [
    {
        "category_slug": "getting-started",
        "title": "Welcome to SpinFlow",
        "slug": "welcome-to-spinflow",
        "summary": "Overview of the platform and how to get started.",
        "content": "## Welcome to SpinFlow\n\nSpinFlow is a complete ERP platform for spinning mills. This guide will help you get started.\n\n### Key Modules\n- **Production** — Track production entries, efficiency, and waste\n- **Quality** — Manage quality tests and lot approvals\n- **Inventory** — Monitor stock levels and transfers\n- **HR & Payroll** — Manage employees, attendance, and payroll\n\n### Need Help?\nUse the context-aware help widget on any page, or browse the help center.",
        "tags": ["welcome", "overview", "getting started"],
        "context_page": "dashboard",
        "is_system": True,
    },
    {
        "category_slug": "getting-started",
        "title": "Setting Up Your Mill",
        "slug": "setting-up-your-mill",
        "summary": "Step-by-step guide to configure your mill in SpinFlow.",
        "content": "## Setting Up Your Mill\n\nFollow these steps to get your mill operational:\n\n1. **Create Departments** — Set up departments (blowroom, carding, drawing, etc.)\n2. **Import Employees** — Add your workforce\n3. **Create Machines** — Register all machines with types and specifications\n4. **Configure Shifts** — Define production shifts\n5. **Set Up Roles** — Assign roles to users\n\nThe onboarding wizard (Setup tab) shows your progress.",
        "tags": ["setup", "configuration", "mill"],
        "context_page": "masters",
        "is_system": True,
    },
    {
        "category_slug": "production",
        "title": "Recording Production Entries",
        "slug": "recording-production-entries",
        "summary": "How to record daily production for each machine.",
        "content": "## Recording Production Entries\n\n### Steps\n1. Navigate to the Production page\n2. Select the machine and shift\n3. Enter produced quantity (kg) and waste (kg)\n4. Add optional notes\n5. Submit\n\nProduction data feeds into efficiency calculations, waste tracking, and the executive dashboard.",
        "tags": ["production", "entry", "machine", "shift"],
        "context_page": "production",
        "is_system": True,
    },
    {
        "category_slug": "quality",
        "title": "Quality Testing Workflow",
        "slug": "quality-testing-workflow",
        "summary": "How to create and manage quality tests for production lots.",
        "content": "## Quality Testing Workflow\n\n### Creating a Test\n1. Go to Quality page\n2. Select a lot\n3. Choose test parameters (strength, uniformity, trash, etc.)\n4. Record results\n5. Submit — the lot is marked as Pass or Reject\n\nRejected lots trigger alerts to QUALITY_MANAGER and PRODUCTION_MANAGER.",
        "tags": ["quality", "test", "lot", "rejection"],
        "context_page": "quality",
        "is_system": True,
    },
    {
        "category_slug": "inventory",
        "title": "Managing Inventory",
        "slug": "managing-inventory",
        "summary": "How to manage stock items, transfers, and minimum stock levels.",
        "content": "## Managing Inventory\n\n### Stock Items\n- Add items with name, unit, and minimum stock level\n- Track current stock automatically through production and purchases\n\n### Stock Transfers\n- Move stock between warehouses\n- Each transfer has a unique number scoped to your mill\n\n### Low Stock Alerts\nWhen stock falls below minimum, SpinFlow fires alerts and shows them in the dashboard.",
        "tags": ["inventory", "stock", "transfer", "warehouse"],
        "context_page": "inventory",
        "is_system": True,
    },
    {
        "category_slug": "hr-payroll",
        "title": "Employee Management & Payroll",
        "slug": "employee-management-payroll",
        "summary": "How to manage employees, attendance, and run payroll.",
        "content": "## Employee Management & Payroll\n\n### Employees\n- Import employees via the Import Hub\n- Track personal details, departments, and roles\n\n### Attendance\n- Record daily attendance per employee\n- View attendance reports and absenteeism rates\n\n### Payroll\n- Configure salary components\n- Run monthly payroll\n- Generate payslips and reports",
        "tags": ["hr", "payroll", "employee", "attendance", "salary"],
        "context_page": "hr",
        "is_system": True,
    },
    {
        "category_slug": "billing",
        "title": "Understanding Your Subscription",
        "slug": "understanding-subscription",
        "summary": "Overview of billing, plans, usage limits, and invoices.",
        "content": "## Understanding Your Subscription\n\n### Plan Details\nYour plan has limits on users, employees, and mills. Monitor usage from the Billing page.\n\n### Invoices\n- Monthly invoices generated on the 1st\n- Overage charges for extra usage\n- Download invoices as PDF\n\n### Overage\nIf you exceed plan limits, you can purchase additional capacity from the Billing portal.\n\n### Support\nContact your account manager or email support@spinflow.in for billing questions.",
        "tags": ["billing", "subscription", "plan", "invoice", "payment"],
        "context_page": "billing",
        "is_system": True,
    },
    {
        "category_slug": "settings",
        "title": "User Roles & Permissions",
        "slug": "user-roles-permissions",
        "summary": "Understanding roles and what each role can access.",
        "content": "## User Roles & Permissions\n\n### Available Roles\n- **MILL_OWNER** — Full access to all modules\n- **GENERAL_MANAGER** — Operations oversight\n- **PRODUCTION_MANAGER** — Production tracking\n- **SUPERVISOR** — Shift-level production\n- **MACHINE_OPERATOR** — Dashboard-only\n- **QUALITY_MANAGER** — Quality tests\n- **HR_MANAGER** — HR and payroll\n- And more...\n\n### Custom Permissions\nSUPER_ADMIN can customize module access per role in the Admin panel.",
        "tags": ["roles", "permissions", "access", "rbac"],
        "context_page": "users",
        "is_system": True,
    },
]


async def seed_help_content(db: AsyncSession) -> int:
    """Seed default help categories and articles. Returns total seeded count."""
    seeded = 0
    # Seed categories
    cat_map = {}
    for cat_def in DEFAULT_CATEGORIES:
        existing = (await db.execute(
            select(HelpCategory).where(HelpCategory.slug == cat_def["slug"])
        )).scalar_one_or_none()
        if not existing:
            cat = HelpCategory(**cat_def)
            db.add(cat)
            await db.flush()
            cat_map[cat_def["slug"]] = cat.id
            seeded += 1
        else:
            cat_map[cat_def["slug"]] = existing.id

    # Seed articles
    for art_def in DEFAULT_ARTICLES:
        existing = (await db.execute(
            select(HelpArticle).where(HelpArticle.slug == art_def["slug"])
        )).scalar_one_or_none()
        if existing:
            continue
        cat_id = cat_map.get(art_def["category_slug"])
        article = HelpArticle(
            category_id=cat_id,
            title=art_def["title"],
            slug=art_def["slug"],
            summary=art_def.get("summary"),
            content=art_def["content"],
            tags=art_def.get("tags", []),
            context_page=art_def.get("context_page"),
            is_system=art_def.get("is_system", False),
            is_active=True,
        )
        db.add(article)
        seeded += 1

    if seeded:
        await db.flush()
    return seeded
