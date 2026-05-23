from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional

from app.db.session import get_db
from app.core.deps import get_current_user, require_module
from app.models.user import User
from app.models.payroll import PayrollMonth, PayslipEntry
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
    current_user: User = Depends(require_module("hr")),
):
    svc = PayrollService(db, current_user)
    return await svc.payroll_summary(mill_id, year)


@router.post("/payroll/months/process")
async def process_payroll(
    req: PayrollProcessRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
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
    current_user: User = Depends(require_module("hr", write=True)),
):
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
    current_user: User = Depends(require_module("hr", write=True)),
):
    svc = PayrollService(db, current_user)
    return await svc.mark_paid(payroll_month_id, user_id=current_user.id)


@router.get("/payroll/months/{payroll_month_id}/payslips")
async def get_payslips(
    payroll_month_id: str,
    department: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    svc = PayrollService(db, current_user)
    return await svc.get_payslips(payroll_month_id, department)


@router.get("/payroll/employees/{employee_id}/payslip")
async def get_employee_payslip(
    employee_id: str,
    month: int = Query(...),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    svc = PayrollService(db, current_user)
    return await svc.get_employee_payslip(employee_id, month, year)


@router.get("/payroll/summary")
async def payroll_summary(
    mill_id: str = Query(...),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    svc = PayrollService(db, current_user)
    return await svc.payroll_summary(mill_id, year)
