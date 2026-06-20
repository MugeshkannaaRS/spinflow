import logging
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, and_

from app.models.masters import Mill
from app.models.production import Machine, ProductionEntry
from app.models.hr import Employee, Attendance
from app.models.stock import StockBalance
from app.models.dispatch import Dispatch
from app.models.alerts import AlertEvent

logger = logging.getLogger(__name__)


class OwnerDashboardService:
    """Single multi-mill aggregated summary for MILL_OWNER across all mills.

    All per-mill metrics are fetched in one GROUP BY query each — never loop
    over individual mills (connection pool = 3).
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def owner_summary(self, company_id: str) -> dict:
        today_str = date.today().isoformat()

        # 1. Active mills for this company
        mills_q = await self.db.execute(
            select(Mill.id, Mill.name, Mill.code)
            .where(Mill.company_id == company_id, Mill.is_active == True)
            .order_by(Mill.name)
        )
        mills = mills_q.fetchall()
        if not mills:
            return {
                "mills": [],
                "total_production_kg_today": 0,
                "avg_efficiency_pct": 0,
                "total_active_machines": 0,
                "total_machines": 0,
                "total_employees": 0,
                "total_present_today": 0,
                "total_balance_kg": 0,
                "total_dispatch_kg_today": 0,
                "total_open_alerts": 0,
            }

        mill_ids = [str(m.id) for m in mills]
        mill_map = {str(m.id): {"name": m.name, "code": m.code} for m in mills}

        # 2. Production today per mill (JOIN through Machine since
        #    ProductionEntry has no mill_id column)
        prod_rows = await self.db.execute(
            select(
                Machine.mill_id,
                func.coalesce(func.sum(ProductionEntry.produced_kg), 0).label("production_kg"),
                func.coalesce(func.avg(
                    ProductionEntry.produced_kg / func.nullif(Machine.target_kg, 0) * 100
                ), 0).label("efficiency"),
            )
            .join(ProductionEntry, ProductionEntry.machine_code == Machine.code)
            .where(
                ProductionEntry.date == today_str,
                Machine.mill_id.in_(mill_ids),
            )
            .group_by(Machine.mill_id)
        )
        prod_data: dict[str, dict] = {}
        for r in prod_rows:
            mid = str(r.mill_id)
            prod_data[mid] = {
                "production_kg": float(r.production_kg),
                "efficiency": round(float(r.efficiency), 1),
            }

        # 3. Machine stats per mill
        mach_rows = await self.db.execute(
            select(
                Machine.mill_id,
                func.count().label("total"),
                func.coalesce(func.sum(case((Machine.current_status == "running", 1), else_=0)), 0).label("active"),
            )
            .where(Machine.mill_id.in_(mill_ids))
            .group_by(Machine.mill_id)
        )
        mach_data: dict[str, dict] = {}
        for r in mach_rows:
            mach_data[str(r.mill_id)] = {"total": r.total, "active": int(r.active)}

        # 4. Employee count + present today per mill (single LEFT JOIN)
        emp_rows = await self.db.execute(
            select(
                Employee.mill_id,
                func.count().label("total"),
                func.coalesce(func.count(Attendance.employee_id), 0).label("present"),
            )
            .outerjoin(Attendance, and_(
                Attendance.employee_id == Employee.id,
                Attendance.date == today_str,
                Attendance.status == "present",
            ))
            .where(
                Employee.is_active == True,
                Employee.mill_id.in_(mill_ids),
            )
            .group_by(Employee.mill_id)
        )
        emp_data: dict[str, dict] = {}
        for r in emp_rows:
            emp_data[str(r.mill_id)] = {"total": r.total, "present": int(r.present)}

        # 5. Stock balance (weight_on_hand_kg) per mill
        stock_rows = await self.db.execute(
            select(
                StockBalance.mill_id,
                func.coalesce(func.sum(StockBalance.weight_on_hand_kg), 0).label("balance_kg"),
            )
            .where(StockBalance.mill_id.in_(mill_ids))
            .group_by(StockBalance.mill_id)
        )
        stock_data: dict[str, float] = {}
        for r in stock_rows:
            stock_data[str(r.mill_id)] = float(r.balance_kg)

        # 6. Dispatch quantity today per mill
        disp_rows = await self.db.execute(
            select(
                Dispatch.mill_id,
                func.coalesce(func.sum(Dispatch.quantity_kg), 0).label("dispatch_kg"),
            )
            .where(Dispatch.date == today_str, Dispatch.mill_id.in_(mill_ids))
            .group_by(Dispatch.mill_id)
        )
        disp_data: dict[str, float] = {}
        for r in disp_rows:
            disp_data[str(r.mill_id)] = float(r.dispatch_kg)

        # 7. Open alerts per mill
        alert_rows = await self.db.execute(
            select(
                AlertEvent.mill_id,
                func.count().label("open_count"),
            )
            .where(
                AlertEvent.mill_id.in_(mill_ids),
                AlertEvent.status.in_(["open", "acknowledged"]),
            )
            .group_by(AlertEvent.mill_id)
        )
        alert_data: dict[str, int] = {}
        for r in alert_rows:
            alert_data[str(r.mill_id)] = r.open_count

        # Assemble rows + totals
        totals = {
            "total_production_kg_today": 0.0,
            "total_active_machines": 0,
            "total_machines": 0,
            "total_employees": 0,
            "total_present_today": 0,
            "total_balance_kg": 0.0,
            "total_dispatch_kg_today": 0.0,
            "total_open_alerts": 0,
        }
        mills_out = []

        for mid in mill_ids:
            info = mill_map[mid]
            p = prod_data.get(mid, {"production_kg": 0.0, "efficiency": 0.0})
            m = mach_data.get(mid, {"total": 0, "active": 0})
            e = emp_data.get(mid, {"total": 0, "present": 0})
            b = stock_data.get(mid, 0.0)
            d = disp_data.get(mid, 0.0)
            a = alert_data.get(mid, 0)

            mills_out.append({
                "mill_id": mid,
                "mill_name": info["name"],
                "mill_code": info["code"],
                "production_kg_today": p["production_kg"],
                "efficiency_pct": p["efficiency"],
                "active_machines": m["active"],
                "total_machines": m["total"],
                "employees_active": e["total"],
                "present_today": e["present"],
                "balance_kg": b,
                "dispatch_kg_today": d,
                "open_alerts": a,
            })

            totals["total_production_kg_today"] += p["production_kg"]
            totals["total_active_machines"] += m["active"]
            totals["total_machines"] += m["total"]
            totals["total_employees"] += e["total"]
            totals["total_present_today"] += e["present"]
            totals["total_balance_kg"] += b
            totals["total_dispatch_kg_today"] += d
            totals["total_open_alerts"] += a

        eff_values = [m["efficiency_pct"] for m in mills_out if m["efficiency_pct"] > 0]
        totals["avg_efficiency_pct"] = round(
            sum(eff_values) / len(eff_values), 1
        ) if eff_values else 0.0

        return {
            "mills": mills_out,
            **totals,
        }
