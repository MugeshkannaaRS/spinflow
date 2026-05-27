from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from typing import Optional

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.production import Machine, ProductionEntry, Shift
from app.models.maintenance import MaintenanceLog
from app.models.quality import QualityTest
from app.models.dispatch import Dispatch
from app.models.hr import Employee, Attendance
from app.models.masters import Department, Customer, Mill

router = APIRouter()


@router.get("/dashboard/kpis")
async def get_dashboard_kpis(
    role: Optional[str] = Query(None),
    date_range: Optional[str] = Query("today"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dashboard")),
):
    scope = await get_mill_scope(current_user)
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

    active_breakdowns = await db.execute(
        select(func.count())
        .select_from(MaintenanceLog)
        .where(MaintenanceLog.status == "open")
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

    pending_dispatch = await db.execute(
        select(func.count()).select_from(Dispatch).where(Dispatch.status == "pending")
    )
    kpis["pendingDispatch"] = pending_dispatch.scalar() or 0

    total_tests_week = await db.execute(
        select(func.count()).select_from(QualityTest).where(QualityTest.date >= week_ago)
    )
    total_t = total_tests_week.scalar() or 1
    failed_tests_week = await db.execute(
        select(func.count()).select_from(QualityTest).where(
            QualityTest.date >= week_ago,
            QualityTest.status == "fail",
        )
    )
    kpis["qualityRejection"] = round((failed_tests_week.scalar() or 0) / total_t * 100, 1)

    q = select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
    q = q.join(Machine, ProductionEntry.machine_code == Machine.code)
    q = q.where(ProductionEntry.date >= month_start, *machine_scope)
    month_prod = await db.execute(q)
    month_target_raw = await db.execute(
        select(func.coalesce(func.sum(Machine.target_kg), 1))
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
        rows = await db.execute(
            select(
                QualityTest.date,
                func.count().label("total"),
                func.coalesce(func.sum(case((QualityTest.status == "pass", 1), else_=0)), 0).label("passed"),
            )
            .where(QualityTest.date >= start)
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
        rows = await db.execute(
            select(
                Dispatch.date,
                func.count().label("total"),
            )
            .where(Dispatch.date >= start)
            .group_by(Dispatch.date)
            .order_by(Dispatch.date)
        )
        return {
            "type": "dispatch",
            "data": [{"date": str(r.date), "total": r.total} for r in rows],
        }

    elif chart_type == "attendance":
        rows = await db.execute(
            select(
                Attendance.date,
                func.count().label("total"),
            )
            .where(Attendance.date >= start)
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
