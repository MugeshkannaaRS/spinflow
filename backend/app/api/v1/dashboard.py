from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.core.deps import get_current_user, require_module
from app.models.user import User
from app.models.production import Machine, ProductionEntry, DowntimeLog, Shift
from app.models.dispatch import Dispatch
from app.models.quality import QualityTest
from app.models.masters import Department, Customer
from app.models.hr import Employee
from app.models.purchase import Supplier
from app.models.inventory import Warehouse
from app.services.production_service import ProductionService
from app.services.stock_service import StockLedgerService

router = APIRouter()


@router.get("/dashboard/kpis")
async def get_dashboard_kpis(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dashboard")),
):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    prod_svc = ProductionService(db, current_user)
    summary = await prod_svc.dashboard_summary()
    trend_raw = await prod_svc.efficiency_trend(days=7)

    target_result = await db.execute(select(func.sum(Machine.target_kg)))
    total_target = float(target_result.scalar() or 1)

    dispatch_pending = await db.execute(
        select(func.count()).select_from(Dispatch).where(Dispatch.status == "pending")
    )
    pending_dispatch = dispatch_pending.scalar() or 0

    quality_total = await db.execute(select(func.count()).select_from(QualityTest))
    total_q = quality_total.scalar() or 1
    quality_fail = await db.execute(
        select(func.count()).select_from(QualityTest).where(QualityTest.status == "fail")
    )
    fails = quality_fail.scalar() or 0

    stock_svc = StockLedgerService(db, current_user)
    try:
        snapshot = await stock_svc.stock_snapshot(mill_id=current_user.mill_id or "m1")
        stock_value = sum(
            (r.get("weight_on_hand_kg", 0) or 0) * 150
            for r in snapshot
        )
    except Exception:
        stock_value = 0

    today_result = await db.execute(
        select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0))
        .where(ProductionEntry.date == today)
    )
    production_today = float(today_result.scalar() or 0)

    today_waste = await db.execute(
        select(func.coalesce(func.sum(ProductionEntry.waste_kg), 0))
        .where(ProductionEntry.date == today)
    )
    waste_today = float(today_waste.scalar() or 0)
    waste_pct = round((waste_today / production_today * 100), 1) if production_today > 0 else 0

    trend = []
    for item in trend_raw:
        d = item["date"]
        day_result = await db.execute(
            select(func.coalesce(func.sum(Machine.target_kg), 0))
        )
        day_target = float(day_result.scalar() or 1)
        trend.append({
            "day": d,
            "produced": item["production_kg"],
            "target": round(day_target / 7, 1),
        })

    dept_data = summary.get("department_wise", {})
    total_prod = summary.get("production_kg", 1)
    by_dept = [
        {"dept": dept, "efficiency": round((kg / total_prod) * 100, 1) if total_prod > 0 else 0}
        for dept, kg in dept_data.items()
    ]

    efficiency = summary.get("efficiency_pct", 0)

    return {
        "productionToday": production_today,
        "productionTarget": total_target,
        "efficiency": efficiency,
        "wastePercent": waste_pct,
        "activeDowntime": summary.get("active_downtime_count", 0),
        "stockValue": stock_value,
        "pendingDispatch": pending_dispatch,
        "qualityRejection": round((fails / total_q) * 100, 1),
        "trend": trend,
        "byDept": by_dept,
    }


@router.get("/dashboard/setup-status")
async def get_setup_status(
    mill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dashboard")),
):
    async def count(model):
        result = await db.execute(select(func.count()).select_from(model))
        return result.scalar() or 0

    return {
        "departments": await count(Department),
        "machines": await count(Machine),
        "shifts": await count(Shift),
        "employees": await count(Employee),
        "users": await count(User),
        "suppliers": await count(Supplier),
        "customers": await count(Customer),
        "warehouses": await count(Warehouse),
    }
