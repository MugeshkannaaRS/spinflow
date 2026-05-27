from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.production import Machine, ProductionEntry
from app.models.quality import QualityTest
from app.models.dispatch import Dispatch
from app.models.accounts import Invoice
from app.models.purchase import CottonPurchase
from app.models.hr import Employee, Attendance, Leave, MonthlyPayroll
from app.models.inventory import Lot
from app.models.masters import Mill

router = APIRouter()


@router.get("/reports/summary")
async def get_report_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("reports")),
):
    scope = await get_mill_scope(current_user)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    total_produced, total_target = 0, 0
    try:
        prod_res = await db.execute(select(func.coalesce(func.sum(ProductionEntry.produced_kg), 0)))
        total_produced = float(prod_res.scalar() or 0)
        tgt_res = await db.execute(select(func.coalesce(func.sum(Machine.target_kg), 0)))
        total_target = float(tgt_res.scalar() or 1)
    except Exception:
        pass

    eff_res = await db.execute(
        select(func.coalesce(func.avg(
            ProductionEntry.produced_kg / func.nullif(Machine.target_kg, 0) * 100
        ), 0))
        .join(Machine, ProductionEntry.machine_code == Machine.code)
    )
    avg_eff = round(float(eff_res.scalar() or 0), 1)

    waste_res = await db.execute(select(func.coalesce(func.sum(ProductionEntry.waste_kg), 0)))
    total_waste = float(waste_res.scalar() or 0)
    waste_pct = round(total_waste / total_produced * 100, 1) if total_produced > 0 else 0

    total_tests = await db.execute(select(func.count()).select_from(QualityTest))
    total_t = total_tests.scalar() or 1
    pass_count = await db.execute(
        select(func.count()).select_from(QualityTest).where(QualityTest.status == "pass")
    )
    total_pass = pass_count.scalar() or 0

    pending = await db.execute(
        select(func.count()).select_from(Dispatch).where(Dispatch.status == "pending")
    )
    dispatched = await db.execute(
        select(func.count()).select_from(Dispatch).where(Dispatch.status.in_(["loaded", "gate-out"]))
    )
    delivered = await db.execute(
        select(func.count()).select_from(Dispatch).where(Dispatch.status.in_(["dispatched", "delivered"]))
    )

    sales = await db.execute(
        select(func.coalesce(func.sum(Invoice.total), 0)).where(Invoice.type == "sales")
    )
    purchases = await db.execute(
        select(func.coalesce(func.sum(CottonPurchase.net_kg * CottonPurchase.rate_per_kg), 0))
    )
    gst = await db.execute(
        select(func.coalesce(func.sum(Invoice.gst), 0)).where(Invoice.type == "sales")
    )

    total_employees = await db.execute(select(func.count()).select_from(Employee))
    today_present = await db.execute(
        select(func.count()).select_from(Attendance).where(
            Attendance.date == today,
            Attendance.status == "present",
        )
    )
    pending_leaves = await db.execute(
        select(func.count()).select_from(Leave).where(Leave.status == "pending")
    )

    return {
        "production_summary": {
            "total_produced": total_produced,
            "total_target": total_target,
            "avg_efficiency": avg_eff,
            "waste_percent": waste_pct,
        },
        "quality_summary": {
            "tests_conducted": total_t,
            "pass_rate": round((total_pass / total_t) * 100, 1) if total_t else 0,
            "fail_rate": round(((total_t - total_pass) / total_t) * 100, 1) if total_t else 0,
        },
        "dispatch_summary": {
            "pending": pending.scalar() or 0,
            "in_transit": dispatched.scalar() or 0,
            "delivered": delivered.scalar() or 0,
        },
        "financial_summary": {
            "sales_total": float(sales.scalar() or 0),
            "purchase_total": float(purchases.scalar() or 0),
            "gst_collected": float(gst.scalar() or 0),
        },
        "hr_summary": {
            "total_employees": total_employees.scalar() or 0,
            "present_today": today_present.scalar() or 0,
            "pending_leaves": pending_leaves.scalar() or 0,
        },
        "stock_summary": {
            "total_lots": 0,
            "sellable_stock_kg": 0,
        },
    }


@router.post("/reports/payslip")
async def generate_payslip_pdf(
    employee_id: str = Query(...),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("reports")),
):
    emp = await db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")

    payroll = await db.execute(
        select(MonthlyPayroll).where(
            MonthlyPayroll.employee_id == employee_id,
            MonthlyPayroll.month == month,
            MonthlyPayroll.year == year,
        )
    )
    p = payroll.scalar_one_or_none()

    payslip_data = {
        "employee_name": emp.name or "",
        "employee_code": emp.code or "",
        "department": emp.department or "",
        "designation": emp.designation or "",
        "month": month,
        "year": year,
        "earnings": {
            "basic": float(emp.basic or 0),
            "house_rent": float(emp.house_rent or 0),
            "medical": float(emp.medical or 0),
            "conveyance": float(emp.conveyance or 0),
            "food_allowance": float(emp.food_allowance or 0),
            "wages": float(emp.wages or 0),
            "increment": float(emp.increment or 0),
            "mobile_bill": float(emp.mobile_bill or 0),
            "shift_benefit": float(emp.shift_benefit or 0),
        },
        "deductions": {},
        "net_payable": 0,
    }

    if p:
        payslip_data["earnings"]["ot_amount"] = float(p.ot_amount or 0)
        payslip_data["earnings"]["attendance_bonus"] = float(p.attendance_bonus or 0)
        payslip_data["earnings"]["arrear_others"] = float(p.arrear_others or 0)
        payslip_data["earnings"]["festival_duty_benefit"] = float(p.festival_duty_benefit or 0)
        payslip_data["earnings"]["festival_holiday_allowance"] = float(p.festival_holiday_allowance or 0)
        payslip_data["earnings"]["ifter_allowance"] = float(p.ifter_allowance or 0)
        payslip_data["earnings"]["special_food"] = float(p.special_food or 0)
        payslip_data["deductions"]["absent_deduction"] = float(p.absent_deduction or 0)
        payslip_data["deductions"]["advance_deduction"] = float(p.advance_deduction or 0)
        payslip_data["deductions"]["tax_deduction"] = float(p.tax_deduction or 0)
        payslip_data["net_payable"] = float(p.net_payable or 0)

    gross = sum(v for v in payslip_data["earnings"].values())
    total_ded = sum(v for v in payslip_data["deductions"].values())

    payslip_data["gross"] = gross
    payslip_data["total_deductions"] = total_ded
    if payslip_data["net_payable"] == 0:
        payslip_data["net_payable"] = gross - total_ded

    return payslip_data


@router.post("/reports/production")
async def generate_production_report(
    date_from: str = Query(...),
    date_to: str = Query(...),
    department: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("reports")),
):
    scope = await get_mill_scope(current_user)
    query = select(
        ProductionEntry.date,
        ProductionEntry.shift,
        ProductionEntry.department,
        ProductionEntry.machine_code,
        ProductionEntry.produced_kg,
        ProductionEntry.waste_kg,
        ProductionEntry.operator,
        ProductionEntry.status,
    ).where(
        ProductionEntry.date >= date_from,
        ProductionEntry.date <= date_to,
    )
    if department:
        query = query.where(ProductionEntry.department == department)
    query = query.order_by(ProductionEntry.date, ProductionEntry.shift)

    rows = await db.execute(query)
    data = [dict(r._mapping) for r in rows]

    total_produced = sum(r.get("produced_kg", 0) or 0 for r in data)
    total_waste = sum(r.get("waste_kg", 0) or 0 for r in data)

    return {
        "rows": data,
        "summary": {
            "total_produced": total_produced,
            "total_waste": total_waste,
            "total_entries": len(data),
        },
    }
