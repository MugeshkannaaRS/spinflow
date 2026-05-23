from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timezone, date as date_type

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, log_audit
from app.models.user import User
from app.models.hr import Employee, Attendance, Leave
from app.schemas.hr import (
    EmployeeCreate, EmployeeOut, EmployeeUpdate,
    AttendanceCreate, AttendanceOut, AttendanceBulkCreate, AttendanceSummary,
    LeaveRequestCreate, LeaveRequestOut, LeaveActionRequest,
)

router = APIRouter()


@router.get("/hr/employees")
async def get_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    stmt = select(Employee)
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


@router.get("/hr/attendance")
async def get_attendance(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    stmt = select(Attendance).order_by(Attendance.date.desc())
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
    stmt = select(Leave).order_by(Leave.created_at.desc())
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
