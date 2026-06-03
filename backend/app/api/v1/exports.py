from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope, log_audit
from app.core.limiter import limiter
from app.models.user import User
from app.models.production import ProductionEntry
from app.models.dispatch import Dispatch
from app.models.accounts import Invoice, GSTEntry
from app.models.purchase import CottonPurchase
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
    scope = await get_mill_scope(current_user)
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
    scope = await get_mill_scope(current_user)
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
    scope = await get_mill_scope(current_user)
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
    scope = await get_mill_scope(current_user)
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
