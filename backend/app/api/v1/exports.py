from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope, log_audit
from app.core.limiter import limiter
from app.models.user import User
from app.models.production import ProductionEntry, Machine
from app.models.dispatch import Dispatch
from app.models.accounts import Invoice, GSTEntry
from app.models.purchase import CottonPurchase
from app.models.quality import QualityTest
from app.models.maintenance import MaintenanceLog
from app.models.stores import SpareIssue
from app.models.inventory import Lot
from app.models.hr import Attendance, Employee
from app.services.production_service import ProductionService
from app.services.payroll_service import PayrollService
from app.services.pdf_export import production_report as pdf_production, payslip as pdf_payslip, dispatch_summary as pdf_dispatch
from app.services.excel_export import production_report as xlsx_production, payroll_report as xlsx_payroll, gst_report as xlsx_gst

router = APIRouter()


@router.get("/exports/production/pdf")
@limiter.limit("10/minute")
async def export_production_pdf(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    scope = await get_mill_scope(current_user, db)
    svc = ProductionService(db, current_user)
    stmt = select(ProductionEntry).order_by(ProductionEntry.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(ProductionEntry.mill_id == scope["mill_id"])
    if date_from:
        stmt = stmt.where(ProductionEntry.date >= date_from)
    if date_to:
        stmt = stmt.where(ProductionEntry.date <= date_to)
    result = await db.execute(stmt)
    entries = result.scalars().all()

    data = [
        {
            "date": e.date,
            "shift": e.shift,
            "machine": e.machine_code,
            "department": e.department,
            "operator": e.operator,
            "produced_kg": e.produced_kg,
            "waste_kg": e.waste_kg,
            "status": e.status,
        }
        for e in entries
    ]

    pdf_bytes = pdf_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "production", current_user.mill_id or "all", f"Exported production PDF ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=production_report_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"},
    )


@router.get("/exports/production/xlsx")
@limiter.limit("10/minute")
async def export_production_xlsx(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("production")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(ProductionEntry).order_by(ProductionEntry.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(ProductionEntry.mill_id == scope["mill_id"])
    if date_from:
        stmt = stmt.where(ProductionEntry.date >= date_from)
    if date_to:
        stmt = stmt.where(ProductionEntry.date <= date_to)
    result = await db.execute(stmt)
    entries = result.scalars().all()

    data = [
        {
            "date": e.date,
            "shift": e.shift,
            "machine": e.machine_code,
            "department": e.department,
            "operator": e.operator,
            "produced_kg": e.produced_kg,
            "waste_kg": e.waste_kg,
            "status": e.status,
        }
        for e in entries
    ]

    xlsx_buf = xlsx_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "production", current_user.mill_id or "all", f"Exported production XLSX ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([xlsx_buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=production_report_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"},
    )


@router.get("/exports/payroll/pdf")
@limiter.limit("10/minute")
async def export_payroll_pdf(
    request: Request,
    payroll_month_id: str = Query(...),
    employee_id: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll")),
):
    svc = PayrollService(db, current_user)
    if employee_id:
        emp_data = await svc.get_employee_payslip(employee_id, 0, 0)
        pdf_bytes = pdf_payslip(
            employee_name=emp_data.get("employee_name", ""),
            employee_code=emp_data.get("employee_code", ""),
            department=emp_data.get("department", ""),
            month=emp_data.get("month", 1),
            year=emp_data.get("year", 2026),
            data=emp_data,
        )
        filename = f"payslip_{emp_data.get('employee_code', 'emp')}_{emp_data.get('month', 1)}_{emp_data.get('year', 2026)}.pdf"
    else:
        slips = await svc.get_payslips(payroll_month_id)
        data = [
            {
                "employee_name": s.get("employee_name", ""),
                "employee_code": s.get("employee_code", ""),
                "department": s.get("department", ""),
                "gross_wage": s.get("gross_wage", 0),
                "net_wage": s.get("net_wage", 0),
                "pf_employee": s.get("pf_employee", 0),
                "esic_employee": s.get("esic_employee", 0),
            }
            for s in slips
        ]
        pdf_bytes = pdf_production(data, "Payroll Summary")
        filename = f"payroll_summary_{payroll_month_id[:8]}.pdf"

    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    detail = f"Exported payroll PDF ({payroll_month_id})"
    if employee_id:
        detail += f" employee={employee_id}"
    await log_audit(db, current_user.id, role_code, "export", "payroll", current_user.mill_id or "all", detail, ip_address=client_ip)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/exports/payroll/xlsx")
@limiter.limit("10/minute")
async def export_payroll_xlsx(
    request: Request,
    payroll_month_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll")),
):
    svc = PayrollService(db, current_user)
    slips = await svc.get_payslips(payroll_month_id)

    xlsx_buf = xlsx_payroll(slips)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "payroll", current_user.mill_id or "all", f"Exported payroll XLSX ({payroll_month_id})", ip_address=client_ip)
    return StreamingResponse(
        iter([xlsx_buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=payroll_{payroll_month_id[:8]}.xlsx"},
    )


@router.get("/exports/dispatch/pdf")
@limiter.limit("10/minute")
async def export_dispatch_pdf(
    request: Request,
    status: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Dispatch).order_by(Dispatch.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(Dispatch.mill_id == scope["mill_id"])
    if status:
        stmt = stmt.where(Dispatch.status == status)
    if date_from:
        stmt = stmt.where(Dispatch.date >= date_from)
    if date_to:
        stmt = stmt.where(Dispatch.date <= date_to)
    result = await db.execute(stmt)
    items = result.scalars().all()

    data = [
        {
            "dispatch_no": d.dispatch_no,
            "date": d.date,
            "customer": d.customer,
            "vehicle_no": d.vehicle_no or "",
            "quantity_kg": d.quantity_kg,
            "total_bags": d.total_bags,
            "status": d.status,
        }
        for d in items
    ]

    pdf_bytes = pdf_dispatch(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "dispatch", current_user.mill_id or "all", f"Exported dispatch PDF ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=dispatch_summary_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"},
    )


@router.get("/exports/gst/xlsx")
@limiter.limit("10/minute")
async def export_gst_xlsx(
    request: Request,
    month: int = Query(...),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("accounts")),
):
    scope = await get_mill_scope(current_user, db)
    date_prefix = f"{year}-{month:02d}"

    output = await db.execute(
        select(
            func.coalesce(func.sum(GSTEntry.cgst), 0),
            func.coalesce(func.sum(GSTEntry.sgst), 0),
            func.coalesce(func.sum(GSTEntry.igst), 0),
        )
        .select_from(GSTEntry)
        .join(Invoice, GSTEntry.invoice_id == Invoice.id)
        .where(and_(Invoice.status != "cancelled", Invoice.date.like(f"{date_prefix}%")))
    )
    cgst, sgst, igst = output.one()
    output_gst = {"cgst": float(cgst or 0), "sgst": float(sgst or 0), "igst": float(igst or 0), "total": float(cgst or 0) + float(sgst or 0) + float(igst or 0)}

    input_stmt = select(func.coalesce(func.sum(CottonPurchase.gst_amount), 0))
    if scope.get("mill_id"):
        input_stmt = input_stmt.where(CottonPurchase.mill_id == scope["mill_id"])
    input_r = await db.execute(input_stmt.where(CottonPurchase.date.like(f"{date_prefix}%")))
    input_gst_total = float(input_r.scalar() or 0)
    input_gst = {"total": input_gst_total}

    net_payable = round(output_gst["total"] - input_gst_total, 2)

    xlsx_buf = xlsx_gst(output_gst, input_gst, net_payable, month, year)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "gst", current_user.mill_id or "all", f"Exported GST XLSX ({year}-{month:02d})", ip_address=client_ip)
    return StreamingResponse(
        iter([xlsx_buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=gst_{year}_{month:02d}.xlsx"},
    )


# ── Quality ──────────────────────────────────────────────────────────────────

@router.get("/exports/quality/xlsx")
@limiter.limit("10/minute")
async def export_quality_xlsx(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(QualityTest).join(Lot, QualityTest.lot_id == Lot.id, isouter=True).order_by(QualityTest.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(Lot.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        from app.models.masters import Mill
        stmt = stmt.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date_from:
        stmt = stmt.where(QualityTest.date >= date_from)
    if date_to:
        stmt = stmt.where(QualityTest.date <= date_to)
    result = await db.execute(stmt)
    items = result.scalars().all()

    data = [
        {
            "Date": t.date,
            "Type": t.type,
            "Lot No": t.lot_no or "",
            "Machine": t.machine_code or "",
            "Sample Ref": t.sample_ref or "",
            "Result": t.result,
            "Unit": t.unit or "",
            "Standard": t.standard,
            "U%": t.u_percent or "",
            "CSP": t.csp or "",
            "Status": t.status,
            "Tested By": t.tested_by or "",
        }
        for t in items
    ]
    buf = xlsx_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "quality", current_user.mill_id or "all", f"Exported quality XLSX ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=quality_tests_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"},
    )


# ── Maintenance ───────────────────────────────────────────────────────────────

@router.get("/exports/maintenance/xlsx")
@limiter.limit("10/minute")
async def export_maintenance_xlsx(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("maintenance")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(MaintenanceLog).join(Machine, MaintenanceLog.machine_code == Machine.code, isouter=True).order_by(MaintenanceLog.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(Machine.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        from app.models.masters import Mill
        stmt = stmt.join(Mill, Machine.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date_from:
        stmt = stmt.where(MaintenanceLog.date >= date_from)
    if date_to:
        stmt = stmt.where(MaintenanceLog.date <= date_to)
    result = await db.execute(stmt)
    items = result.scalars().all()

    data = [
        {
            "Date": m.date,
            "Type": m.type,
            "Machine": m.machine_code,
            "Department": m.department or "",
            "Description": m.description,
            "Technician": m.technician_name or "",
            "Status": m.status,
            "Downtime (min)": m.downtime_min,
            "Cost": m.cost,
            "Spare Used": m.spare_used or "",
        }
        for m in items
    ]
    buf = xlsx_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "maintenance", current_user.mill_id or "all", f"Exported maintenance XLSX ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=maintenance_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"},
    )


# ── Purchase ──────────────────────────────────────────────────────────────────

@router.get("/exports/purchase/xlsx")
@limiter.limit("10/minute")
async def export_purchase_xlsx(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("purchase")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(CottonPurchase).order_by(CottonPurchase.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(CottonPurchase.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        from app.models.masters import Mill
        stmt = stmt.join(Mill, CottonPurchase.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date_from:
        stmt = stmt.where(CottonPurchase.date >= date_from)
    if date_to:
        stmt = stmt.where(CottonPurchase.date <= date_to)
    result = await db.execute(stmt)
    items = result.scalars().all()

    data = [
        {
            "Date": p.date,
            "Invoice No": p.invoice_no,
            "Supplier": p.supplier_name or "",
            "Bales": p.bales,
            "Gross (kg)": p.gross_kg,
            "Net (kg)": p.net_kg,
            "Rate/kg": p.rate_per_kg,
            "Status": p.status,
        }
        for p in items
    ]
    buf = xlsx_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "purchase", current_user.mill_id or "all", f"Exported purchase XLSX ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=purchase_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"},
    )


# ── Dispatch XLSX (date-range) ────────────────────────────────────────────────

@router.get("/exports/dispatch/xlsx")
@limiter.limit("10/minute")
async def export_dispatch_xlsx(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Dispatch).order_by(Dispatch.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(Dispatch.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        from app.models.masters import Mill
        stmt = stmt.join(Mill, Dispatch.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date_from:
        stmt = stmt.where(Dispatch.date >= date_from)
    if date_to:
        stmt = stmt.where(Dispatch.date <= date_to)
    result = await db.execute(stmt)
    items = result.scalars().all()

    data = [
        {
            "Dispatch No": d.dispatch_no,
            "Date": d.date,
            "Customer": d.customer,
            "Vehicle No": d.vehicle_no or "",
            "Quantity (kg)": d.quantity_kg,
            "Total Bags": d.total_bags,
            "Status": d.status,
        }
        for d in items
    ]
    buf = xlsx_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "dispatch", current_user.mill_id or "all", f"Exported dispatch XLSX ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=dispatch_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"},
    )


# ── Stores (Spare Issues) ─────────────────────────────────────────────────────

@router.get("/exports/stores/xlsx")
@limiter.limit("10/minute")
async def export_stores_xlsx(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(SpareIssue).order_by(SpareIssue.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(SpareIssue.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        from app.models.masters import Mill
        stmt = stmt.join(Mill, SpareIssue.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date_from:
        stmt = stmt.where(SpareIssue.date >= date_from)
    if date_to:
        stmt = stmt.where(SpareIssue.date <= date_to)
    result = await db.execute(stmt)
    items = result.scalars().all()

    data = [
        {
            "Date": i.date,
            "Spare Code": i.spare_code or "",
            "Spare Name": i.spare_name or "",
            "Quantity": i.quantity,
            "Issued To": i.issued_to or "",
            "Department": i.department or "",
            "Purpose": i.purpose or "",
            "Issued By": i.issued_by or "",
        }
        for i in items
    ]
    buf = xlsx_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "stores", current_user.mill_id or "all", f"Exported stores XLSX ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=spare_issues_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"},
    )


# ── Inventory (Lots) ──────────────────────────────────────────────────────────

@router.get("/exports/inventory/xlsx")
@limiter.limit("10/minute")
async def export_inventory_xlsx(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("inventory")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Lot).order_by(Lot.produced_date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(Lot.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        from app.models.masters import Mill
        stmt = stmt.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date_from:
        stmt = stmt.where(Lot.produced_date >= date_from)
    if date_to:
        stmt = stmt.where(Lot.produced_date <= date_to)
    result = await db.execute(stmt)
    items = result.scalars().all()

    data = [
        {
            "Lot No": l.lot_no,
            "Type": l.type,
            "Quantity (kg)": l.quantity,
            "Location": l.location or "",
            "Grade": l.grade or "",
            "Produced Date": l.produced_date or "",
            "Status": l.status,
        }
        for l in items
    ]
    buf = xlsx_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "inventory", current_user.mill_id or "all", f"Exported inventory XLSX ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=inventory_lots_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"},
    )


# ── Attendance ────────────────────────────────────────────────────────────────

@router.get("/exports/attendance/xlsx")
@limiter.limit("10/minute")
async def export_attendance_xlsx(
    request: Request,
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Attendance).join(Employee, Attendance.employee_id == Employee.id).order_by(Attendance.date.desc())
    if scope.get("mill_id"):
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope.get("company_id"):
        from app.models.masters import Mill
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date_from:
        stmt = stmt.where(Attendance.date >= date_from)
    if date_to:
        stmt = stmt.where(Attendance.date <= date_to)
    result = await db.execute(stmt)
    items = result.scalars().all()

    data = [
        {
            "Date": a.date,
            "Employee Name": a.employee_name or "",
            "Department": a.department or "",
            "Shift": a.shift,
            "Status": a.status,
            "Check In": a.check_in or "",
            "Check Out": a.check_out or "",
            "OT Hours": a.overtime_hours,
        }
        for a in items
    ]
    buf = xlsx_production(data)
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "export", "attendance", current_user.mill_id or "all", f"Exported attendance XLSX ({date_from}–{date_to})", ip_address=client_ip)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=attendance_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"},
    )
