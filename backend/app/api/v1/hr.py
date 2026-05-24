from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timezone, date as date_type

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, log_audit, get_mill_scope
from app.models.user import User
from app.models.hr import Employee, Attendance, Leave
from app.models.masters import Mill
from app.schemas.hr import (
    EmployeeCreate, EmployeeOut, EmployeeUpdate,
    AttendanceCreate, AttendanceOut, AttendanceBulkCreate, AttendanceSummary,
    LeaveRequestCreate, LeaveRequestOut, LeaveActionRequest,
    EmployeeBulkCreate, EmployeeBulkResponse,
)

router = APIRouter()


@router.get("/hr/employees")
async def get_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Employee)
    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
        "data": items,
    }


@router.post("/hr/employees", response_model=EmployeeOut)
async def create_employee(
    req: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    emp = Employee(
        code=req.employee_code,
        name=req.full_name,
        department=req.department,
        role=req.designation,
        shift=req.shift,
        phone=req.phone,
        doj=req.date_of_joining.isoformat() if req.date_of_joining else None,
        daily_wage=req.daily_wage or 0.0,
        is_active=True,
    )
    db.add(emp)
    await db.flush()
    return emp


@router.post("/hr/employees/bulk", response_model=EmployeeBulkResponse)
async def bulk_create_employees(
    req: EmployeeBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    _SHIFT_MAP = {"General": "G", "A": "A", "B": "B", "C": "C", "G": "G"}
    employees_to_add: List[Employee] = []
    errors: List[str] = []
    for i, item in enumerate(req.items, start=1):
        row_label = f"Row {i} ({item.employee_code or 'no code'})"
        if not item.employee_code or not item.full_name or not item.department:
            errors.append(f"{row_label}: missing required field (code, name, or department)")
            continue
        shift = _SHIFT_MAP.get(item.shift, None)
        if not shift:
            errors.append(f"{row_label}: invalid shift '{item.shift}', must be A/B/C/General")
            continue
        doj_str = None
        if item.date_of_joining:
            try:
                from datetime import datetime as dt
                doj_str = dt.strptime(item.date_of_joining.strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
            except ValueError:
                errors.append(f"{row_label}: invalid date format '{item.date_of_joining}', expected DD/MM/YYYY")
                continue
        employees_to_add.append(Employee(
            code=item.employee_code.strip(),
            name=item.full_name.strip(),
            department=item.department.strip(),
            role=item.designation.strip() if item.designation else None,
            shift=shift,
            doj=doj_str,
            phone=item.phone.strip() if item.phone else None,
            daily_wage=item.daily_wage or 0.0,
            is_active=True,
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


@router.get("/hr/attendance")
async def get_attendance(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Attendance).join(Employee, Attendance.employee_id == Employee.id).order_by(Attendance.date.desc())
    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
        "data": items,
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


@router.get("/hr/leaves")
async def get_leaves(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Leave).join(Employee, Leave.employee_id == Employee.id).order_by(Leave.created_at.desc())
    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
        "data": items,
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
