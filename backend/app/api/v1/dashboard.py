from __future__ import annotations
import logging
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
from app.models.hr import Employee, Attendance, Leave, MonthlyPayroll
from app.models.masters import Department, Customer, Mill, Company
from app.models.lotrac import Trip
from app.models.inventory import Lot

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Role → sections mapping ────────────────────────────────────────────────

ROLE_SECTIONS: dict[str, set[str]] = {
    "SUPER_ADMIN":          {"production","machines","attendance","finance","quality","inventory","dispatch","payroll","alerts","pending_actions","schedule"},
    "MILL_OWNER":           {"production","machines","attendance","finance","quality","inventory","dispatch","payroll","alerts","pending_actions","schedule"},
    "GENERAL_MANAGER":      {"production","machines","attendance","finance","quality","inventory","dispatch","alerts","pending_actions"},
    "PRODUCTION_MANAGER":   {"production","machines","attendance","alerts","schedule"},
    "QUALITY_MANAGER":      {"quality","production","alerts"},
    "DISPATCH_MANAGER":     {"dispatch","inventory","alerts"},
    "HR_MANAGER":           {"attendance","payroll","alerts","pending_actions"},
    "ACCOUNTANT":           {"finance","payroll","inventory","alerts"},
    "MAINTENANCE_MANAGER":  {"machines","alerts","pending_actions"},
    "STORE_MANAGER":        {"inventory","alerts","pending_actions"},
    "SUPERVISOR":           {"production","attendance","machines","schedule","alerts"},
    "MACHINE_OPERATOR":     {"production","schedule","alerts"},
    "SECURITY_GATE":        {"attendance","schedule","alerts"},
    "AUDITOR":              {"production","machines","attendance","finance","quality","inventory","dispatch","payroll","alerts"},
}


def _want(role: str, section: str) -> bool:
    return section in ROLE_SECTIONS.get(role, set())


# ─── Legacy KPI endpoints (kept for backward compat) ─────────────────────────

@router.get("/dashboard/kpis")
async def get_dashboard_kpis(
    role: Optional[str] = Query(None),
    date_range: Optional[str] = Query("today"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dashboard")),
):
    scope = await get_mill_scope(current_user, db)
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

    if mill_id:
        active_breakdowns = await db.execute(
            select(func.count()).select_from(MaintenanceLog).join(
                Machine, MaintenanceLog.machine_code == Machine.code
            ).where(Machine.mill_id == mill_id, MaintenanceLog.status == "open")
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

    kpis["stockValue"] = 0

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

    if mill_id:
        total_tests_week = await db.execute(
            select(func.count()).select_from(QualityTest).join(
                Lot, QualityTest.lot_id == Lot.id
            ).where(Lot.mill_id == mill_id, QualityTest.date >= week_ago)
        )
        failed_tests_week = await db.execute(
            select(func.count()).select_from(QualityTest).join(
                Lot, QualityTest.lot_id == Lot.id
            ).where(Lot.mill_id == mill_id, QualityTest.date >= week_ago, QualityTest.status == "fail")
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
    scope = await get_mill_scope(current_user, db)
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
            quality_scope = [Lot.mill_id == scope["mill_id"]]
        rows = await db.execute(
            select(
                QualityTest.date,
                func.count().label("total"),
                func.coalesce(func.sum(case((QualityTest.status == "pass", 1), else_=0)), 0).label("passed"),
            )
            .join(Lot, QualityTest.lot_id == Lot.id)
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
            attendance_scope = [
                Employee.mill_id == scope["mill_id"],
                Attendance.employee_id == Employee.id,
            ]
        rows = await db.execute(
            select(
                Attendance.date,
                func.count().label("total"),
            )
            .join(Employee, Attendance.employee_id == Employee.id)
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
    scope = await get_mill_scope(current_user, db)

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
    result = {
        "total_companies": 0,
        "total_mills": 0,
        "total_users": 0,
        "total_employees": 0,
        "companies": [],
    }
    try:
        r1 = await db.execute(text("SELECT COUNT(*) FROM companies WHERE is_active = true"))
        result["total_companies"] = r1.scalar() or 0
    except Exception:
        try:
            r1b = await db.execute(text("SELECT COUNT(*) FROM companies"))
            result["total_companies"] = r1b.scalar() or 0
        except Exception:
            pass

    try:
        r2 = await db.execute(text("SELECT COUNT(*) FROM mills WHERE is_active = true"))
        result["total_mills"] = r2.scalar() or 0
    except Exception:
        try:
            r2b = await db.execute(text("SELECT COUNT(*) FROM mills"))
            result["total_mills"] = r2b.scalar() or 0
        except Exception:
            pass

    try:
        r3 = await db.execute(text(
            "SELECT COUNT(*) FROM users WHERE is_active = true AND deleted_at IS NULL"
        ))
        result["total_users"] = r3.scalar() or 0
    except Exception:
        try:
            r3b = await db.execute(text("SELECT COUNT(*) FROM users WHERE is_active = true"))
            result["total_users"] = r3b.scalar() or 0
        except Exception:
            pass

    try:
        r4 = await db.execute(text("SELECT COUNT(*) FROM employees"))
        result["total_employees"] = r4.scalar() or 0
    except Exception:
        pass

    try:
        r5 = await db.execute(text(
            "SELECT id::text, name, code, created_at "
            "FROM companies WHERE is_active = true "
            "ORDER BY created_at DESC LIMIT 20"
        ))
        rows = r5.fetchall()
        result["companies"] = [
            {"id": row[0], "name": row[1], "code": row[2],
             "created_at": row[3].isoformat() if row[3] else None}
            for row in rows
        ]
    except Exception:
        pass

    return result


# ─── NEW: Role-aware single summary endpoint ─────────────────────────────────

@router.get("/dashboard/summary")
async def get_dashboard_summary(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    today = date.today()
    now_iso = datetime.now(timezone.utc).isoformat()

    # ── Resolve effective mill / company scope ────────────────────────────────
    scope = await get_mill_scope(current_user, db)
    effective_mill_id: Optional[str] = None
    effective_company_id: Optional[str] = scope.get("company_id")
    mill_name: str = ""
    company_name: str = ""

    if role_code == "SUPER_ADMIN":
        # Cross-company: no mill filter
        effective_mill_id = None
        try:
            r = await db.execute(select(func.count()).select_from(Mill))
            _ = r.scalar()
        except Exception:
            pass
    elif scope.get("mill_id"):
        effective_mill_id = scope["mill_id"]
    else:
        # MILL_OWNER or company-scoped — use requested mill_id if valid, else first active mill
        req_mill = mill_id or current_user.mill_id
        if req_mill and effective_company_id:
            chk = await db.execute(
                select(Mill).where(
                    Mill.id == req_mill,
                    Mill.company_id == effective_company_id,
                    Mill.is_active == True,
                )
            )
            m = chk.scalar_one_or_none()
            if m:
                effective_mill_id = m.id
                mill_name = m.name
        if not effective_mill_id and effective_company_id:
            chk2 = await db.execute(
                select(Mill).where(
                    Mill.company_id == effective_company_id,
                    Mill.is_active == True,
                ).limit(1)
            )
            m2 = chk2.scalar_one_or_none()
            if m2:
                effective_mill_id = m2.id
                mill_name = m2.name

    # Fetch mill/company names if not yet set
    if not mill_name and effective_mill_id:
        try:
            mr = await db.execute(select(Mill).where(Mill.id == effective_mill_id))
            mo = mr.scalar_one_or_none()
            if mo:
                mill_name = mo.name
                effective_company_id = effective_company_id or str(mo.company_id)
        except Exception:
            pass

    if not company_name and effective_company_id:
        try:
            cr = await db.execute(select(Company).where(Company.id == effective_company_id))
            co = cr.scalar_one_or_none()
            if co:
                company_name = co.name
        except Exception:
            pass

    # Build machine scope filters used by production/machines queries
    if effective_mill_id:
        machine_filter = [Machine.mill_id == effective_mill_id]
    elif effective_company_id:
        mills_subq = select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery()
        machine_filter = [Machine.mill_id.in_(mills_subq)]
    else:
        machine_filter = []  # SUPER_ADMIN: no filter

    out: dict = {
        "role": role_code,
        "mill_name": mill_name,
        "company_name": company_name,
        "as_of": now_iso,
    }

    # ── PRODUCTION ────────────────────────────────────────────────────────────
    if _want(role_code, "production"):
        try:
            today_str = today.isoformat()
            week_ago_str = (today - timedelta(days=6)).isoformat()

            q_output = select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
            q_output = q_output.join(Machine, ProductionEntry.machine_code == Machine.code)
            q_output = q_output.where(ProductionEntry.date == today_str, *machine_filter)
            today_output = float((await db.execute(q_output)).scalar() or 0)

            q_target = select(func.coalesce(func.sum(Machine.target_kg), 0))
            q_target = q_target.where(*machine_filter) if machine_filter else q_target
            today_target = float((await db.execute(q_target)).scalar() or 0)

            q_waste = select(
                func.coalesce(func.sum(ProductionEntry.waste_kg), 0),
                func.coalesce(func.sum(ProductionEntry.produced_kg), 0),
            )
            q_waste = q_waste.join(Machine, ProductionEntry.machine_code == Machine.code)
            q_waste = q_waste.where(ProductionEntry.date == today_str, *machine_filter)
            waste_row = (await db.execute(q_waste)).one()
            waste_kg = float(waste_row[0] or 0)
            input_kg = float(waste_row[1] or 0)
            waste_pct = round(waste_kg / input_kg * 100, 1) if input_kg > 0 else 0.0

            efficiency_pct = round(today_output / today_target * 100, 1) if today_target > 0 else 0.0

            # Last 7 days trend
            trend_q = (
                select(
                    ProductionEntry.date,
                    func.coalesce(func.sum(ProductionEntry.produced_kg), 0).label("output_kg"),
                )
                .join(Machine, ProductionEntry.machine_code == Machine.code)
                .where(
                    ProductionEntry.date >= week_ago_str,
                    ProductionEntry.date <= today_str,
                    *machine_filter,
                )
                .group_by(ProductionEntry.date)
            )
            trend_by_date: dict[str, float] = {}
            for row in (await db.execute(trend_q)).all():
                trend_by_date[str(row[0])] = float(row[1])

            last_7_days = []
            for i in range(7):
                d = (today - timedelta(days=6 - i)).isoformat()
                last_7_days.append({
                    "date": d,
                    "output_kg": trend_by_date.get(d, 0.0),
                    "target_kg": today_target,
                })

            out["production"] = {
                "today_output_kg": today_output,
                "today_target_kg": today_target,
                "efficiency_pct": efficiency_pct,
                "waste_pct": waste_pct,
                "last_7_days": last_7_days,
            }
        except Exception as e:
            logger.warning(f"dashboard production section error: {e}")
            out["production"] = {
                "today_output_kg": 0, "today_target_kg": 0,
                "efficiency_pct": 0, "waste_pct": 0, "last_7_days": [],
            }

    # ── MACHINES ──────────────────────────────────────────────────────────────
    if _want(role_code, "machines"):
        try:
            q_total = select(func.count()).select_from(Machine)
            if machine_filter:
                q_total = q_total.where(*machine_filter)
            total_m = int((await db.execute(q_total)).scalar() or 0)

            q_active = select(func.count()).select_from(Machine).where(
                Machine.current_status == "running",
                *(machine_filter),
            )
            active_m = int((await db.execute(q_active)).scalar() or 0)

            q_down = select(func.count()).select_from(Machine).where(
                Machine.current_status == "breakdown",
                *(machine_filter),
            )
            down_m = int((await db.execute(q_down)).scalar() or 0)

            q_maint = select(func.count()).select_from(Machine).where(
                Machine.current_status == "idle",
                *(machine_filter),
            )
            maint_m = int((await db.execute(q_maint)).scalar() or 0)

            out["machines"] = {
                "total": total_m,
                "active": active_m,
                "down": down_m,
                "maintenance": maint_m,
            }
        except Exception as e:
            logger.warning(f"dashboard machines section error: {e}")
            out["machines"] = {"total": 0, "active": 0, "down": 0, "maintenance": 0}

    # ── ATTENDANCE ────────────────────────────────────────────────────────────
    if _want(role_code, "attendance"):
        try:
            today_str = today.isoformat()

            if effective_mill_id:
                emp_filter = [Employee.mill_id == effective_mill_id]
            elif effective_company_id:
                mill_sq = select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery()
                emp_filter = [Employee.mill_id.in_(mill_sq)]
            else:
                emp_filter = []

            q_total_emp = select(func.count()).select_from(Employee).where(
                Employee.is_active == True, *emp_filter
            )
            total_emp = int((await db.execute(q_total_emp)).scalar() or 0)

            q_present = (
                select(func.count())
                .select_from(Attendance)
                .join(Employee, Attendance.employee_id == Employee.id)
                .where(
                    Attendance.date == today_str,
                    Attendance.status == "present",
                    Employee.is_active == True,
                    *emp_filter,
                )
            )
            today_present = int((await db.execute(q_present)).scalar() or 0)

            today_absent = max(0, total_emp - today_present)
            present_pct = round(today_present / total_emp * 100, 1) if total_emp > 0 else 0.0

            # By department
            q_dept_present = (
                select(Employee.department, func.count().label("present"))
                .join(Attendance, Attendance.employee_id == Employee.id)
                .where(
                    Attendance.date == today_str,
                    Attendance.status == "present",
                    Employee.is_active == True,
                    Employee.department.isnot(None),
                    *emp_filter,
                )
                .group_by(Employee.department)
            )
            dept_present: dict[str, int] = {}
            for row in (await db.execute(q_dept_present)).all():
                dept_present[row[0]] = int(row[1])

            q_dept_total = (
                select(Employee.department, func.count().label("total"))
                .where(Employee.is_active == True, Employee.department.isnot(None), *emp_filter)
                .group_by(Employee.department)
            )
            by_department = []
            for row in (await db.execute(q_dept_total)).all():
                dept = row[0]
                if dept:
                    p = dept_present.get(dept, 0)
                    by_department.append({
                        "department": dept,
                        "present": p,
                        "absent": max(0, int(row[1]) - p),
                    })

            out["attendance"] = {
                "today_present": today_present,
                "today_absent": today_absent,
                "today_total": total_emp,
                "present_pct": present_pct,
                "by_department": by_department,
            }
        except Exception as e:
            logger.warning(f"dashboard attendance section error: {e}")
            out["attendance"] = {
                "today_present": 0, "today_absent": 0, "today_total": 0,
                "present_pct": 0.0, "by_department": [],
            }

    # ── FINANCE ───────────────────────────────────────────────────────────────
    if _want(role_code, "finance"):
        try:
            # Finance from production proxy (no invoices table yet)
            today_dt = today
            month_start = today_dt.replace(day=1)

            q_rev = (
                select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
                .join(Machine, ProductionEntry.machine_code == Machine.code)
                .where(
                    ProductionEntry.date >= month_start.isoformat(),
                    *machine_filter,
                )
            )
            month_kg = float((await db.execute(q_rev)).scalar() or 0)
            monthly_revenue = month_kg * 150  # ₹150/kg proxy

            # Revenue trend last 6 months
            revenue_trend = []
            for i in range(5, -1, -1):
                mn = today_dt.replace(day=1) - timedelta(days=30 * i)
                mn = mn.replace(day=1)
                if i == 0:
                    me = today_dt
                else:
                    next_m = mn.replace(day=28) + timedelta(days=4)
                    me = next_m.replace(day=1) - timedelta(days=1)

                q_m = (
                    select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
                    .join(Machine, ProductionEntry.machine_code == Machine.code)
                    .where(
                        ProductionEntry.date >= mn.isoformat(),
                        ProductionEntry.date <= me.isoformat(),
                        *machine_filter,
                    )
                )
                m_kg = float((await db.execute(q_m)).scalar() or 0)
                revenue_trend.append({
                    "month": mn.strftime("%b %Y"),
                    "revenue": m_kg * 150,
                    "purchases": 0.0,
                })

            out["finance"] = {
                "monthly_revenue": monthly_revenue,
                "monthly_purchases": 0.0,
                "outstanding": 0.0,
                "overdue_count": 0,
                "revenue_trend": revenue_trend,
            }
        except Exception as e:
            logger.warning(f"dashboard finance section error: {e}")
            out["finance"] = {
                "monthly_revenue": 0, "monthly_purchases": 0,
                "outstanding": 0, "overdue_count": 0, "revenue_trend": [],
            }

    # ── QUALITY ───────────────────────────────────────────────────────────────
    if _want(role_code, "quality"):
        try:
            today_str = today.isoformat()
            q_scope = [Lot.mill_id == effective_mill_id] if effective_mill_id else (
                [Lot.mill_id.in_(select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery())]
                if effective_company_id else []
            )

            q_total = (
                select(func.count())
                .select_from(QualityTest)
                .join(Lot, QualityTest.lot_id == Lot.id)
                .where(QualityTest.date == today_str, *q_scope)
            )
            tests_today = int((await db.execute(q_total)).scalar() or 0)

            q_pass = (
                select(func.count())
                .select_from(QualityTest)
                .join(Lot, QualityTest.lot_id == Lot.id)
                .where(QualityTest.date == today_str, QualityTest.status == "pass", *q_scope)
            )
            pass_count = int((await db.execute(q_pass)).scalar() or 0)

            q_pending = (
                select(func.count())
                .select_from(QualityTest)
                .join(Lot, QualityTest.lot_id == Lot.id)
                .where(QualityTest.status == "pending", *q_scope)
            )
            pending_approvals = int((await db.execute(q_pending)).scalar() or 0)

            q_fail = (
                select(func.count())
                .select_from(QualityTest)
                .join(Lot, QualityTest.lot_id == Lot.id)
                .where(QualityTest.date == today_str, QualityTest.status == "fail", *q_scope)
            )
            fail_count = int((await db.execute(q_fail)).scalar() or 0)

            pass_rate = round(pass_count / tests_today * 100, 1) if tests_today > 0 else 0.0
            defect_rate = round(fail_count / tests_today * 100, 1) if tests_today > 0 else 0.0

            out["quality"] = {
                "tests_today": tests_today,
                "pass_rate_pct": pass_rate,
                "pending_approvals": pending_approvals,
                "defect_rate_pct": defect_rate,
            }
        except Exception as e:
            logger.warning(f"dashboard quality section error: {e}")
            out["quality"] = {
                "tests_today": 0, "pass_rate_pct": 0, "pending_approvals": 0, "defect_rate_pct": 0,
            }

    # ── INVENTORY ─────────────────────────────────────────────────────────────
    if _want(role_code, "inventory"):
        try:
            lot_filter = [Lot.mill_id == effective_mill_id] if effective_mill_id else (
                [Lot.mill_id.in_(select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery())]
                if effective_company_id else []
            )

            q_total_lots = select(func.count()).select_from(Lot).where(*lot_filter)
            total_items = int((await db.execute(q_total_lots)).scalar() or 0)

            # Low stock = lots with quality_status = 'pending' or status = 'in-stock' and quantity <= 0
            # (No reorder_level on Lot; use quantity <= 100 as proxy for low stock)
            q_low = select(func.count()).select_from(Lot).where(
                Lot.status == "in-stock",
                Lot.quantity <= 100,
                *lot_filter,
            )
            low_stock_count = int((await db.execute(q_low)).scalar() or 0)

            q_low_items = (
                select(Lot.lot_no, Lot.quantity, Lot.unit, Lot.type)
                .where(Lot.status == "in-stock", Lot.quantity <= 100, *lot_filter)
                .order_by(Lot.quantity)
                .limit(5)
            )
            low_stock_items = []
            for row in (await db.execute(q_low_items)).all():
                low_stock_items.append({
                    "name": row[0],
                    "current": float(row[1]),
                    "reorder_level": 100.0,
                    "unit": row[2] or "kg",
                })

            out["inventory"] = {
                "total_items": total_items,
                "low_stock_count": low_stock_count,
                "low_stock_items": low_stock_items,
            }
        except Exception as e:
            logger.warning(f"dashboard inventory section error: {e}")
            out["inventory"] = {"total_items": 0, "low_stock_count": 0, "low_stock_items": []}

    # ── DISPATCH ──────────────────────────────────────────────────────────────
    if _want(role_code, "dispatch"):
        try:
            today_str = today.isoformat()
            trip_filter = [Trip.mill_id == effective_mill_id] if effective_mill_id else (
                [Trip.mill_id.in_(select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery())]
                if effective_company_id else []
            )

            q_today_trips = select(func.count()).select_from(Trip).where(
                func.date(Trip.created_at) == today_str, *trip_filter
            )
            today_trips = int((await db.execute(q_today_trips)).scalar() or 0)

            q_pending = select(func.count()).select_from(Trip).where(
                Trip.status == "in_transit", *trip_filter
            )
            pending_deliveries = int((await db.execute(q_pending)).scalar() or 0)

            q_delivered = select(func.count()).select_from(Trip).where(
                Trip.status == "delivered",
                func.date(Trip.delivered_at) == today_str,
                *trip_filter,
            )
            delivered_today = int((await db.execute(q_delivered)).scalar() or 0)

            # Sacks = sum of loaded_bags for today's trips
            q_sacks = select(func.coalesce(func.sum(Trip.loaded_bags), 0)).where(
                func.date(Trip.created_at) == today_str, *trip_filter
            )
            today_sacks = int((await db.execute(q_sacks)).scalar() or 0)

            out["dispatch"] = {
                "today_trips": today_trips,
                "today_sacks": today_sacks,
                "pending_deliveries": pending_deliveries,
                "delivered_today": delivered_today,
            }
        except Exception as e:
            logger.warning(f"dashboard dispatch section error: {e}")
            out["dispatch"] = {
                "today_trips": 0, "today_sacks": 0, "pending_deliveries": 0, "delivered_today": 0,
            }

    # ── PAYROLL ───────────────────────────────────────────────────────────────
    if _want(role_code, "payroll"):
        try:
            if effective_mill_id:
                pay_filter = [MonthlyPayroll.mill_id == effective_mill_id]
            elif effective_company_id:
                mill_sq = select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery()
                pay_filter = [MonthlyPayroll.mill_id.in_(mill_sq)]
            else:
                pay_filter = []

            cur_month = today.month
            cur_year = today.year

            q_emp_total = select(func.count()).select_from(Employee).where(
                Employee.is_active == True,
                *([Employee.mill_id == effective_mill_id] if effective_mill_id else
                  [Employee.mill_id.in_(select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery())]
                  if effective_company_id else [])
            )
            total_employees = int((await db.execute(q_emp_total)).scalar() or 0)

            q_processed = select(func.count()).select_from(MonthlyPayroll).where(
                MonthlyPayroll.month == cur_month,
                MonthlyPayroll.year == cur_year,
                MonthlyPayroll.is_finalized == True,
                *pay_filter,
            )
            processed_count = int((await db.execute(q_processed)).scalar() or 0)

            q_pending = select(func.count()).select_from(MonthlyPayroll).where(
                MonthlyPayroll.month == cur_month,
                MonthlyPayroll.year == cur_year,
                MonthlyPayroll.is_finalized == False,
                *pay_filter,
            )
            pending_count = int((await db.execute(q_pending)).scalar() or 0)

            q_total_pay = select(func.coalesce(func.sum(MonthlyPayroll.net_payable), 0)).where(
                MonthlyPayroll.month == cur_month,
                MonthlyPayroll.year == cur_year,
                *pay_filter,
            )
            total_payable = float((await db.execute(q_total_pay)).scalar() or 0)

            out["payroll"] = {
                "current_month": today.strftime("%b %Y"),
                "total_employees": total_employees,
                "processed_count": processed_count,
                "pending_count": pending_count,
                "total_payable": total_payable,
            }
        except Exception as e:
            logger.warning(f"dashboard payroll section error: {e}")
            out["payroll"] = {
                "current_month": today.strftime("%b %Y"),
                "total_employees": 0, "processed_count": 0,
                "pending_count": 0, "total_payable": 0,
            }

    # ── ALERTS ────────────────────────────────────────────────────────────────
    alerts: list[dict] = []
    try:
        # Machines down
        if effective_mill_id:
            mf = [Machine.mill_id == effective_mill_id]
        elif effective_company_id:
            mf = [Machine.mill_id.in_(select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery())]
        else:
            mf = []

        q_down_mach = select(func.count()).select_from(Machine).where(
            Machine.current_status == "breakdown", *mf
        )
        down_count = int((await db.execute(q_down_mach)).scalar() or 0)
        if down_count > 0:
            alerts.append({"type": "error", "message": f"{down_count} machine(s) down", "module": "machines"})

        # Open maintenance
        q_open_maint = (
            select(func.count())
            .select_from(MaintenanceLog)
            .join(Machine, MaintenanceLog.machine_code == Machine.code)
            .where(MaintenanceLog.status == "open", *mf)
        )
        open_maint = int((await db.execute(q_open_maint)).scalar() or 0)
        if open_maint > 0:
            alerts.append({"type": "warning", "message": f"{open_maint} open maintenance job(s)", "module": "maintenance"})

        # Pending leaves
        if effective_mill_id:
            ef = [Employee.mill_id == effective_mill_id]
        elif effective_company_id:
            mill_sq = select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery()
            ef = [Employee.mill_id.in_(mill_sq)]
        else:
            ef = []

        q_leaves = (
            select(func.count())
            .select_from(Leave)
            .join(Employee, Leave.employee_id == Employee.id)
            .where(Leave.status == "pending", *ef)
        )
        pending_leaves = int((await db.execute(q_leaves)).scalar() or 0)
        if pending_leaves > 0:
            alerts.append({"type": "info", "message": f"{pending_leaves} leave request(s) pending approval", "module": "hr"})

        # Low inventory
        if "inventory" in out and out["inventory"]["low_stock_count"] > 0:
            alerts.append({"type": "warning", "message": f"{out['inventory']['low_stock_count']} low stock lot(s)", "module": "inventory"})

        # Overdue quality
        if "quality" in out and out["quality"]["pending_approvals"] > 0:
            alerts.append({"type": "info", "message": f"{out['quality']['pending_approvals']} quality test(s) pending approval", "module": "quality"})

    except Exception as e:
        logger.warning(f"dashboard alerts error: {e}")

    out["alerts"] = alerts

    # ── PENDING ACTIONS ───────────────────────────────────────────────────────
    if _want(role_code, "pending_actions"):
        pending_actions = []
        try:
            if effective_mill_id:
                ef = [Employee.mill_id == effective_mill_id]
            elif effective_company_id:
                mill_sq = select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery()
                ef = [Employee.mill_id.in_(mill_sq)]
            else:
                ef = []

            q_leave_pa = (
                select(func.count())
                .select_from(Leave)
                .join(Employee, Leave.employee_id == Employee.id)
                .where(Leave.status == "pending", *ef)
            )
            leave_count = int((await db.execute(q_leave_pa)).scalar() or 0)
            if leave_count > 0:
                pending_actions.append({"label": "Leave requests pending", "count": leave_count, "route": "/hr"})

            if effective_mill_id:
                trip_filter = [Trip.mill_id == effective_mill_id]
            elif effective_company_id:
                mill_sq2 = select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery()
                trip_filter = [Trip.mill_id.in_(mill_sq2)]
            else:
                trip_filter = []

            q_draft_trips = select(func.count()).select_from(Trip).where(
                Trip.status == "draft", *trip_filter
            )
            trip_count = int((await db.execute(q_draft_trips)).scalar() or 0)
            if trip_count > 0:
                pending_actions.append({"label": "Dispatch trips to confirm", "count": trip_count, "route": "/lotrac"})

            q_scope = [Lot.mill_id == effective_mill_id] if effective_mill_id else (
                [Lot.mill_id.in_(select(Mill.id).where(Mill.company_id == effective_company_id).scalar_subquery())]
                if effective_company_id else []
            )
            q_qual_pending = (
                select(func.count())
                .select_from(QualityTest)
                .join(Lot, QualityTest.lot_id == Lot.id)
                .where(QualityTest.status == "pending", *q_scope)
            )
            qual_count = int((await db.execute(q_qual_pending)).scalar() or 0)
            if qual_count > 0:
                pending_actions.append({"label": "Quality tests pending approval", "count": qual_count, "route": "/quality"})

        except Exception as e:
            logger.warning(f"dashboard pending_actions error: {e}")

        out["pending_actions"] = pending_actions

    # ── SCHEDULE ──────────────────────────────────────────────────────────────
    if _want(role_code, "schedule"):
        try:
            shift_filter = [Shift.mill_id == effective_mill_id] if effective_mill_id else []
            shift_result = await db.execute(
                select(Shift).where(*shift_filter).order_by(Shift.start_time)
            )
            shifts = shift_result.scalars().all()

            now_local = datetime.now(timezone.utc)
            current_shift_name = ""
            for s in shifts:
                try:
                    sh, sm = map(int, s.start_time.split(":"))
                    eh, em = map(int, s.end_time.split(":"))
                    h = now_local.hour
                    if sh <= h < eh or (sh > eh and (h >= sh or h < eh)):
                        current_shift_name = s.code
                except Exception:
                    pass

            if shifts:
                s0 = shifts[0]
                out["schedule"] = {
                    "current_shift": current_shift_name or (shifts[0].code if shifts else "A"),
                    "shift_start": s0.start_time,
                    "shift_end": s0.end_time,
                }
            else:
                out["schedule"] = {
                    "current_shift": "A",
                    "shift_start": "06:00",
                    "shift_end": "14:00",
                }
        except Exception as e:
            logger.warning(f"dashboard schedule error: {e}")
            out["schedule"] = {"current_shift": "A", "shift_start": "06:00", "shift_end": "14:00"}

    # Also include legacy flat fields for backward compatibility with existing
    # dashboard components that still read the old shape
    try:
        if "production" in out:
            p = out["production"]
            out["production_today"] = p["today_output_kg"]
            out["production_target"] = p["today_target_kg"]
            out["efficiency_today"] = p["efficiency_pct"]
            out["waste_percent"] = p["waste_pct"]
            out["production_trend"] = [
                {"day": d["date"][-5:], "produced": d["output_kg"], "target": d["target_kg"]}
                for d in p["last_7_days"]
            ]

        if "machines" in out:
            m = out["machines"]
            out["total_machines"] = m["total"]
            out["active_machines"] = m["active"]

        if "attendance" in out:
            a = out["attendance"]
            out["attendance_present"] = a["today_present"]
            out["attendance_absent"] = a["today_absent"]
            out["attendance_total"] = a["today_total"]
            out["dept_attendance"] = [
                {"dept": d["department"], "pct": round(d["present"] / (d["present"] + d["absent"]) * 100, 1)
                 if (d["present"] + d["absent"]) > 0 else 0}
                for d in a["by_department"]
            ]

        if "finance" in out:
            f = out["finance"]
            out["monthly_revenue"] = f["monthly_revenue"]
            out["revenue_target"] = f["monthly_revenue"] * 1.1 or 3000000
            out["pending_payments"] = f["outstanding"]
            out["overdue_customers"] = f["overdue_count"]

        out.setdefault("quality_rejection", 0)
        out.setdefault("target_achievement", 0)
        out.setdefault("active_breakdowns", 0)
        out.setdefault("pending_dispatch", 0)
        out.setdefault("total_employees", 0)
        out.setdefault("stock_lots", 0)
        out.setdefault("production_today", 0)
        out.setdefault("production_target", 0)
        out.setdefault("efficiency_today", 0)
        out.setdefault("waste_percent", 0)
        out.setdefault("production_trend", [])
        out.setdefault("dept_attendance", [])
        out.setdefault("total_machines", 0)
        out.setdefault("active_machines", 0)
        out.setdefault("attendance_present", 0)
        out.setdefault("attendance_absent", 0)
        out.setdefault("attendance_total", 0)
        out.setdefault("monthly_revenue", 0)
        out.setdefault("revenue_target", 3000000)
        out.setdefault("pending_payments", 0)
        out.setdefault("overdue_customers", 0)
        out.setdefault("schedule", [])
        out.setdefault("pending_actions", [])
    except Exception as e:
        logger.warning(f"dashboard compat fields error: {e}")

    return out
