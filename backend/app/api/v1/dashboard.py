from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, text
from typing import Optional

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.production import Machine, ProductionEntry, Shift
from app.models.maintenance import MaintenanceLog
from app.models.quality import QualityTest
from app.models.dispatch import Dispatch
from app.models.hr import Employee, Attendance, Leave
from app.models.masters import Department, Customer, Mill, Company
from app.models.lotrac import Trip
from app.models.inventory import Lot

router = APIRouter()


@router.get("/dashboard/kpis")
async def get_dashboard_kpis(
    role: Optional[str] = Query(None),
    date_range: Optional[str] = Query("today"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dashboard")),
):
    scope = await get_mill_scope(current_user)
    mill_id = scope.get("mill_id") or current_user.mill_id
    eff_role = role or current_user.role
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    month_start = datetime.now(timezone.utc).replace(day=1).strftime("%Y-%m-%d")

    machine_scope = []
    if scope.get("mill_id"):
        machine_scope = [Machine.mill_id == scope["mill_id"]]
    elif scope.get("company_id"):
        mills_subq = select(Mill.id).where(Mill.company_id == scope["company_id"]).scalar_subquery()
        machine_scope = [Machine.mill_id.in_(mills_subq)]

    kpis = {}

    q = select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(ProductionEntry.date == today, *machine_scope)
    prod_today = await db.execute(q)
    kpis["productionToday"] = float(prod_today.scalar() or 0)

    q = select(func.coalesce(func.sum(Machine.target_kg), 0))
    q = q.where(*machine_scope)
    target_today = await db.execute(q)
    kpis["productionTarget"] = float(target_today.scalar() or 1)

    q = select(func.coalesce(func.avg(
        ProductionEntry.produced_kg / func.nullif(Machine.target_kg, 0) * 100
    ), 0))
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(ProductionEntry.date == today, *machine_scope)
    eff_result = await db.execute(q)
    kpis["efficiency"] = round(float(eff_result.scalar() or 0), 1)

    # Maintenance — filtered by mill
    if mill_id:
        active_breakdowns = await db.execute(
            select(func.count()).select_from(MaintenanceLog).where(
                MaintenanceLog.mill_id == mill_id, MaintenanceLog.status == "open"
            )
        )
    else:
        active_breakdowns = await db.execute(
            select(func.count()).select_from(MaintenanceLog).where(MaintenanceLog.status == "open")
        )
    kpis["activeDowntime"] = active_breakdowns.scalar() or 0

    q = select(func.coalesce(func.avg(
        ProductionEntry.produced_kg / func.nullif(Machine.target_kg, 0) * 100
    ), 0))
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(ProductionEntry.date >= week_ago, *machine_scope)
    week_eff = await db.execute(q)
    kpis["avgEfficiency7d"] = round(float(week_eff.scalar() or 0), 1)

    prev_week_start = (datetime.now(timezone.utc) - timedelta(days=14)).strftime("%Y-%m-%d")
    q = select(func.coalesce(func.avg(
        ProductionEntry.produced_kg / func.nullif(Machine.target_kg, 0) * 100
    ), 0))
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(
        ProductionEntry.date >= prev_week_start,
        ProductionEntry.date < week_ago,
        *machine_scope,
    )
    prev_week_eff = await db.execute(q)
    kpis["prevWeekEfficiency"] = round(float(prev_week_eff.scalar() or 0), 1)

    stock_value = 0
    try:
        from app.services.stock_service import StockLedgerService
        stock_svc = StockLedgerService(db, current_user)
        snapshot = await stock_svc.stock_snapshot(mill_id=scope.get("mill_id") or "m1")
        stock_value = sum((r.get("weight_on_hand_kg", 0) or 0) * 150 for r in snapshot)
    except Exception:
        pass
    kpis["stockValue"] = stock_value

    # Dispatch — filtered by mill
    if mill_id:
        pending_dispatch = await db.execute(
            select(func.count()).select_from(Dispatch).where(
                Dispatch.mill_id == mill_id, Dispatch.status == "pending"
            )
        )
    else:
        pending_dispatch = await db.execute(
            select(func.count()).select_from(Dispatch).where(Dispatch.status == "pending")
        )
    kpis["pendingDispatch"] = pending_dispatch.scalar() or 0

    # Quality — filtered by mill
    if mill_id:
        total_tests_week = await db.execute(
            select(func.count()).select_from(QualityTest).where(
                QualityTest.mill_id == mill_id, QualityTest.date >= week_ago
            )
        )
        failed_tests_week = await db.execute(
            select(func.count()).select_from(QualityTest).where(
                QualityTest.mill_id == mill_id, QualityTest.date >= week_ago, QualityTest.status == "fail"
            )
        )
    else:
        total_tests_week = await db.execute(
            select(func.count()).select_from(QualityTest).where(QualityTest.date >= week_ago)
        )
        failed_tests_week = await db.execute(
            select(func.count()).select_from(QualityTest).where(
                QualityTest.date >= week_ago, QualityTest.status == "fail"
            )
        )
    total_t = total_tests_week.scalar() or 1
    kpis["qualityRejection"] = round((failed_tests_week.scalar() or 0) / total_t * 100, 1)

    q = select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(ProductionEntry.date >= month_start, *machine_scope)
    month_prod = await db.execute(q)
    month_target_raw = await db.execute(
        select(func.coalesce(func.sum(Machine.target_kg), 1)).where(*machine_scope)
    )
    month_target = float(month_target_raw.scalar() or 1)
    kpis["targetAchievement"] = round(float(month_prod.scalar() or 0) / month_target * 100, 1)

    q = select(func.coalesce(func.sum(ProductionEntry.waste_kg), 0))
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(ProductionEntry.date == today, *machine_scope)
    waste_raw = await db.execute(q)
    waste_today = float(waste_raw.scalar() or 0)
    kpis["wastePercent"] = round(waste_today / kpis["productionToday"] * 100, 1) if kpis["productionToday"] > 0 else 0

    q = select(
        ProductionEntry.date,
        func.coalesce(func.sum(ProductionEntry.produced_kg), 0).label("produced"),
    )
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(ProductionEntry.date >= week_ago, *machine_scope)
    q = q.group_by(ProductionEntry.date).order_by(ProductionEntry.date)
    trend_raw = await db.execute(q)
    trend_data = {}
    for row in trend_raw:
        trend_data[str(row.date)] = float(row.produced)

    q = select(func.coalesce(func.sum(Machine.target_kg), 0))
    q = q.where(*machine_scope)
    day_target_res = await db.execute(q)
    dt = float(day_target_res.scalar() or 1)
    trend = []
    for i in range(7):
        d = (datetime.now(timezone.utc) - timedelta(days=6-i)).strftime("%Y-%m-%d")
        trend.append({
            "day": d,
            "produced": trend_data.get(d, 0),
            "target": round(dt / 7, 1),
        })
    kpis["trend"] = trend

    q = select(
        ProductionEntry.department,
        func.coalesce(func.avg(
            ProductionEntry.produced_kg / func.nullif(Machine.target_kg, 0) * 100
        ), 0).label("efficiency"),
    )
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(ProductionEntry.date >= week_ago, *machine_scope)
    q = q.group_by(ProductionEntry.department)
    dept_eff = await db.execute(q)
    kpis["byDept"] = [
        {"dept": row.department, "efficiency": round(float(row.efficiency), 1)}
        for row in dept_eff
    ]

    return kpis


@router.get("/dashboard/charts")
async def get_chart_data(
    chart_type: str = Query("production"),
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dashboard")),
):
    scope = await get_mill_scope(current_user)
    start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    machine_scope = []
    if scope.get("mill_id"):
        machine_scope = [Machine.mill_id == scope["mill_id"]]
    elif scope.get("company_id"):
        mills_subq = select(Mill.id).where(Mill.company_id == scope["company_id"]).scalar_subquery()
        machine_scope = [Machine.mill_id.in_(mills_subq)]

    if chart_type == "production":
        rows = await db.execute(
            select(
                ProductionEntry.date,
                func.coalesce(func.sum(ProductionEntry.produced_kg), 0).label("produced"),
                func.coalesce(func.sum(ProductionEntry.waste_kg), 0).label("waste"),
                func.coalesce(func.avg(
                    ProductionEntry.produced_kg / func.nullif(Machine.target_kg, 0) * 100
                ), 0).label("efficiency"),
            )
            .join(Machine, ProductionEntry.machine_code == Machine.code)
            .where(ProductionEntry.date >= start, *machine_scope)
            .group_by(ProductionEntry.date)
            .order_by(ProductionEntry.date)
        )
        return {
            "type": "production",
            "data": [
                {
                    "date": str(r.date),
                    "produced": float(r.produced),
                    "waste": float(r.waste),
                    "efficiency": round(float(r.efficiency), 1),
                    "target": 0,
                }
                for r in rows
            ],
        }

    elif chart_type == "machine_status":
        running = await db.execute(
            select(func.count()).select_from(Machine).where(Machine.current_status == "running", *machine_scope)
        )
        idle = await db.execute(
            select(func.count()).select_from(Machine).where(Machine.current_status == "idle", *machine_scope)
        )
        breakdown = await db.execute(
            select(func.count()).select_from(Machine).where(Machine.current_status == "breakdown", *machine_scope)
        )
        return {
            "type": "machine_status",
            "data": {
                "running": running.scalar() or 0,
                "idle": idle.scalar() or 0,
                "breakdown": breakdown.scalar() or 0,
            },
        }

    elif chart_type == "quality":
        quality_scope = []
        if scope.get("mill_id"):
            quality_scope = [QualityTest.mill_id == scope["mill_id"]]
        rows = await db.execute(
            select(
                QualityTest.date,
                func.count().label("total"),
                func.coalesce(func.sum(case((QualityTest.status == "pass", 1), else_=0)), 0).label("passed"),
            )
            .where(QualityTest.date >= start, *quality_scope)
            .group_by(QualityTest.date)
            .order_by(QualityTest.date)
        )
        return {
            "type": "quality",
            "data": [
                {
                    "date": str(r.date),
                    "total": r.total,
                    "passed": r.passed,
                    "failed": r.total - r.passed,
                }
                for r in rows
            ],
        }

    elif chart_type == "dispatch":
        dispatch_scope = []
        if scope.get("mill_id"):
            dispatch_scope = [Dispatch.mill_id == scope["mill_id"]]
        rows = await db.execute(
            select(
                Dispatch.date,
                func.count().label("total"),
            )
            .where(Dispatch.date >= start, *dispatch_scope)
            .group_by(Dispatch.date)
            .order_by(Dispatch.date)
        )
        return {
            "type": "dispatch",
            "data": [{"date": str(r.date), "total": r.total} for r in rows],
        }

    elif chart_type == "attendance":
        attendance_scope = []
        if scope.get("mill_id"):
            attendance_scope = [Attendance.mill_id == scope["mill_id"]]
        rows = await db.execute(
            select(
                Attendance.date,
                func.count().label("total"),
            )
            .where(Attendance.date >= start, *attendance_scope)
            .group_by(Attendance.date)
            .order_by(Attendance.date)
        )
        return {
            "type": "attendance",
            "data": [{"date": str(r.date), "total": r.total} for r in rows],
        }

    return {"type": chart_type, "data": []}


@router.get("/dashboard/setup-status")
async def get_setup_status(
    mill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dashboard")),
):
    scope = await get_mill_scope(current_user)

    async def count(model):
        stmt = select(func.count()).select_from(model)
        if scope.get("mill_id") and hasattr(model, 'mill_id'):
            stmt = stmt.where(model.mill_id == scope["mill_id"])
        elif scope.get("company_id") and hasattr(model, 'mill_id'):
            mills_q = select(Mill.id).where(Mill.company_id == scope["company_id"])
            mills_res = await db.execute(mills_q)
            mill_ids = mills_res.scalars().all()
            if mill_ids:
                stmt = stmt.where(model.mill_id.in_(mill_ids))
        result = await db.execute(stmt)
        return result.scalar() or 0

    return {
        "departments": await count(Department),
        "machines": await count(Machine),
        "shifts": await count(Shift),
        "employees": await count(Employee),
        "users": await count(User),
        "customers": await count(Customer),
    }


@router.get("/dashboard/admin-summary")
async def get_admin_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        companies = await db.execute(text("SELECT COUNT(*) FROM companies WHERE deleted_at IS NULL"))
        total_companies = companies.scalar() or 0

        mills = await db.execute(text("SELECT COUNT(*) FROM mills WHERE deleted_at IS NULL"))
        total_mills = mills.scalar() or 0

        users = await db.execute(text("SELECT COUNT(*) FROM users WHERE is_active = true AND deleted_at IS NULL"))
        total_users = users.scalar() or 0

        employees = await db.execute(text("SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL"))
        total_employees = employees.scalar() or 0

        companies_list = await db.execute(text("SELECT id, name, code, created_at FROM companies WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 20"))
        rows = companies_list.fetchall()

        return {
            "total_companies": total_companies,
            "total_mills": total_mills,
            "total_users": total_users,
            "total_employees": total_employees,
            "companies": [
                {
                    "id": str(r.id),
                    "name": r.name,
                    "code": r.code,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
        }
    except Exception as e:
        print(f"admin-summary error: {e}")
        return {
            "total_companies": 0,
            "total_mills": 0,
            "total_users": 0,
            "total_employees": 0,
            "companies": [],
            "error": str(e)
        }


@router.get("/dashboard/summary")
async def get_dashboard_summary(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        role_code = current_user.role_rel.code if current_user.role_rel else ""
        if role_code == "SUPER_ADMIN":
            return _empty_dashboard()

        # Determine effective mill_id from param or current user
        effective_mill_id = mill_id or current_user.mill_id

        # SECURITY: verify this mill belongs to user's company
        if effective_mill_id and current_user.company_id:
            mill_check = await db.execute(
                select(Mill).where(Mill.id == effective_mill_id, Mill.company_id == current_user.company_id, Mill.deleted_at.is_(None))
            )
            if not mill_check.scalar_one_or_none():
                effective_mill_id = current_user.mill_id

        # Fallback: try first mill in user's company
        if not effective_mill_id and current_user.company_id:
            mill_result = await db.execute(
                select(Mill).where(Mill.company_id == current_user.company_id, Mill.deleted_at.is_(None)).limit(1)
            )
            mill = mill_result.scalar_one_or_none()
            effective_mill_id = mill.id if mill else None

        if not effective_mill_id:
            return _empty_dashboard()

        today = date.today()
        results = {}

        # Production today (via Machine join — ProductionEntry has no mill_id)
        try:
            q = select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
            q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
            q = q.where(Machine.mill_id == effective_mill_id, ProductionEntry.date == today.isoformat())
            results["production_today"] = float((await db.execute(q)).scalar() or 0)
        except Exception:
            results["production_today"] = 0

        # Production target
        try:
            q = select(func.coalesce(func.sum(Machine.target_kg), 0))
            q = q.where(Machine.mill_id == effective_mill_id)
            results["production_target"] = float((await db.execute(q)).scalar() or 1)
        except Exception:
            results["production_target"] = 3000

        # Waste %
        try:
            q = select(func.coalesce(func.sum(ProductionEntry.waste_kg), 0))
            q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
            q = q.where(Machine.mill_id == effective_mill_id, ProductionEntry.date == today.isoformat())
            waste = float((await db.execute(q)).scalar() or 0)
            results["waste_percent"] = round(waste / results["production_today"] * 100, 1) if results["production_today"] > 0 else 0
        except Exception:
            results["waste_percent"] = 0

        # Efficiency today
        try:
            q = select(func.coalesce(func.avg(
                ProductionEntry.produced_kg / func.nullif(Machine.target_kg, 0) * 100
            ), 0))
            q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
            q = q.where(Machine.mill_id == effective_mill_id, ProductionEntry.date == today.isoformat())
            results["efficiency_today"] = round(float((await db.execute(q)).scalar() or 0), 1)
        except Exception:
            results["efficiency_today"] = 0

        # Attendance
        try:
            q = select(func.count(Employee.id)).where(Employee.mill_id == effective_mill_id, Employee.is_active == True)
            total_emp = int((await db.execute(q)).scalar() or 0)
            q = select(func.count(Attendance.id)).where(
                Attendance.employee_id == Employee.id,
                Employee.mill_id == effective_mill_id,
                Attendance.date == today.isoformat(),
            )
            present = int((await db.execute(q)).scalar() or 0)
            results["attendance_total"] = total_emp
            results["attendance_present"] = present
            results["attendance_absent"] = max(0, total_emp - present)
        except Exception:
            results["attendance_total"] = 0
            results["attendance_present"] = 0
            results["attendance_absent"] = 0

        # Active machines
        try:
            q = select(func.count(Machine.id)).where(Machine.mill_id == effective_mill_id)
            total = int((await db.execute(q)).scalar() or 0)
            q = select(func.count(Machine.id)).where(Machine.mill_id == effective_mill_id, Machine.current_status == "running")
            active = int((await db.execute(q)).scalar() or 0)
            results["total_machines"] = total
            results["active_machines"] = active
        except Exception:
            results["total_machines"] = 0
            results["active_machines"] = 0

        # Revenue (from production entries this month)
        try:
            month_start = today.replace(day=1)
            q = select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
            q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
            q = q.where(Machine.mill_id == effective_mill_id, ProductionEntry.date >= month_start)
            month_kg = float((await db.execute(q)).scalar() or 0)
            results["monthly_revenue"] = month_kg * 150
            q = select(func.coalesce(func.sum(Machine.target_kg), 0))
            q = q.where(Machine.mill_id == effective_mill_id)
            total_target = float((await db.execute(q)).scalar() or 1)
            results["revenue_target"] = total_target * 150 if total_target > 0 else 3000000
        except Exception:
            results["monthly_revenue"] = 0
            results["revenue_target"] = 3000000

        # Pending payments
        try:
            results["pending_payments"] = 0
            results["overdue_customers"] = 0
        except Exception:
            results["pending_payments"] = 0
            results["overdue_customers"] = 0

        # Quality rejection (via Lot join — QualityTest has no mill_id)
        try:
            week_ago = today - timedelta(days=7)
            q = select(func.count(QualityTest.id))
            q = q.join(Lot, QualityTest.lot_id == Lot.id)
            q = q.where(Lot.mill_id == effective_mill_id, QualityTest.date >= week_ago)
            total_tests = int((await db.execute(q)).scalar() or 1)
            q = select(func.count(QualityTest.id))
            q = q.join(Lot, QualityTest.lot_id == Lot.id)
            q = q.where(Lot.mill_id == effective_mill_id, QualityTest.date >= week_ago, QualityTest.status == "fail")
            failed = int((await db.execute(q)).scalar() or 0)
            results["quality_rejection"] = round(failed / total_tests * 100, 1) if total_tests > 1 else 0
        except Exception:
            results["quality_rejection"] = 0

        # Target achievement
        try:
            month_start = today.replace(day=1)
            q = select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
            q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
            q = q.where(Machine.mill_id == effective_mill_id, ProductionEntry.date >= month_start)
            month_prod = float((await db.execute(q)).scalar() or 0)
            q = select(func.coalesce(func.sum(Machine.target_kg), 0))
            q = q.where(Machine.mill_id == effective_mill_id)
            month_target = float((await db.execute(q)).scalar() or 1)
            results["target_achievement"] = round(month_prod / month_target * 100, 1) if month_target > 0 else 0
        except Exception:
            results["target_achievement"] = 0

        # Active breakdowns (via Machine join — MaintenanceLog has no mill_id)
        try:
            q = select(func.count(MaintenanceLog.id))
            q = q.join(Machine, MaintenanceLog.machine_code == Machine.code)
            q = q.where(Machine.mill_id == effective_mill_id, MaintenanceLog.status == "open")
            results["active_breakdowns"] = int((await db.execute(q)).scalar() or 0)
        except Exception:
            results["active_breakdowns"] = 0

        # Pending dispatch
        try:
            q = select(func.count(Trip.id)).where(Trip.mill_id == effective_mill_id, Trip.status == "pending")
            results["pending_dispatch"] = int((await db.execute(q)).scalar() or 0)
        except Exception:
            results["pending_dispatch"] = 0

        # Total employees / stock lots
        try:
            q = select(func.count(Employee.id)).where(Employee.mill_id == effective_mill_id, Employee.is_active == True)
            results["total_employees"] = int((await db.execute(q)).scalar() or 0)
        except Exception:
            results["total_employees"] = 0
        try:
            q = select(func.count(Lot.id)).where(Lot.mill_id == effective_mill_id, Lot.status == "in-stock")
            results["stock_lots"] = int((await db.execute(q)).scalar() or 0)
        except Exception:
            results["stock_lots"] = 0

        # ── Production trend (last 7 days) ──
        try:
            trend = []
            week_ago_dt = today - timedelta(days=6)
            for i in range(7):
                d = week_ago_dt + timedelta(days=i)
                q = select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
                q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
                q = q.where(Machine.mill_id == effective_mill_id, ProductionEntry.date == d.isoformat(), ProductionEntry.status == "approved")
                produced = float((await db.execute(q)).scalar() or 0)
                trend.append({"day": d.strftime("%a"), "produced": produced, "target": 5000})
            results["production_trend"] = trend
        except Exception:
            results["production_trend"] = []

        # ── Department attendance ──
        try:
            dept_data = []
            dept_result = await db.execute(
                select(Employee.department, func.count(Employee.id))
                .where(
                    Employee.mill_id == effective_mill_id,
                    Employee.is_active == True,
                    Employee.department.isnot(None),
                )
                .group_by(Employee.department)
            )
            for dept_name, emp_count in dept_result.all():
                if dept_name and emp_count > 0:
                    present_q = select(func.count(Attendance.id))
                    present_q = present_q.where(
                        Attendance.employee_id == Employee.id,
                        Employee.mill_id == effective_mill_id,
                        Employee.department == dept_name,
                        Attendance.date == today.isoformat(),
                        Attendance.status == "present",
                    )
                    present_count = int((await db.execute(present_q)).scalar() or 0)
                    pct = round((present_count / emp_count) * 100, 1) if emp_count > 0 else 0
                    dept_data.append({"dept": dept_name, "pct": pct})
            results["dept_attendance"] = dept_data
        except Exception:
            results["dept_attendance"] = []

        # ── Alerts ──
        try:
            alerts_list = []
            # Open maintenance logs
            maint_q = select(MaintenanceLog).join(Machine, MaintenanceLog.machine_code == Machine.code)
            maint_q = maint_q.where(Machine.mill_id == effective_mill_id, MaintenanceLog.status == "open")
            maint_q = maint_q.order_by(MaintenanceLog.date.desc()).limit(5)
            for ml in (await db.execute(maint_q)).scalars().all():
                alerts_list.append({
                    "type": "critical",
                    "message": f"{ml.machine_code or 'Machine'} — {ml.description or 'maintenance needed'}",
                    "time": "just now",
                })
            # Pending leaves
            leave_q = select(func.count(Leave.id)).where(
                Leave.employee_id == Employee.id,
                Employee.mill_id == effective_mill_id,
                Leave.status == "pending",
            )
            pending_leaves = int((await db.execute(leave_q)).scalar() or 0)
            if pending_leaves > 0:
                alerts_list.append({
                    "type": "warning",
                    "message": f"{pending_leaves} leave request(s) pending approval",
                    "time": "today",
                })
            results["alerts"] = alerts_list
        except Exception:
            results["alerts"] = []

        # ── Pending actions ──
        try:
            qual_q = select(func.count(QualityTest.id))
            qual_q = qual_q.join(Lot, QualityTest.lot_id == Lot.id)
            qual_q = qual_q.where(Lot.mill_id == effective_mill_id, QualityTest.status == "pending")
            qual_count = int((await db.execute(qual_q)).scalar() or 0)

            trip_q = select(func.count(Trip.id)).where(Trip.mill_id == effective_mill_id, Trip.status == "draft")
            trip_count = int((await db.execute(trip_q)).scalar() or 0)

            leave_q = select(func.count(Leave.id)).where(
                Leave.employee_id == Employee.id,
                Employee.mill_id == effective_mill_id,
                Leave.status == "pending",
            )
            leave_count = int((await db.execute(leave_q)).scalar() or 0)

            results["pending_actions"] = [
                {"label": "Quality tests pending approval", "count": qual_count},
                {"label": "Dispatch trips to confirm", "count": trip_count},
                {"label": "Leave requests pending", "count": leave_count},
            ]
        except Exception:
            results["pending_actions"] = []

        # ── Schedule (shifts for today) ──
        try:
            shift_result = await db.execute(
                select(Shift).where(Shift.mill_id == effective_mill_id).order_by(Shift.start_time)
            )
            schedule_data = []
            for s in shift_result.scalars().all():
                label = f"{s.name} starts {s.start_time}" if s.name else f"Shift at {s.start_time}"
                schedule_data.append({"label": label, "time": s.start_time, "done": False})
            if not schedule_data:
                schedule_data = [
                    {"label": "A Shift starts 6:00 AM", "time": "06:00", "done": True},
                    {"label": "B Shift starts 2:00 PM", "time": "14:00", "done": False},
                    {"label": "C Shift starts 10:00 PM", "time": "22:00", "done": False},
                ]
            results["schedule"] = schedule_data
        except Exception:
            results["schedule"] = [
                {"label": "A Shift starts 6:00 AM", "time": "06:00", "done": True},
                {"label": "B Shift starts 2:00 PM", "time": "14:00", "done": False},
                {"label": "C Shift starts 10:00 PM", "time": "22:00", "done": False},
            ]

        results.setdefault("waste_percent", 0)
        results.setdefault("efficiency_today", 0)
        results.setdefault("quality_rejection", 0)
        results.setdefault("target_achievement", 0)
        results.setdefault("production_target", 3000)
        results.setdefault("attendance_present", 0)
        results.setdefault("attendance_total", 0)
        results.setdefault("attendance_absent", 0)
        results.setdefault("active_machines", 0)
        results.setdefault("total_machines", 0)
        results.setdefault("monthly_revenue", 0)
        results.setdefault("revenue_target", 3000000)
        results.setdefault("pending_payments", 0)
        results.setdefault("overdue_customers", 0)
        results.setdefault("active_breakdowns", 0)
        results.setdefault("pending_dispatch", 0)
        results.setdefault("total_employees", 0)
        results.setdefault("stock_lots", 0)

        return results

    except Exception as e:
        print(f"Dashboard summary error: {e}")
        return _empty_dashboard()


def _empty_dashboard():
    return {
        "production_today": 0, "production_target": 3000, "waste_percent": 0,
        "efficiency_today": 0, "quality_rejection": 0, "target_achievement": 0,
        "attendance_present": 0, "attendance_total": 0, "attendance_absent": 0,
        "active_machines": 0, "total_machines": 0,
        "monthly_revenue": 0, "revenue_target": 3000000,
        "pending_payments": 0, "overdue_customers": 0,
        "active_breakdowns": 0, "pending_dispatch": 0,
        "total_employees": 0, "stock_lots": 0,
        "production_trend": [], "dept_attendance": [], "alerts": [],
        "pending_actions": [], "schedule": [],
    }
