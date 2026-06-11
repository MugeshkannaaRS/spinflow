"""Wave 5.4 — Demo Platform + Trial Engine

Services:
  DemoService        — create/reset/expire demo environments
  DemoDataGenerator  — synthetic spinning mill data generation
  TourService        — product tour definitions + progress
  EngagementService  — trial engagement + health scoring
  NudgeService       — contextual nudge delivery
  JourneyService     — funnel event tracking via audit log
"""
import logging
import random
import string
from datetime import datetime, timedelta, date, timezone
from typing import Optional
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password
from app.models.demo import DemoEnvironment, ProductTour, TourProgress, Nudge
from app.models.user import User, Role
from app.models.masters import Company, Mill, Department
from app.models.hr import Employee
from app.models.production import Machine, Shift, ProductionEntry
from app.models.inventory import InventoryItem, Lot
from app.models.quality import QualityTest
from app.models.dispatch import Dispatch
from app.models.billing import CompanySubscription, SubscriptionPlan
from app.models.alerts import AlertEvent

logger = logging.getLogger(__name__)


class DemoService:
    """Create, reset, and manage demo environments."""

    DEMO_EXPIRY_DAYS = 14
    DEMO_PLAN_SLUG = "starter"

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_demo(
        self,
        company_name: str,
        email: str,
        password: str,
        full_name: str,
        source: str = "self_service",
    ) -> dict:
        """Create a complete demo environment with synthetic data."""
        from app.services.onboarding_service import OnboardingService

        company_code = "DEMO_" + str(random.randint(10000, 99999))

        # Create onboarding request
        from app.schemas.onboarding import OnboardingRequest
        req = OnboardingRequest(
            company_name=company_name,
            company_code=company_code,
            owner_name=full_name,
            owner_email=email,
            owner_password=password,
            plan_code=self.DEMO_PLAN_SLUG,
            module_codes=None,
            mills=[{"name": f"{company_name} Main Mill", "code": f"{company_code}_M1"}],
        )

        svc = OnboardingService(self.db, is_demo=True)
        result = await svc.onboard(req)
        company_id = result["company_id"]
        mill_ids = result["mill_ids"]

        # Mark as demo
        demo = DemoEnvironment(
            company_id=company_id,
            source=source,
            expires_at=datetime.now(timezone.utc) + timedelta(days=self.DEMO_EXPIRY_DAYS),
        )
        self.db.add(demo)

        # Generate synthetic data for each mill
        gen = DemoDataGenerator(self.db)
        for mid in mill_ids:
            await gen.generate(mid, days=30)

        await self.db.flush()
        return {"company_id": company_id, "mill_ids": mill_ids, "demo_id": demo.id}

    async def reset_demo(self, company_id: str) -> bool:
        """Reset demo data (delete + regenerate)."""
        demo = (await self.db.execute(
            select(DemoEnvironment).where(DemoEnvironment.company_id == company_id)
        )).scalar_one_or_none()
        if not demo:
            return False

        mills = (await self.db.execute(
            select(Mill).where(Mill.company_id == company_id)
        )).scalars().all()

        for mill in mills:
            mid = str(mill.id)
            await self.db.execute(
                select(func.count(1)).select_from(
                    select(ProductionEntry).where(ProductionEntry.mill_id == mid).limit(1).subquery()
                )
            )

        demo.reset_count = (demo.reset_count or 0) + 1
        gen = DemoDataGenerator(self.db)
        for mill in mills:
            await gen.generate(str(mill.id), days=30)
        return True

    async def expire_demo(self, company_id: str) -> bool:
        """Mark demo as expired and suspend company."""
        demo = (await self.db.execute(
            select(DemoEnvironment).where(DemoEnvironment.company_id == company_id)
        )).scalar_one_or_none()
        if not demo:
            return False
        demo.status = "expired"
        company = await self.db.get(Company, company_id)
        if company and company.status == "active":
            company.status = "suspended"
        return True

    async def get_active_demo(self, company_id: str) -> Optional[DemoEnvironment]:
        row = (await self.db.execute(
            select(DemoEnvironment).where(
                DemoEnvironment.company_id == company_id,
                DemoEnvironment.status == "active",
            )
        )).scalar_one_or_none()
        return row


class DemoDataGenerator:
    """Generate realistic synthetic spinning mill data."""

    MACHINE_TYPES = ["Blowroom", "Carding", "Drawing", "Simplex", "Ring Frame", "Winding"]
    MACHINE_CODES = ["BR", "CD", "DW", "SP", "RF", "WN"]
    QUALITY_PARAMS = ["Strength", "Uniformity", "Trash%", "Moisture%", "Elongation"]
    EMPLOYEE_NAMES = [
        "Ravi Kumar", "Suresh Patel", "Amit Singh", "Rajesh Sharma", "Vijay Reddy",
        "Arun Nair", "Manoj Verma", "Deepak Joshi", "Sanjay Gupta", "Karthik Iyer",
        "Prakash Rao", "Vinod Menon", "Harish Bhat", "Naveen Shetty", "Ganesh Pillai",
        "Srinivas Murthy", "Dinesh Kaul", "Mahesh Desai", "Ajay Saxena", "Rahul Jain",
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate(self, mill_id: str, days: int = 30) -> int:
        """Generate synthetic data for one mill. Returns count of items created."""
        from app.db.base import generate_uuid
        total = 0

        # Get company_id from mill
        mill = await self.db.get(Mill, mill_id)
        if not mill:
            return 0
        company_id = str(mill.company_id)

        # Find or create departments
        dept_names = ["Blowroom", "Carding", "Drawing", "Simplex", "Ring Frame", "Winding", "Quality", "Admin"]
        dept_ids = []
        for name in dept_names:
            existing = (await self.db.execute(
                select(Department).where(
                    Department.company_id == company_id,
                    Department.name == name,
                )
            )).scalar_one_or_none()
            if existing:
                dept_ids.append(existing.id)
            else:
                dept = Department(company_id=company_id, name=name, is_active=True)
                self.db.add(dept)
                await self.db.flush()
                dept_ids.append(dept.id)
                total += 1

        # Generate machines
        machine_ids = []
        for mt_idx, mt in enumerate(self.MACHINE_TYPES):
            for n in range(1, random.randint(2, 4)):
                code = f"{self.MACHINE_CODES[mt_idx]}-{n:02d}"
                existing = (await self.db.execute(
                    select(Machine).where(Machine.code == code, Machine.mill_id == mill_id)
                )).scalar_one_or_none()
                if existing:
                    machine_ids.append(existing.id)
                    continue
                mach = Machine(
                    mill_id=mill_id, code=code, name=f"{mt} #{n}",
                    machine_type=mt, status="active", is_active=True,
                )
                self.db.add(mach)
                await self.db.flush()
                machine_ids.append(mach.id)
                total += 1

        # Generate shifts
        shift_names = ["A", "B", "C"]
        shift_ids = []
        for sn in shift_names:
            existing = (await self.db.execute(
                select(Shift).where(Shift.company_id == company_id, Shift.name == sn)
            )).scalar_one_or_none()
            if existing:
                shift_ids.append(existing.id)
                continue
            shift = Shift(
                company_id=company_id, mill_id=mill_id, name=sn,
                start_time=f"{['06:00','14:00','22:00'][shift_names.index(sn)]}",
                end_time=f"{['14:00','22:00','06:00'][shift_names.index(sn)]}",
                is_active=True,
            )
            self.db.add(shift)
            await self.db.flush()
            shift_ids.append(shift.id)
            total += 1

        # Generate employees
        emp_ids = []
        dept_cycle = 0
        for en in self.EMPLOYEE_NAMES[:random.randint(10, 15)]:
            emp = Employee(
                mill_id=mill_id, name=en, employee_code=f"EMP-{random.randint(1000,9999)}",
                department_id=dept_ids[dept_cycle % len(dept_ids)],
                designation="Operator", is_active=True,
                phone=f"+91{random.randint(7000000000, 9999999999)}",
            )
            self.db.add(emp)
            await self.db.flush()
            emp_ids.append(emp.id)
            dept_cycle += 1
            total += 1

        # Generate production entries
        for d in range(days):
            entry_date = date.today() - timedelta(days=days - 1 - d)
            for mid in machine_ids:
                produced = random.randint(300, 800)
                waste = random.randint(10, 50)
                entry = ProductionEntry(
                    mill_id=mill_id, machine_id=mid, shift_id=random.choice(shift_ids),
                    produced_kg=produced, waste_kg=waste, entry_date=entry_date,
                    operator_name=random.choice(self.EMPLOYEE_NAMES),
                    is_active=True, status="approved",
                )
                self.db.add(entry)
                total += 1

        # Generate inventory items
        item_names = ["Cotton 1", "Cotton 2", "Polyester", "Viscose", "Packaging Material"]
        for iname in item_names:
            inv = InventoryItem(
                company_id=company_id, mill_id=mill_id, name=iname,
                current_stock=random.randint(500, 5000),
                minimum_stock=random.randint(100, 500),
                unit="kg", is_active=True,
            )
            self.db.add(inv)
            total += 1

        # Generate quality tests
        quality_lots = (await self.db.execute(
            select(Lot).where(Lot.mill_id == mill_id).limit(20)
        )).scalars().all()
        for lot in quality_lots:
            for param in self.QUALITY_PARAMS:
                qt = QualityTest(
                    company_id=company_id, mill_id=mill_id,
                    lot_id=lot.id,
                    test_type=param,
                    result=str(random.uniform(80, 99)),
                    status=random.choice(["PASS", "PASS", "PASS", "FAIL"]),
                    tested_by="System",
                    tested_at=datetime.now(timezone.utc) - timedelta(days=random.randint(0, days)),
                )
                self.db.add(qt)
                total += 1

        return total


class TourService:
    """Product tour management and progress tracking."""

    DEFAULT_TOURS = [
        {
            "title": "Production Module Tour",
            "slug": "production-tour",
            "description": "Learn how to record production entries and track efficiency.",
            "target_page": "/production",
            "sort_order": 1,
            "steps": [
                {"target": "[data-tour='production-header']", "title": "Production Dashboard", "content": "This is your production overview. View daily output, efficiency, and waste at a glance."},
                {"target": "[data-tour='production-new-entry']", "title": "Record Production", "content": "Click here to add a new production entry. Select machine, shift, and enter produced quantity."},
                {"target": "[data-tour='production-list']", "title": "Production History", "content": "All production entries are listed here. Filter by date, machine, or shift."},
                {"target": "[data-tour='production-charts']", "title": "Analytics", "content": "Visual charts show production trends, efficiency over time, and waste analysis."},
            ],
        },
        {
            "title": "Inventory Module Tour",
            "slug": "inventory-tour",
            "description": "Manage stock items, transfers, and low stock alerts.",
            "target_page": "/inventory",
            "sort_order": 2,
            "steps": [
                {"target": "[data-tour='inventory-header']", "title": "Inventory Overview", "content": "View all stock items and current quantities at a glance."},
                {"target": "[data-tour='inventory-transfer']", "title": "Stock Transfers", "content": "Transfer stock between warehouses or mills with a unique tracking number."},
                {"target": "[data-tour='inventory-low-stock']", "title": "Low Stock Alerts", "content": "Items below minimum stock level are highlighted here for quick reordering."},
            ],
        },
        {
            "title": "Quality Module Tour",
            "slug": "quality-tour",
            "description": "Create quality tests, approve lots, and track pass rates.",
            "target_page": "/quality",
            "sort_order": 3,
            "steps": [
                {"target": "[data-tour='quality-header']", "title": "Quality Dashboard", "content": "Track quality test results, pass rates, and pending approvals."},
                {"target": "[data-tour='quality-new-test']", "title": "New Quality Test", "content": "Create a quality test for any production lot. Test strength, uniformity, and more."},
                {"target": "[data-tour='quality-approvals']", "title": "Lot Approvals", "content": "Approve or reject lots based on quality test results."},
            ],
        },
        {
            "title": "Billing Module Tour",
            "slug": "billing-tour",
            "description": "Monitor your subscription, usage limits, and invoices.",
            "target_page": "/company/billing",
            "sort_order": 4,
            "steps": [
                {"target": "[data-tour='billing-header']", "title": "Billing Overview", "content": "Your subscription plan, usage limits, and current billing period."},
                {"target": "[data-tour='billing-usage']", "title": "Usage Tracking", "content": "Monitor your usage against plan limits for users, employees, and mills."},
                {"target": "[data-tour='billing-invoices']", "title": "Invoices", "content": "View and download invoices for your subscription and add-on purchases."},
            ],
        },
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def seed_default_tours(self) -> int:
        seeded = 0
        for td in self.DEFAULT_TOURS:
            existing = (await self.db.execute(
                select(ProductTour).where(ProductTour.slug == td["slug"])
            )).scalar_one_or_none()
            if existing:
                continue
            tour = ProductTour(
                title=td["title"], slug=td["slug"], description=td.get("description"),
                target_page=td["target_page"], steps=td["steps"],
                sort_order=td.get("sort_order", 0), is_active=True,
            )
            self.db.add(tour)
            seeded += 1
        if seeded:
            await self.db.flush()
        return seeded

    async def list_tours(self, page: Optional[str] = None):
        q = select(ProductTour).where(ProductTour.is_active == True).order_by(ProductTour.sort_order)
        if page:
            q = q.where(ProductTour.target_page == page)
        rows = (await self.db.execute(q)).scalars().all()
        return rows

    async def get_tour(self, slug: str) -> Optional[ProductTour]:
        row = (await self.db.execute(
            select(ProductTour).where(ProductTour.slug == slug, ProductTour.is_active == True)
        )).scalar_one_or_none()
        return row

    async def get_progress(self, user_id: str, tour_id: str) -> Optional[TourProgress]:
        row = (await self.db.execute(
            select(TourProgress).where(
                TourProgress.user_id == user_id, TourProgress.tour_id == tour_id
            )
        )).scalar_one_or_none()
        return row

    async def update_progress(self, user_id: str, tour_id: str, action: str) -> TourProgress:
        prog = await self.get_progress(user_id, tour_id)
        if not prog:
            prog = TourProgress(user_id=user_id, tour_id=tour_id)
            self.db.add(prog)
        if action == "next":
            step = await self.db.get(ProductTour, tour_id)
            max_steps = len(step.steps) if step and step.steps else 0
            prog.current_step = min(prog.current_step + 1, max_steps)
            if prog.current_step >= max_steps:
                prog.completed = True
                prog.completed_at = datetime.now(timezone.utc)
        elif action == "prev":
            prog.current_step = max(0, prog.current_step - 1)
        elif action == "skip":
            prog.skipped = True
            prog.completed = True
            prog.completed_at = datetime.now(timezone.utc)
        await self.db.flush()
        return prog


class EngagementService:
    """Trial engagement and customer health scoring."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_engagement_score(self, company_id: str) -> dict:
        """Compute engagement score 0-100 based on feature usage."""
        from app.services.customer_success_service import OnboardingProgressService

        # Setup completion (30%)
        progress_svc = OnboardingProgressService(self.db)
        progress = await progress_svc.compute_progress(company_id)
        setup_score = (progress["percent"] / 100) * 30

        # User activity (25%)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        active_users = (await self.db.execute(
            select(func.count(User.id)).where(
                User.company_id == company_id,
                User.last_login >= thirty_days_ago,
            )
        )).scalar() or 0
        total_users = (await self.db.execute(
            select(func.count(User.id)).where(User.company_id == company_id, User.is_active == True)
        )).scalar() or 1
        activity_score = min(active_users / max(total_users, 1), 1.0) * 25

        # Data volume (20%)
        mills = (await self.db.execute(
            select(func.count(Mill.id)).where(Mill.company_id == company_id)
        )).scalar() or 0
        machines = (await self.db.execute(
            select(func.count(Machine.id))
            .join(Mill, Mill.id == Machine.mill_id)
            .where(Mill.company_id == company_id)
        )).scalar() or 0
        data_density = min((mills + machines) / 20, 1.0) * 20

        # Feature adoption (25%)
        prod_entries = (await self.db.execute(
            select(func.count(ProductionEntry.id))
            .join(Mill, Mill.id == ProductionEntry.mill_id)
            .where(Mill.company_id == company_id)
        )).scalar() or 0
        quality_tests = (await self.db.execute(
            select(func.count(QualityTest.id)).where(QualityTest.company_id == company_id)
        )).scalar() or 0
        feature_score = min((min(prod_entries, 100) / 100 + min(quality_tests, 20) / 20) / 2, 1.0) * 25

        total = round(setup_score + activity_score + data_density + feature_score, 1)

        return {
            "score": total,
            "components": {
                "setup_completion": {"score": round(setup_score, 1), "weight": 30},
                "user_activity": {"score": round(activity_score, 1), "weight": 25},
                "data_density": {"score": round(data_density, 1), "weight": 20},
                "feature_adoption": {"score": round(feature_score, 1), "weight": 25},
            },
            "classification": self._classify(total),
        }

    def _classify(self, score: float) -> str:
        if score >= 70: return "healthy"
        if score >= 50: return "warning"
        if score >= 30: return "at_risk"
        return "critical"

    async def get_trial_summary(self, company_id: str) -> dict:
        """Trial-specific engagement metrics."""
        sub = (await self.db.execute(
            select(CompanySubscription).where(
                CompanySubscription.company_id == company_id,
                CompanySubscription.status == "trial",
            )
        )).scalar_one_or_none()

        if not sub:
            return {"is_trial": False}

        trial_days = (datetime.now(timezone.utc) - sub.started_at).days if sub.started_at else 0
        remaining = (sub.trial_ends_at - datetime.now(timezone.utc)).days if sub.trial_ends_at else 0

        engagement = await self.get_engagement_score(company_id)

        return {
            "is_trial": True,
            "trial_days_elapsed": trial_days,
            "trial_days_remaining": max(remaining, 0),
            "engagement_score": engagement["score"],
            "classification": engagement["classification"],
            "conversion_readiness": self._readiness(engagement["score"], trial_days),
        }

    def _readiness(self, score: float, days_elapsed: int) -> str:
        if score >= 70 and days_elapsed >= 7: return "ready_to_convert"
        if score >= 50 or days_elapsed >= 10: return "hot"
        if score >= 30 or days_elapsed >= 5: return "warm"
        return "cold"


class NudgeService:
    """Contextual recommendation delivery."""

    DEFAULT_NUDGES = [
        {"title": "Import your employees", "message": "Add your workforce to track attendance, payroll, and productivity per employee.", "nudge_type": "setup", "condition": "no_employees", "action_label": "Import Employees", "action_url": "/import-hub", "icon": "Users", "priority": "high"},
        {"title": "Configure production shifts", "message": "Set up shifts to track production hours and calculate shift-wise efficiency.", "nudge_type": "setup", "condition": "no_shifts", "action_label": "Create Shifts", "action_url": "/masters", "icon": "Clock", "priority": "high"},
        {"title": "Complete quality parameters", "message": "Define quality test parameters to enable lot approvals and reject tracking.", "nudge_type": "setup", "condition": "no_quality", "action_label": "Quality Settings", "action_url": "/quality", "icon": "CheckCircle", "priority": "medium"},
        {"title": "Explore the executive dashboard", "message": "Get a one-page overview of production, revenue, alerts, and approvals.", "nudge_type": "adoption", "condition": "dashboard_views", "action_label": "View Dashboard", "action_url": "/dashboard", "icon": "LayoutDashboard", "priority": "medium"},
        {"title": "Record your first production entry", "message": "Start tracking real-time production data to monitor efficiency and waste.", "nudge_type": "adoption", "condition": "no_production", "action_label": "Record Production", "action_url": "/production", "icon": "Factory", "priority": "high"},
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def seed_default_nudges(self) -> int:
        seeded = 0
        for nd in self.DEFAULT_NUDGES:
            existing = (await self.db.execute(
                select(Nudge).where(Nudge.title == nd["title"], Nudge.is_system == True)
            )).scalar_one_or_none()
            if existing:
                continue
            nudge = Nudge(**nd, is_system=True)
            self.db.add(nudge)
            seeded += 1
        if seeded:
            await self.db.flush()
        return seeded

    async def get_active_nudges(self, company_id: str, dismissed_ids: Optional[list[str]] = None) -> list[dict]:
        """Return nudges relevant to this company's current state."""
        dismissed = set(dismissed_ids or [])
        all_nudges = (await self.db.execute(
            select(Nudge).where(Nudge.is_active == True).order_by(Nudge.priority.desc())
        )).scalars().all()

        from app.services.customer_success_service import RecommendationService
        rec_svc = RecommendationService(self.db)
        recs = await rec_svc.get_recommendations(company_id)

        # Dynamic status checks
        has_employees = True
        has_shifts = True
        has_production = True
        for r in recs:
            if "no employees" in r["title"].lower():
                has_employees = False
            if "no shifts" in r["title"].lower():
                has_shifts = False

        prod_count = (await self.db.execute(
            select(func.count(ProductionEntry.id))
            .join(Mill, Mill.id == ProductionEntry.mill_id)
            .where(Mill.company_id == company_id)
        )).scalar() or 0
        has_production = prod_count > 0

        results = []
        for n in all_nudges:
            if n.id in dismissed:
                continue
            condition = n.condition or ""
            if condition == "no_employees" and has_employees:
                continue
            if condition == "no_shifts" and has_shifts:
                continue
            if condition == "no_production" and has_production:
                continue
            results.append({
                "id": n.id, "title": n.title, "message": n.message,
                "nudge_type": n.nudge_type, "action_label": n.action_label,
                "action_url": n.action_url, "icon": n.icon, "priority": n.priority,
            })
        return results


class JourneyService:
    """Track and analyze customer journey milestones using audit log."""

    MILESTONES = [
        "company_created", "first_login", "first_employee", "first_production",
        "first_quality_test", "first_dispatch", "first_invoice", "first_alert",
        "first_approval", "first_export", "setup_complete", "upgrade", "renewal",
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_journey(self, company_id: str) -> dict:
        """Build journey timeline from audit log and DB state."""
        from app.models.audit import AuditLog
        timeline = []

        # Company creation
        company = await self.db.get(Company, company_id)
        if company:
            timeline.append({"milestone": "company_created", "label": "Company Created", "date": company.created_at.isoformat() if company.created_at else None, "completed": True})

        # First login via audit
        first_login = (await self.db.execute(
            select(AuditLog).where(
                AuditLog.company_id == company_id,
                AuditLog.action == "login",
            ).order_by(AuditLog.created_at).limit(1)
        )).scalar_one_or_none()
        timeline.append({
            "milestone": "first_login", "label": "First Login",
            "date": first_login.created_at.isoformat() if first_login else None,
            "completed": first_login is not None,
        })

        # First production
        first_prod = (await self.db.execute(
            select(ProductionEntry).join(Mill, Mill.id == ProductionEntry.mill_id).where(
                Mill.company_id == company_id
            ).order_by(ProductionEntry.created_at).limit(1)
        )).scalar_one_or_none()
        timeline.append({
            "milestone": "first_production", "label": "First Production Entry",
            "date": first_prod.created_at.isoformat() if first_prod and first_prod.created_at else None,
            "completed": first_prod is not None,
        })

        # First quality test
        first_qt = (await self.db.execute(
            select(QualityTest).where(
                QualityTest.company_id == company_id
            ).order_by(QualityTest.created_at).limit(1)
        )).scalar_one_or_none()
        timeline.append({
            "milestone": "first_quality_test", "label": "First Quality Test",
            "date": first_qt.created_at.isoformat() if first_qt and first_qt.created_at else None,
            "completed": first_qt is not None,
        })

        # Setup completion
        from app.services.customer_success_service import OnboardingProgressService
        progress = await OnboardingProgressService(self.db).compute_progress(company_id)
        timeline.append({
            "milestone": "setup_complete", "label": "Setup Complete",
            "date": None, "completed": progress["percent"] >= 100,
        })

        # Compute conversion readiness
        engagement = await EngagementService(self.db).get_engagement_score(company_id)
        completed = sum(1 for t in timeline if t["completed"])
        total = len(timeline)

        return {
            "company_id": company_id,
            "company_name": company.name if company else "",
            "timeline": timeline,
            "progress": {"completed": completed, "total": total, "percent": round(completed / total * 100)},
            "engagement": engagement,
        }

    async def get_funnel(self) -> dict:
        """Lead-to-customer conversion funnel (SUPER_ADMIN)."""
        total_companies = (await self.db.execute(
            select(func.count(Company.id)).select_from(Company)
        )).scalar() or 0

        with_production = 0
        with_quality = 0
        with_setup = 0
        active_subs = 0

        companies = (await self.db.execute(
            select(Company).where(Company.status == "active")
        )).scalars().all()

        for c in companies:
            cid = str(c.id)
            prod = (await self.db.execute(
                select(func.count(ProductionEntry.id))
                .join(Mill, Mill.id == ProductionEntry.mill_id)
                .where(Mill.company_id == cid)
            )).scalar() or 0
            if prod > 0: with_production += 1

            qt = (await self.db.execute(
                select(func.count(QualityTest.id)).where(QualityTest.company_id == cid)
            )).scalar() or 0
            if qt > 0: with_quality += 1

            sub = (await self.db.execute(
                select(func.count(CompanySubscription.id)).where(
                    CompanySubscription.company_id == cid, CompanySubscription.status == "active"
                )
            )).scalar() or 0
            if sub > 0: active_subs += 1

        return {
            "total_companies": total_companies,
            "with_setup": with_setup,
            "with_production": with_production,
            "with_quality": with_quality,
            "active_subscriptions": active_subs,
            "conversion_rate": round(active_subs / max(total_companies, 1) * 100, 1),
            "funnel": [
                {"stage": "Signed Up", "count": total_companies, "dropoff": 0},
                {"stage": "Setup Started", "count": total_companies, "dropoff": total_companies - with_setup},
                {"stage": "Production Active", "count": with_production, "dropoff": total_companies - with_production},
                {"stage": "Quality Active", "count": with_quality, "dropoff": total_companies - with_quality},
                {"stage": "Paying", "count": active_subs, "dropoff": total_companies - active_subs},
            ],
        }
