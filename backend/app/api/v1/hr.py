import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, asc, desc
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, date as date_type
from pydantic import BaseModel
from decimal import Decimal

logger = logging.getLogger(__name__)


class AttendanceImportRequest(BaseModel):
    items: List[Dict[str, Any]]

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, log_audit, get_mill_scope
from app.models.user import User
from app.models.hr import Employee, Attendance, Leave, MonthlyPayroll, EmployeeCustomField, EmployeeCustomValue
from app.models.masters import Mill, Department, Company
from app.schemas.hr import (
    EmployeeCreate, EmployeeOut, EmployeeUpdate,
    AttendanceCreate, AttendanceOut, AttendanceBulkCreate, AttendanceSummary,
    LeaveRequestCreate, LeaveRequestOut, LeaveActionRequest,
    EmployeeBulkCreate, EmployeeBulkResponse, ImportErrorDetail,
    PayrollBulkCreate, PayrollBulkResponse,
    MonthlyPayrollCreate, MonthlyPayrollOut, MonthlyPayrollUpdate,
    MonthlyPayrollListResponse, PayrollCalculateRequest, PayrollFinalizeRequest,
    CustomFieldOut, EmployeeDetailOut, CustomValueOut,
)

router = APIRouter()


# ── Employees ──────────────────────────────────────────────────────────────


SORTABLE_EMPLOYEE_COLUMNS = {
    "name": Employee.name,
    "code": Employee.code,
    "department": Employee.department,
    "designation": Employee.designation,
    "grade": Employee.grade,
    "section": Employee.section,
    "shift": Employee.shift,
    "basic": Employee.basic,
    "wages": Employee.wages,
    "total_salary": Employee.total_salary,
    "house_rent": Employee.house_rent,
    "medical": Employee.medical,
    "conveyance": Employee.conveyance,
    "food_allowance": Employee.food_allowance,
    "mobile_bill": Employee.mobile_bill,
    "joining_date": Employee.joining_date,
    "dob": Employee.dob,
    "sl_no": Employee.sl_no,
    "is_active": Employee.is_active,
    "created_at": Employee.created_at,
}


@router.get("/hr/employees")
async def get_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    department: Optional[str] = Query(None),
    grade: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_dir: Optional[str] = Query("asc"),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    # SUPER_ADMIN can query any mill; MILL_OWNER can switch between company mills
    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    stmt = select(Employee)

    if effective_mill_id:
        stmt = stmt.where(Employee.mill_id == effective_mill_id)
    elif scope.get("company_id"):
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

    sort_col = SORTABLE_EMPLOYEE_COLUMNS.get(sort_by) if sort_by else None
    if sort_col:
        order_fn = desc if sort_dir == "desc" else asc
        stmt = stmt.order_by(order_fn(sort_col), Employee.name.asc())
    else:
        stmt = stmt.order_by(Employee.name.asc(), Employee.code.asc())

    try:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        items = result.scalars().all()

        # Fetch custom field definitions for this company's employees
        custom_field_defs: list = []
        custom_lookup: dict = {}
        company_id = scope.get("company_id", "")
        if company_id:
            cf_defs_result = await db.execute(
                select(EmployeeCustomField)
                .where(EmployeeCustomField.company_id == company_id)
                .order_by(EmployeeCustomField.id)
            )
            cf_defs = cf_defs_result.scalars().all()
            custom_field_defs = [
                {"field_key": cf.field_name, "field_label": cf.field_name, "field_type": cf.field_type or "text"}
                for cf in cf_defs
            ]
            if cf_defs and items:
                emp_ids = [str(e.id) for e in items]
                cv_result = await db.execute(
                    select(EmployeeCustomValue)
                    .where(EmployeeCustomValue.employee_id.in_(emp_ids))
                )
                fid_to_name = {cf.id: cf.field_name for cf in cf_defs}
                for cv in cv_result.scalars().all():
                    fname = fid_to_name.get(cv.field_id, cv.field_id)
                    custom_lookup.setdefault(cv.employee_id, {})[fname] = cv.value or ""

        data = []
        for e in items:
            emp_dict = EmployeeOut.model_validate(e).model_dump()
            emp_dict["custom_fields"] = custom_lookup.get(str(e.id), {})
            data.append(emp_dict)

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": data,
            "custom_field_definitions": custom_field_defs,
        }
    except Exception as e:
        logger.error(f"HR employees list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": [], "custom_field_definitions": []}


@router.get("/hr/employees/{employee_id}", response_model=EmployeeDetailOut)
async def get_employee_detail(
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Employee).where(Employee.id == employee_id)
    if scope["mill_id"]:
        stmt = stmt.where(Employee.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    resolved_company_id = scope.get("company_id")
    if not resolved_company_id and emp.mill_id:
        mill_row = (await db.execute(select(Mill).where(Mill.id == emp.mill_id))).scalar_one_or_none()
        resolved_company_id = mill_row.company_id if mill_row else None

    custom_values: List[Dict] = []
    if resolved_company_id:
        cv_result = await db.execute(
            select(EmployeeCustomField, EmployeeCustomValue)
            .join(EmployeeCustomValue, EmployeeCustomValue.field_id == EmployeeCustomField.id, isouter=True)
            .where(
                EmployeeCustomField.company_id == resolved_company_id,
                EmployeeCustomValue.employee_id == employee_id,
            )
        )
        for field, value in cv_result.all():
            custom_values.append({
                "field_id": field.id,
                "field_name": field.field_name,
                "field_type": field.field_type,
                "value": value.value if value else None,
            })

    emp_data = EmployeeOut.model_validate(emp).model_dump()
    emp_data["custom_values"] = custom_values
    return emp_data


@router.post("/hr/employees", response_model=EmployeeOut)
async def create_employee(
    req: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    scope = await get_mill_scope(current_user, db)
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
        days_of_month=req.days_of_month or 30,
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
    scope = await get_mill_scope(current_user, db)
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
    scope = await get_mill_scope(current_user, db)
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
    if len(req.items) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 employees per batch")

    scope = await get_mill_scope(current_user, db)
    mill_id = req.mill_id or scope["mill_id"]

    # If still no mill_id, try first available company mill
    if not mill_id:
        company_id = scope.get("company_id")
        if company_id:
            first_mill = await db.execute(
                select(Mill).where(
                    Mill.company_id == company_id,
                    Mill.is_active == True,
                ).limit(1)
            )
            first = first_mill.scalar_one_or_none()
            if first:
                mill_id = first.id
        if not mill_id:
            raise HTTPException(400, detail="No mill specified for import. Select a mill first.")

    # SUPER_ADMIN / MILL_OWNER can import into any mill in their company
    if mill_id != scope.get("mill_id") and scope.get("role") not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(403, "Cannot import employees into a different mill")

    # Resolve company_id for custom fields
    resolved_company_id = scope.get("company_id")
    if not resolved_company_id and mill_id:
        mill_row = (await db.execute(select(Mill).where(Mill.id == mill_id))).scalar_one_or_none()
        resolved_company_id = mill_row.company_id if mill_row else None

    def _err(row: int, msg: str, field: Optional[str] = None, value: Optional[str] = None, severity: str = "error") -> ImportErrorDetail:
        return ImportErrorDetail(row=row, message=msg, field=field, value=value, severity=severity)

    def parse_date(s: Optional[str], row_num: int) -> Optional[date_type]:
        if not s:
            return None
        s = s.strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                from datetime import datetime as dt
                return dt.strptime(s, fmt).date()
            except ValueError:
                continue
        errors.append(_err(row_num, f"Invalid date format '{s}', expected DD/MM/YYYY or YYYY-MM-DD", "date_of_joining", s))
        return None

    employees_to_add: List[Employee] = []
    payroll_records: List[MonthlyPayroll] = []
    errors: List[ImportErrorDetail] = []
    custom_fields_map: Dict[str, Dict[str, str]] = {}
    batch_seen_codes: set = set()
    now = datetime.now(timezone.utc)
    cur_month = now.month
    cur_year = now.year

    for i, item in enumerate(req.items, start=1):
        row = i
        row_label = f"Row {i} ({item.employee_code or 'no code'})"
        if not item.employee_code:
            errors.append(_err(row, "Field 'employee_code' is required", "employee_code"))
            continue
        if not item.full_name:
            errors.append(_err(row, "Field 'full_name' is required", "full_name", item.full_name))
            continue

        code_key = item.employee_code.strip()
        if code_key in batch_seen_codes:
            errors.append(_err(row, f"Duplicate employee code '{code_key}' in same batch (row {row})", "employee_code"))
            continue
        batch_seen_codes.add(code_key)

        doj = parse_date(item.date_of_joining, row)
        if item.date_of_joining and not doj:
            continue

        dob = parse_date(item.dob, row)
        if item.dob and not dob:
            continue

        total_sal = item.total_salary
        if total_sal is None:
            total_sal = (item.wages or 0) + (item.basic or 0) + (item.house_rent or 0) + (item.medical or 0) + (item.conveyance or 0) + (item.food_allowance or 0) + (item.increment or 0) + (item.mobile_bill or 0) + (item.shift_benefit or 0)

        def _str(v):
            return str(v).strip() if v is not None else None

        dept_name = (item.department or "General").strip()
        if dept_name != "General":
            dept_result = await db.execute(
                select(Department).where(
                    Department.name.ilike(dept_name),
                    Department.mill_id == mill_id
                )
            )
            dept = dept_result.scalar_one_or_none()
            if not dept:
                try:
                    from sqlalchemy import insert as sa_insert
                    import uuid
                    await db.execute(
                        sa_insert(Department).values(
                            id=str(uuid.uuid4()),
                            mill_id=mill_id,
                            code=dept_name,
                            name=dept_name,
                            department_type="General",
                            is_active=True,
                        )
                    )
                    errors.append(_err(row, f"Department '{dept_name}' not found — auto-created", "department", dept_name, "info"))
                except Exception as dept_err:
                    logger.warning("Department auto-create failed (transaction preserved)", extra={"row": row, "department": dept_name})
                    errors.append(_err(row, f"Department '{dept_name}' auto-create failed: {dept_err}", "department", dept_name, "warning"))

        emp = Employee(
            code=item.employee_code.strip(),
            name=item.full_name.strip(),
            department=dept_name,
            department_name=dept_name,
            designation=_str(item.designation),
            section=_str(item.section),
            shift=item.shift or "General",
            joining_date=doj,
            dob=dob,
            gen=_str(item.gen),
            age=item.age,
            gender=_str(item.gender),
            grade=_str(item.grade) if item.grade is not None else None,
            phone=_str(item.phone),
            sl_no=item.sl_no,
            bank_account_no=_str(item.bank_account_no),
            wages=item.wages or 0,
            basic=item.basic or 0,
            house_rent=item.house_rent or 0,
            medical=item.medical or 0,
            conveyance=item.conveyance or 0,
            food_allowance=item.food_allowance or 0,
            increment=item.increment or 0,
            total_salary=total_sal,
            wages_of_month=item.wages_of_month or 0,
            days_of_month=item.days_of_month or 30,
            mobile_bill=item.mobile_bill or 0,
            shift_benefit=item.shift_benefit or 0,
            is_active=True,
            mill_id=mill_id,
        )
        if not emp.mill_id:
            errors.append(_err(row, "Employee must have a mill_id — select a mill before import", "mill_id"))
            continue
        employees_to_add.append(emp)
        if item.custom_fields:
            custom_fields_map[item.employee_code.strip()] = item.custom_fields
        has_payroll = any(getattr(item, f, None) is not None for f in [
            "calculate_days", "actual_attendance", "day_off", "cl", "sl", "el",
            "comp_leave", "festival_holiday", "absent_days", "payable_days",
            "payable_salary", "ot_hours", "ot_amount", "festival_duty_benefit",
            "festival_holiday_allowance", "ifter_days", "ifter_allowance",
            "special_food", "attendance_bonus", "arrear_others", "shift_qty",
            "shift_tk", "roster_qty", "roster_tk", "absent_deduction",
            "advance_deduction", "tax_deduction", "net_payable",
        ])
        if has_payroll:
            payroll_records.append((emp, item))

    # Don't abort — skip only the bad rows, import the rest

    # Pre-fetch existing employee codes scoped to this mill
    existing_codes: set = set()
    ec_result = await db.execute(
        select(Employee.code).where(Employee.mill_id == mill_id)
    )
    existing_codes = {r[0] for r in ec_result.all()}

    # Pre-fetch existing custom field names for the company
    existing_field_names: Dict[str, EmployeeCustomField] = {}
    try:
        if resolved_company_id:
            ef_result = await db.execute(
                select(EmployeeCustomField).where(
                    EmployeeCustomField.company_id == resolved_company_id
                )
            )
            for f in ef_result.scalars().all():
                existing_field_names[f.field_name] = f

            # Pre-create all custom field definitions BEFORE the batch loop (one flush)
            all_custom_names = set()
            for emp in employees_to_add:
                cf = custom_fields_map.get(emp.code)
                if cf:
                    all_custom_names.update(cf.keys())
            new_fields = []
            for fname in all_custom_names:
                if fname not in existing_field_names:
                    field = EmployeeCustomField(
                        company_id=resolved_company_id,
                        field_name=fname,
                        field_type="text",
                    )
                    db.add(field)
                    new_fields.append(field)
            if new_fields:
                await db.flush()
                for f in new_fields:
                    existing_field_names[f.field_name] = f
    except Exception as exc:
        logger.warning("Failed to pre-fetch/pre-create custom fields (will skip custom values for this import, transaction preserved)")

    # ── Assign GLOBAL serial numbers sorted by department ─────────────────
    employees_to_add.sort(key=lambda e: (e.department or "").lower())
    for sno, emp in enumerate(employees_to_add, start=1):
        emp.sl_no = sno  # overwrite Excel SI No with SpinFlow global sequence

    created_count = 0
    updated = 0
    emp_id_map: Dict[str, str] = {}
    for idx, emp in enumerate(employees_to_add):
        row_num = idx + 1
        try:
            async with await db.begin_nested():
                if emp.code in existing_codes:
                    existing_result = await db.execute(
                        select(Employee).where(
                            Employee.code == emp.code,
                            Employee.mill_id == mill_id,
                        )
                    )
                    existing = existing_result.scalar_one_or_none()
                    if existing:
                        if existing.mill_id is None and emp.mill_id:
                            existing.mill_id = emp.mill_id
                        for field in ["name", "department", "designation", "section", "shift",
                                      "joining_date", "dob", "gen", "age", "gender", "grade",
                                      "phone", "bank_account_no", "basic", "house_rent", "medical",
                                      "conveyance", "food_allowance", "wages", "increment",
                                      "total_salary", "mobile_bill", "shift_benefit", "wages_of_month",
                                      "days_of_month", "sl_no"]:
                            val = getattr(emp, field, None)
                            if val is not None:
                                setattr(existing, field, val)
                        db.add(existing)
                        await db.flush()
                        emp_id_map[emp.code] = existing.id
                        existing_codes.add(emp.code)
                        updated += 1
                else:
                    db.add(emp)
                    await db.flush()
                    emp_id_map[emp.code] = emp.id
                    existing_codes.add(emp.code)
                    created_count += 1

                if resolved_company_id:
                    cf_fields = custom_fields_map.get(emp.code)
                    if cf_fields:
                        actual_emp_id = emp_id_map.get(emp.code)
                        if actual_emp_id:
                            for fname, fval in cf_fields.items():
                                field = existing_field_names.get(fname)
                                if not field:
                                    continue
                                cv = EmployeeCustomValue(
                                    employee_id=actual_emp_id,
                                    field_id=field.id,
                                    value=str(fval) if fval is not None else None,
                                )
                                db.add(cv)
        except Exception as exc:
            try:
                db.expunge(emp)
            except Exception:
                pass
            logger.exception("Employee import failed", extra={"row": row_num, "code": emp.code})
            errors.append(_err(row_num, str(exc)))
            continue

    for emp, item in payroll_records:
        if emp.code not in emp_id_map:
            continue
        mp = MonthlyPayroll(
            employee_id=emp_id_map[emp.code],
            mill_id=mill_id,
            month=cur_month,
            year=cur_year,
            days_of_month=item.days_of_month or 30,
            calculate_days=item.calculate_days or 0,
            actual_attendance=item.actual_attendance or 0,
            day_off=item.day_off or 0,
            cl=item.cl or 0,
            sl=item.sl or 0,
            el=item.el or 0,
            comp_leave=item.comp_leave or 0,
            festival_holiday=item.festival_holiday or 0,
            absent_days=item.absent_days or 0,
            payable_days=item.payable_days or 0,
            payable_salary=item.payable_salary or 0,
            ot_hours=item.ot_hours or 0,
            ot_amount=item.ot_amount or 0,
            festival_duty_benefit=item.festival_duty_benefit or 0,
            festival_holiday_allowance=item.festival_holiday_allowance or 0,
            ifter_days=item.ifter_days or 0,
            ifter_allowance=item.ifter_allowance or 0,
            special_food=item.special_food or 0,
            attendance_bonus=item.attendance_bonus or 0,
            arrear_others=item.arrear_others or 0,
            shift_qty=item.shift_qty or 0,
            shift_amount=item.shift_tk or 0,
            roster_qty=item.roster_qty or 0,
            roster_amount=item.roster_tk or 0,
            absent_deduction=item.absent_deduction or 0,
            advance_deduction=item.advance_deduction or 0,
            tax_deduction=item.tax_deduction or 0,
            net_payable=item.net_payable or 0,
        )
        db.add(mp)

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        return EmployeeBulkResponse(created=created_count, updated=updated, errors=errors + [_err(0, str(exc))])
    return EmployeeBulkResponse(created=created_count, updated=updated, errors=errors)
@router.post("/hr/payroll/bulk", response_model=PayrollBulkResponse)
async def bulk_create_payroll(
    req: PayrollBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    MAX_BATCH = 500
    if len(req.records) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    scope = await get_mill_scope(current_user, db)
    if scope.get("mill_id") and req.mill_id != scope["mill_id"]:
        raise HTTPException(403, "Cannot create payroll for a different mill")

    created = 0
    updated = 0
    errors: List[str] = []

    for i, rec in enumerate(req.records):
        row_label = f"Row {i+1}"
        try:
            emp = None
            if rec.employee_code:
                emp_result = await db.execute(
                    select(Employee).where(
                        Employee.code == rec.employee_code.strip(),
                        Employee.mill_id == req.mill_id,
                    )
                )
                emp = emp_result.scalar_one_or_none()
            if not emp and rec.employee_id:
                emp = await db.get(Employee, rec.employee_id)

            if not emp:
                errors.append(f"{row_label}: employee not found (code='{rec.employee_code}', id='{rec.employee_id}')")
                continue

            existing = await db.execute(
                select(MonthlyPayroll).where(
                    MonthlyPayroll.employee_id == emp.id,
                    MonthlyPayroll.month == req.month,
                    MonthlyPayroll.year == req.year,
                )
            )
            payroll = existing.scalar_one_or_none()

            if payroll:
                for field in ("days_of_month", "calculate_days", "actual_attendance", "day_off",
                              "cl", "sl", "el", "comp_leave", "festival_holiday", "absent_days",
                              "payable_days", "payable_salary", "ot_hours", "ot_amount",
                              "festival_duty_benefit", "festival_holiday_allowance", "ifter_days",
                              "ifter_allowance", "special_food", "attendance_bonus", "arrear_others",
                              "shift_qty", "shift_amount", "roster_qty", "roster_amount",
                              "absent_deduction", "advance_deduction", "tax_deduction", "net_payable"):
                    val = getattr(rec, field, None)
                    if val is not None:
                        setattr(payroll, field, val)
                updated += 1
            else:
                payroll = MonthlyPayroll(
                    employee_id=emp.id,
                    mill_id=req.mill_id,
                    month=req.month,
                    year=req.year,
                    days_of_month=rec.days_of_month or 26,
                    calculate_days=rec.calculate_days or 0,
                    actual_attendance=rec.actual_attendance or 0,
                    day_off=rec.day_off or 0,
                    cl=rec.cl or 0,
                    sl=rec.sl or 0,
                    el=rec.el or 0,
                    comp_leave=rec.comp_leave or 0,
                    festival_holiday=rec.festival_holiday or 0,
                    absent_days=rec.absent_days or 0,
                    payable_days=rec.payable_days or 0,
                    payable_salary=rec.payable_salary or 0,
                    ot_hours=rec.ot_hours or 0,
                    ot_amount=rec.ot_amount or 0,
                    festival_duty_benefit=rec.festival_duty_benefit or 0,
                    festival_holiday_allowance=rec.festival_holiday_allowance or 0,
                    ifter_days=rec.ifter_days or 0,
                    ifter_allowance=rec.ifter_allowance or 0,
                    special_food=rec.special_food or 0,
                    attendance_bonus=rec.attendance_bonus or 0,
                    arrear_others=rec.arrear_others or 0,
                    shift_qty=rec.shift_qty or 0,
                    shift_amount=rec.shift_amount or 0,
                    roster_qty=rec.roster_qty or 0,
                    roster_amount=rec.roster_amount or 0,
                    absent_deduction=rec.absent_deduction or 0,
                    advance_deduction=rec.advance_deduction or 0,
                    tax_deduction=rec.tax_deduction or 0,
                    net_payable=rec.net_payable or 0,
                )
                db.add(payroll)
                created += 1
        except Exception as exc:
            errors.append(f"{row_label}: {str(exc)}")

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        return PayrollBulkResponse(created=created, updated=updated, errors=[f"Commit error: {str(exc)}"])

    return PayrollBulkResponse(created=created, updated=updated, errors=errors)


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
    scope = await get_mill_scope(current_user, db)
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

    try:
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
    except Exception as e:
        logger.error(f"HR payroll list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/hr/payroll/calculate")
async def calculate_payroll(
    req: PayrollCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr", write=True)),
):
    scope = await get_mill_scope(current_user, db)

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

        payroll.days_of_month = emp.days_of_month or 30
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
    page_size: int = Query(50, ge=1, le=1000),
    date: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    stmt = select(Attendance).join(Employee, Attendance.employee_id == Employee.id).order_by(Attendance.date.desc())
    if effective_mill_id:
        stmt = stmt.where(Employee.mill_id == effective_mill_id)
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date:
        stmt = stmt.where(Attendance.date == date)
    if employee_id:
        stmt = stmt.where(Attendance.employee_id == employee_id)
    if department:
        stmt = stmt.where(Employee.department == department)
    try:
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
    except Exception as e:
        logger.error(f"HR attendance list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.get("/hr/attendance/summary")
async def get_attendance_summary(
    date: Optional[str] = Query(None),
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    emp_stmt = select(Employee)
    if effective_mill_id:
        emp_stmt = emp_stmt.where(Employee.mill_id == effective_mill_id)
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
    MAX_BATCH = 500
    if len(req.records) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
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
    MAX_BATCH = 500
    if len(req.items) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    STATUS_MAP = {"p": "present", "a": "absent", "h": "holiday", "l": "leave",
                  "present": "present", "absent": "absent", "holiday": "holiday", "leave": "leave"}
    created = 0
    skipped = 0
    errors: List[str] = []
    for i, row in enumerate(req.items):
        try:
            emp_code = str(row.get("employee_code") or "").strip()
            emp_name = str(row.get("employee_name") or row.get("name") or "").strip()
            date_str = str(row.get("date") or "").strip()
            status_raw = str(row.get("status") or "").strip().lower()
            if not emp_code and not emp_name:
                skipped += 1
                errors.append(f"Row {i + 1}: missing employee_code or employee_name")
                continue
            if not date_str or not status_raw:
                skipped += 1
                errors.append(f"Row {i + 1}: missing date or status")
                continue
            norm_status = STATUS_MAP.get(status_raw)
            if not norm_status:
                skipped += 1
                errors.append(f"Row {i + 1}: unknown status '{status_raw}'")
                continue
            emp = None
            if emp_code:
                emp_result = await db.execute(select(Employee).where(Employee.code == emp_code))
                emp = emp_result.scalar_one_or_none()
                if not emp:
                    emp_result = await db.execute(select(Employee).where(Employee.employee_id == emp_code))
                    emp = emp_result.scalar_one_or_none()
            if not emp and emp_name:
                emp_result = await db.execute(select(Employee).where(Employee.name == emp_name))
                emp = emp_result.scalar_one_or_none()
            if not emp:
                skipped += 1
                errors.append(f"Row {i + 1}: employee '{emp_code or emp_name}' not found")
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
    page_size: int = Query(20, ge=1, le=1000),
    employee_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    stmt = select(Leave).join(Employee, Leave.employee_id == Employee.id).order_by(Leave.created_at.desc())
    if effective_mill_id:
        stmt = stmt.where(Employee.mill_id == effective_mill_id)
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Employee.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if employee_id:
        stmt = stmt.where(Leave.employee_id == employee_id)
    if status:
        stmt = stmt.where(Leave.status == status)
    try:
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
    except Exception as e:
        logger.error(f"HR leaves list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


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


@router.get("/hr/page-init")
async def hr_page_init(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("hr")),
):
    scope = await get_mill_scope(current_user, db)
    result: Dict[str, Any] = {}
    try:
        dept_query = select(Department.id, Department.name, Department.code).where(
            Department.is_active == True
        )
        if scope["mill_id"]:
            dept_query = dept_query.where(Department.mill_id == scope["mill_id"])
        dept_query = dept_query.order_by(Department.name)
        dept_rows = await db.execute(dept_query)
        result["departments"] = [{"id": r.id, "name": r.name, "code": r.code} for r in dept_rows]
    except Exception as e:
        logger.error(f"hr.page-init departments error: {e}")
        result["departments"] = []
    try:
        today = date_type.today()
        att_rows = await db.execute(
            select(Attendance.status, func.count().label("cnt"))
            .where(Attendance.date == today.isoformat())
            .group_by(Attendance.status)
        )
        att_data = att_rows.all()
        present = next((r.cnt for r in att_data if r.status == "present"), 0)
        total = sum(r.cnt for r in att_data)
        result["attendance_summary"] = {
            "present_today": present,
            "absent_today": total - present,
        }
    except Exception as e:
        logger.error(f"hr.page-init attendance error: {e}")
        result["attendance_summary"] = {"present_today": 0, "absent_today": 0}
    try:
        pending = await db.execute(
            select(func.count()).where(Leave.status == "pending", Leave.is_active == True)
        )
        result["leave_summary"] = {"pending_leaves": pending.scalar() or 0}
    except Exception as e:
        logger.error(f"hr.page-init leaves error: {e}")
        result["leave_summary"] = {"pending_leaves": 0}
    return result
