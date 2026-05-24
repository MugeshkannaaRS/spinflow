from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, date as date_type
from pydantic import BaseModel
from decimal import Decimal


class AttendanceImportRequest(BaseModel):
    items: List[Dict[str, Any]]

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, log_audit, get_mill_scope
from app.models.user import User
from app.models.hr import Employee, Attendance, Leave, MonthlyPayroll
from app.models.masters import Mill
from app.schemas.hr import (
    EmployeeCreate, EmployeeOut, EmployeeUpdate,
    AttendanceCreate, AttendanceOut, AttendanceBulkCreate, AttendanceSummary,
    LeaveRequestCreate, LeaveRequestOut, LeaveActionRequest,
    EmployeeBulkCreate, EmployeeBulkResponse,
    MonthlyPayrollCreate, MonthlyPayrollOut, MonthlyPayrollUpdate,
    MonthlyPayrollListResponse, PayrollCalculateRequest, PayrollFinalizeRequest,
)

router = APIRouter()


# ── Employees ──────────────────────────────────────────────────────────────


@router.get("/hr/employees")
async def get_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    department: Optional[str] = Query(None),
    grade: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Employee)

    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])

    if department:
        stmt = stmt.where(Employee.department == department)
    if grade:
        stmt = stmt.where(Employee.grade == grade)
    if status == "active":
        stmt = stmt.where(Employee.is_active == True)
    elif status == "inactive":
        stmt = stmt.where(Employee.is_active == False)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                Employee.name.ilike(pattern),
                Employee.code.ilike(pattern),
                Employee.phone.ilike(pattern),
                Employee.department.ilike(pattern),
                Employee.designation.ilike(pattern),
            )
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": [EmployeeOut.model_validate(e).model_dump() for e in items],
    }


@router.post("/hr/employees", response_model=EmployeeOut)
async def create_employee(
    req: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    scope = await get_mill_scope(current_user)
    mill_id = req.mill_id or scope["mill_id"]

    total_sal = req.total_salary
    if total_sal is None:
        total_sal = (req.basic or 0) + (req.house_rent or 0) + (req.medical or 0) + (req.conveyance or 0) + (req.food_allowance or 0) + (req.wages or 0) + (req.increment or 0) + (req.mobile_bill or 0) + (req.shift_benefit or 0)

    emp = Employee(
        code=req.employee_code,
        name=req.full_name,
        sl_no=req.sl_no,
        employee_id=req.employee_id,
        department=req.department,
        designation=req.designation,
        section=req.section,
        department_name=req.department_name,
        shift=req.shift,
        joining_date=req.date_of_joining,
        dob=req.dob,
        gender=req.gender,
        grade=req.grade,
        bank_account_no=req.bank_account_no,
        basic=req.basic or 0,
        house_rent=req.house_rent or 0,
        medical=req.medical or 0,
        conveyance=req.conveyance or 0,
        food_allowance=req.food_allowance or 0,
        wages=req.wages or 0,
        increment=req.increment or 0,
        total_salary=total_sal,
        mobile_bill=req.mobile_bill or 0,
        shift_benefit=req.shift_benefit or 0,
        days_of_month=req.days_of_month or 26,
        phone=req.phone,
        is_active=True,
        mill_id=mill_id,
    )
    db.add(emp)
    await db.flush()
    return emp


@router.put("/hr/employees/{employee_id}", response_model=EmployeeOut)
async def update_employee(
    employee_id: str,
    req: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Employee).where(Employee.id == employee_id)
    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    update_data = req.model_dump(exclude_unset=True)
    field_map = {
        "full_name": "name",
    }
    for schema_key, value in update_data.items():
        if schema_key == "full_name":
            emp.name = value
        elif hasattr(emp, schema_key):
            setattr(emp, schema_key, value)

    if any(k in update_data for k in ("basic", "house_rent", "medical", "conveyance", "food_allowance", "wages", "increment", "mobile_bill", "shift_benefit")):
        emp.total_salary = float(
            (emp.basic or 0) + (emp.house_rent or 0) + (emp.medical or 0)
            + (emp.conveyance or 0) + (emp.food_allowance or 0) + (emp.wages or 0)
            + (emp.increment or 0) + (emp.mobile_bill or 0) + (emp.shift_benefit or 0)
        )

    await db.flush()
    return emp


@router.delete("/hr/employees/{employee_id}")
async def delete_employee(
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Employee).where(Employee.id == employee_id)
    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    emp.is_active = False
    await db.flush()
    return {"message": "Employee deactivated", "id": employee_id}


@router.post("/hr/employees/bulk", response_model=EmployeeBulkResponse)
async def bulk_create_employees(
    req: EmployeeBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    scope = await get_mill_scope(current_user)
    mill_id = scope["mill_id"]

    employees_to_add: List[Employee] = []
    errors: List[str] = []
    for i, item in enumerate(req.items, start=1):
        row_label = f"Row {i} ({item.employee_code or 'no code'})"
        if not item.employee_code or not item.full_name or not item.department:
            errors.append(f"{row_label}: missing required field (code, name, or department)")
            continue

        doj = None
        if item.date_of_joining:
            try:
                from datetime import datetime as dt
                doj = dt.strptime(item.date_of_joining.strip(), "%d/%m/%Y").date()
            except ValueError:
                errors.append(f"{row_label}: invalid date format '{item.date_of_joining}', expected DD/MM/YYYY")
                continue

        total_sal = (item.wages or 0) + (item.basic or 0) + (item.house_rent or 0) + (item.medical or 0) + (item.conveyance or 0) + (item.food_allowance or 0)

        employees_to_add.append(Employee(
            code=item.employee_code.strip(),
            name=item.full_name.strip(),
            department=item.department.strip(),
            designation=item.designation.strip() if item.designation else None,
            shift=item.shift,
            joining_date=doj,
            phone=item.phone.strip() if item.phone else None,
            gender=item.gender,
            grade=item.grade,
            wages=item.wages or 0,
            basic=item.basic or 0,
            house_rent=item.house_rent or 0,
            medical=item.medical or 0,
            conveyance=item.conveyance or 0,
            food_allowance=item.food_allowance or 0,
            total_salary=total_sal,
            is_active=True,
            mill_id=mill_id,
        ))

    if errors:
        return EmployeeBulkResponse(created=0, errors=errors)

    for emp in employees_to_add:
        db.add(emp)
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        return EmployeeBulkResponse(created=0, errors=[f"Database error: {str(exc)}"])
    return EmployeeBulkResponse(created=len(employees_to_add), errors=[])


# ── Payroll ────────────────────────────────────────────────────────────────


@router.get("/hr/payroll")
async def get_payroll(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020),
    mill_id: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user)
    effective_mill = mill_id or scope["mill_id"]
    if not effective_mill:
        raise HTTPException(400, "mill_id is required")

    stmt = select(MonthlyPayroll).where(
        MonthlyPayroll.mill_id == effective_mill,
        MonthlyPayroll.month == month,
        MonthlyPayroll.year == year,
    )
    if employee_id:
        stmt = stmt.where(MonthlyPayroll.employee_id == employee_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": [MonthlyPayrollOut.model_validate(m).model_dump() for m in items],
    }


@router.post("/hr/payroll/calculate")
async def calculate_payroll(
    req: PayrollCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    scope = await get_mill_scope(current_user)

    existing = await db.execute(
        select(MonthlyPayroll).where(
            MonthlyPayroll.mill_id == req.mill_id,
            MonthlyPayroll.month == req.month,
            MonthlyPayroll.year == req.year,
            MonthlyPayroll.is_finalized == True,
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Payroll already finalized for this month")

    emp_result = await db.execute(
        select(Employee).where(
            Employee.mill_id == req.mill_id,
            Employee.is_active == True,
        )
    )
    employees = emp_result.scalars().all()

    created_count = 0
    for emp in employees:
        existing_row = await db.execute(
            select(MonthlyPayroll).where(
                MonthlyPayroll.employee_id == emp.id,
                MonthlyPayroll.month == req.month,
                MonthlyPayroll.year == req.year,
            )
        )
        payroll = existing_row.scalar_one_or_none()
        if not payroll:
            payroll = MonthlyPayroll(
                employee_id=emp.id,
                mill_id=req.mill_id,
                month=req.month,
                year=req.year,
            )
            db.add(payroll)

        payroll.days_of_month = emp.days_of_month or 26
        payroll.payable_salary = float(emp.wages or 0) / max(payroll.days_of_month, 1) * float(payroll.payable_days or payroll.days_of_month)
        payroll.net_payable = (
            payroll.payable_salary
            + float(payroll.ot_amount)
            + float(payroll.attendance_bonus)
            + float(payroll.arrear_others)
            + float(payroll.shift_amount)
            + float(payroll.roster_amount)
            + float(payroll.festival_duty_benefit)
            + float(payroll.festival_holiday_allowance)
            + float(payroll.ifter_allowance)
            + float(payroll.special_food)
            + float(emp.mobile_bill or 0)
            - float(payroll.absent_deduction)
            - float(payroll.advance_deduction)
            - float(payroll.tax_deduction)
        )
        created_count += 1

    await db.flush()
    return {"message": f"Payroll calculated for {created_count} employees", "count": created_count}


@router.put("/hr/payroll/{payroll_id}", response_model=MonthlyPayrollOut)
async def update_payroll_row(
    payroll_id: str,
    req: MonthlyPayrollUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    result = await db.execute(select(MonthlyPayroll).where(MonthlyPayroll.id == payroll_id))
    payroll = result.scalar_one_or_none()
    if not payroll:
        raise HTTPException(404, "Payroll record not found")

    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(payroll, key, value)

    await db.flush()
    return payroll


@router.post("/hr/payroll/finalize")
async def finalize_payroll(
    req: PayrollFinalizeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    result = await db.execute(
        select(MonthlyPayroll).where(
            MonthlyPayroll.mill_id == req.mill_id,
            MonthlyPayroll.month == req.month,
            MonthlyPayroll.year == req.year,
        )
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(404, "No payroll records found for this period")

    for row in rows:
        row.is_finalized = True

    await db.flush()
    return {"message": f"Payroll finalized for {len(rows)} employees", "count": len(rows)}


# ── Attendance ──────────────────────────────────────────────────────────────


@router.get("/hr/attendance")
async def get_attendance(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    date: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Attendance).join(Employee, Attendance.employee_id == Employee.id).order_by(Attendance.date.desc())
    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date:
        stmt = stmt.where(Attendance.date == date)
    if employee_id:
        stmt = stmt.where(Attendance.employee_id == employee_id)
    if department:
        stmt = stmt.where(Employee.department == department)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": [AttendanceOut.model_validate(a).model_dump() for a in items],
    }


@router.get("/hr/attendance/summary")
async def get_attendance_summary(
    date: Optional[str] = Query(None),
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user)
    emp_stmt = select(Employee)
    if scope["mill_id"]:
        emp_stmt = emp_stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        emp_stmt = emp_stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    emp_result = await db.execute(emp_stmt)
    total_employees = len(emp_result.scalars().all())

    att_stmt = select(Attendance)
    if date:
        att_stmt = att_stmt.where(Attendance.date == date)
    elif month and year:
        date_pattern = f"{year}-{month:02d}-%"
        att_stmt = att_stmt.where(Attendance.date.like(date_pattern))

    att_result = await db.execute(att_stmt)
    records = att_result.scalars().all()
    present = sum(1 for r in records if r.status == "present")
    absent = sum(1 for r in records if r.status == "absent")
    on_leave = sum(1 for r in records if r.status in ("leave", "half-day"))
    ot_hours = sum(float(r.overtime_hours or 0) for r in records)
    return {
        "date": date,
        "total_employees": total_employees,
        "present": present,
        "absent": absent,
        "on_leave": on_leave,
        "ot_hours": ot_hours,
    }


@router.post("/hr/attendance", response_model=AttendanceOut)
async def create_attendance(
    req: AttendanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    emp = await db.get(Employee, req.employee_id)
    att = Attendance(
        date=req.attendance_date.isoformat(),
        employee_id=req.employee_id,
        employee_name=emp.name if emp else None,
        department=emp.department if emp else None,
        shift="General",
        status=req.status.replace("_", "-"),
        check_in=req.in_time,
        check_out=req.out_time,
        overtime_hours=req.overtime_hours,
    )
    db.add(att)
    await db.flush()
    return att


@router.post("/hr/attendance/bulk", response_model=List[AttendanceOut])
async def create_bulk_attendance(
    req: AttendanceBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    records = []
    for rec in req.records:
        emp = await db.get(Employee, rec.employee_id)
        att = Attendance(
            date=req.attendance_date.isoformat(),
            employee_id=rec.employee_id,
            employee_name=emp.name if emp else None,
            department=emp.department if emp else None,
            shift="General",
            status=rec.status.replace("_", "-"),
            check_in=rec.in_time,
            check_out=rec.out_time,
            overtime_hours=rec.overtime_hours,
        )
        db.add(att)
        records.append(att)
    await db.flush()
    return records


@router.post("/hr/attendance/bulk-import")
async def bulk_import_attendance(
    req: AttendanceImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    STATUS_MAP = {"p": "present", "a": "absent", "h": "holiday", "l": "leave",
                  "present": "present", "absent": "absent", "holiday": "holiday", "leave": "leave"}
    created = 0
    skipped = 0
    errors: List[str] = []
    for i, row in enumerate(req.items):
        try:
            emp_code = str(row.get("employee_code") or "").strip()
            date_str = str(row.get("date") or "").strip()
            status_raw = str(row.get("status") or "").strip().lower()
            if not emp_code or not date_str or not status_raw:
                skipped += 1
                errors.append(f"Row {i + 1}: missing employee_code, date, or status")
                continue
            norm_status = STATUS_MAP.get(status_raw)
            if not norm_status:
                skipped += 1
                errors.append(f"Row {i + 1}: unknown status '{status_raw}'")
                continue
            emp_result = await db.execute(select(Employee).where(Employee.code == emp_code))
            emp = emp_result.scalar_one_or_none()
            if not emp:
                skipped += 1
                errors.append(f"Row {i + 1}: employee '{emp_code}' not found")
                continue
            if "/" in date_str:
                parts = date_str.split("/")
                date_str = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
            att = Attendance(
                date=date_str,
                employee_id=emp.id,
                employee_name=emp.name,
                department=emp.department,
                shift="General",
                status=norm_status,
            )
            db.add(att)
            created += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Row {i + 1}: {str(e)}")
    await db.flush()
    return {"created": created, "skipped": skipped, "errors": errors}


@router.patch("/hr/attendance/{attendance_id}", response_model=AttendanceOut)
async def update_attendance(
    attendance_id: str,
    req: AttendanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    result = await db.execute(select(Attendance).where(Attendance.id == attendance_id))
    att = result.scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance not found")
    emp = await db.get(Employee, req.employee_id)
    att.date = req.attendance_date.isoformat()
    att.employee_id = req.employee_id
    att.employee_name = emp.name if emp else att.employee_name
    att.department = emp.department if emp else att.department
    att.status = req.status.replace("_", "-")
    att.check_in = req.in_time
    att.check_out = req.out_time
    att.overtime_hours = req.overtime_hours
    await db.flush()
    return att


# ── Leaves ──────────────────────────────────────────────────────────────────


@router.get("/hr/leaves")
async def get_leaves(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    employee_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Leave).join(Employee, Leave.employee_id == Employee.id).order_by(Leave.created_at.desc())
    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if employee_id:
        stmt = stmt.where(Leave.employee_id == employee_id)
    if status:
        stmt = stmt.where(Leave.status == status)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": [LeaveRequestOut.model_validate(l).model_dump() for l in items],
    }


@router.post("/hr/leaves", response_model=LeaveRequestOut)
async def create_leave(
    req: LeaveRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    emp = await db.get(Employee, req.employee_id)
    leave = Leave(
        employee_id=req.employee_id,
        employee_name=emp.name if emp else None,
        department=emp.department if emp else None,
        from_date=req.from_date.isoformat(),
        to_date=req.to_date.isoformat(),
        type=req.leave_type,
        reason=req.reason,
        status="pending",
    )
    db.add(leave)
    await db.flush()
    return leave


@router.put("/hr/leaves/{leave_id}/action", response_model=LeaveRequestOut)
async def approve_or_reject_leave(
    leave_id: str,
    req: LeaveActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    result = await db.execute(select(Leave).where(Leave.id == leave_id))
    leave = result.scalar_one_or_none()
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave not found")
    leave.status = req.action
    leave.approved_by = req.approved_by
    leave.approved_at = datetime.now(timezone.utc)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, req.action, "Leave", leave.id,
                    f"Leave {req.action} for {leave.employee_id}")
    return leave
