import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.payroll import PayrollMonth, PayslipEntry
from app.models.hr import Employee
from app.models.masters import Mill
from app.schemas.payroll import (
    PayrollProcessRequest, PayrollMonthOut, PayslipOut, PayrollSummaryRow,
)
from app.services.payroll_service import PayrollService

router = APIRouter()


@router.get("/payroll/months")
async def get_payroll_months(
    mill_id: str = Query(...),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll")),
):
    scope = await get_mill_scope(current_user, db)
    if scope["mill_id"]:
        mill_id = scope["mill_id"]
    elif scope["company_id"]:
        mills_result = await db.execute(select(Mill.id).where(Mill.company_id == scope["company_id"]))
        mill_ids = mills_result.scalars().all()
        if mill_ids:
            mill_id = mill_ids[0]
    try:
        svc = PayrollService(db, current_user)
        return await svc.payroll_summary(mill_id, year)
    except Exception as e:
        logger.error(f"payroll.months list error: {e}")
        return {"total": 0, "page": 1, "page_size": 20, "pages": 0, "data": []}


@router.post("/payroll/months/process")
async def process_payroll(
    req: PayrollProcessRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        mill_check = await db.execute(
            select(Mill).where(
                Mill.id == req.mill_id,
                Mill.company_id == current_user.company_id,
            )
        )
        if not mill_check.scalar_one_or_none():
            raise HTTPException(403, "Cannot process payroll for this mill")

    svc = PayrollService(db, current_user)
    return await svc.process_payroll(
        req.mill_id,
        req.month,
        req.year,
        processor_id=current_user.id,
        processor_role=current_user.role_rel.code if current_user.role_rel else "UNKNOWN",
    )


@router.post("/payroll/months/{payroll_month_id}/approve")
async def approve_payroll(
    payroll_month_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    pm = await db.get(PayrollMonth, payroll_month_id)
    if pm:
        if scope.get("mill_id") and pm.mill_id != scope["mill_id"]:
            raise HTTPException(404, "Payroll month not found")
        elif scope.get("company_id"):
            mill_row = await db.get(Mill, pm.mill_id)
            if not mill_row or str(mill_row.company_id) != scope["company_id"]:
                raise HTTPException(404, "Payroll month not found")

    svc = PayrollService(db, current_user)
    return await svc.approve_payroll(
        payroll_month_id,
        approver_id=current_user.id,
        approver_role=current_user.role_rel.code if current_user.role_rel else "UNKNOWN",
    )


@router.post("/payroll/months/{payroll_month_id}/mark-paid")
async def mark_paid(
    payroll_month_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    pm = await db.get(PayrollMonth, payroll_month_id)
    if pm:
        if scope.get("mill_id") and pm.mill_id != scope["mill_id"]:
            raise HTTPException(404, "Payroll month not found")
        elif scope.get("company_id"):
            mill_row = await db.get(Mill, pm.mill_id)
            if not mill_row or str(mill_row.company_id) != scope["company_id"]:
                raise HTTPException(404, "Payroll month not found")

    svc = PayrollService(db, current_user)
    return await svc.mark_paid(payroll_month_id, user_id=current_user.id)


@router.get("/payroll/months/{payroll_month_id}/payslips")
async def get_payslips(
    payroll_month_id: str,
    department: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll")),
):
    scope = await get_mill_scope(current_user, db)
    pm = await db.get(PayrollMonth, payroll_month_id)
    if pm:
        if scope["mill_id"] and pm.mill_id != scope["mill_id"]:
            raise HTTPException(status_code=404, detail="Payroll month not found")
        elif scope["company_id"]:
            mill = await db.get(Mill, pm.mill_id)
            if not mill or mill.company_id != scope["company_id"]:
                raise HTTPException(status_code=404, detail="Payroll month not found")
    try:
        svc = PayrollService(db, current_user)
        return await svc.get_payslips(payroll_month_id, department)
    except Exception as e:
        logger.error(f"payroll.payslips list error: {e}")
        return []


@router.get("/payroll/employees/{employee_id}/payslip")
async def get_employee_payslip(
    employee_id: str,
    month: int = Query(...),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll")),
):
    scope = await get_mill_scope(current_user, db)
    if scope["mill_id"]:
        emp = await db.get(Employee, employee_id)
        if emp and emp.mill_id != scope["mill_id"]:
            raise HTTPException(status_code=404, detail="Employee not found")
    elif scope["company_id"]:
        emp = await db.get(Employee, employee_id)
        if emp:
            mill = await db.get(Mill, emp.mill_id)
            if not mill or mill.company_id != scope["company_id"]:
                raise HTTPException(status_code=404, detail="Employee not found")
    svc = PayrollService(db, current_user)
    return await svc.get_employee_payslip(employee_id, month, year)


@router.get("/payroll/summary")
async def payroll_summary(
    mill_id: str = Query(...),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("payroll")),
):
    scope = await get_mill_scope(current_user, db)
    if scope["mill_id"]:
        mill_id = scope["mill_id"]
    elif scope["company_id"]:
        mills_result = await db.execute(select(Mill.id).where(Mill.company_id == scope["company_id"]))
        mill_ids = mills_result.scalars().all()
        if mill_ids:
            mill_id = mill_ids[0]
    svc = PayrollService(db, current_user)
    return await svc.payroll_summary(mill_id, year)
