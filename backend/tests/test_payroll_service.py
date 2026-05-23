import uuid
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.hr import Employee, Attendance
from app.models.payroll import PayrollMonth, PayslipEntry
from app.models.user import User, Role
from app.models.masters import Mill
from app.services.payroll_service import PayrollService


@pytest_asyncio.fixture
async def payroll_roles(session: AsyncSession) -> dict:
    roles_data = {
        "hr_manager": {"code": "HR_MANAGER", "name": "HR Manager"},
        "accountant": {"code": "ACCOUNTANT", "name": "Accountant"},
    }
    result = {}
    for key, data in roles_data.items():
        role = Role(id=str(uuid.uuid4()), **data)
        session.add(role)
        result[key] = role
    await session.flush()
    return result


@pytest_asyncio.fixture
async def hr_manager(session: AsyncSession, payroll_roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="hr_mgr",
        email="hr_mgr@test.com",
        password_hash="hash",
        role_id=payroll_roles["hr_manager"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def accountant_user(session: AsyncSession, payroll_roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="accountant",
        email="accountant@test.com",
        password_hash="hash",
        role_id=payroll_roles["accountant"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def test_mill(session: AsyncSession) -> Mill:
    mill = Mill(
        id="m1",
        company_id="dummy_company",
        code="MILL-001",
        name="Test Mill",
        is_active=True,
    )
    session.add(mill)
    await session.flush()
    return mill


@pytest_asyncio.fixture
async def employees_with_attendance(session: AsyncSession, test_mill: Mill) -> list[Employee]:
    employees_data = [
        {
            "id": "emp1", "code": "E001", "name": "Emp One",
            "department": "Spinning", "daily_wage": 600.0,
            "pf_enrolled": True, "esic_enrolled": True,
            "is_active": True, "mill_id": "m1",
        },
        {
            "id": "emp2", "code": "E002", "name": "Emp Two",
            "department": "Winding", "daily_wage": 500.0,
            "pf_enrolled": False, "esic_enrolled": True,
            "is_active": True, "mill_id": "m1",
        },
        {
            "id": "emp3", "code": "E003", "name": "Emp Three",
            "department": "Spinning", "daily_wage": 700.0,
            "pf_enrolled": True, "esic_enrolled": False,
            "is_active": True, "mill_id": "m1",
        },
    ]
    employees = []
    for data in employees_data:
        emp = Employee(**data)
        session.add(emp)
        employees.append(emp)
    await session.flush()

    attendance_records = []
    for d in range(1, 23):
        ot = 0.0
        if d == 15:
            ot = 2.0
        elif d == 20:
            ot = 2.0
        attendance_records.append(
            Attendance(id=str(uuid.uuid4()), employee_id="emp1", date=f"2024-05-{d:02d}", status="present", overtime_hours=ot)
        )
    for d in [23, 24]:
        attendance_records.append(
            Attendance(id=str(uuid.uuid4()), employee_id="emp1", date=f"2024-05-{d:02d}", status="half_day", overtime_hours=0)
        )

    for d in range(1, 21):
        attendance_records.append(
            Attendance(id=str(uuid.uuid4()), employee_id="emp2", date=f"2024-05-{d:02d}", status="present", overtime_hours=0)
        )
    for d in [21, 22]:
        attendance_records.append(
            Attendance(id=str(uuid.uuid4()), employee_id="emp2", date=f"2024-05-{d:02d}", status="absent", overtime_hours=0)
        )

    for d in range(1, 19):
        ot = 4.0 if d in (10, 18) else 0.0
        attendance_records.append(
            Attendance(id=str(uuid.uuid4()), employee_id="emp3", date=f"2024-05-{d:02d}", status="present", overtime_hours=ot)
        )
    for d in [19, 20, 21, 22]:
        attendance_records.append(
            Attendance(id=str(uuid.uuid4()), employee_id="emp3", date=f"2024-05-{d:02d}", status="absent", overtime_hours=0)
        )
    for d in [23, 24]:
        attendance_records.append(
            Attendance(id=str(uuid.uuid4()), employee_id="emp3", date=f"2024-05-{d:02d}", status="half_day", overtime_hours=0)
        )

    for att in attendance_records:
        session.add(att)
    await session.flush()
    return employees


@pytest_asyncio.fixture
async def payroll_service(session: AsyncSession, hr_manager: User) -> PayrollService:
    return PayrollService(session, hr_manager)


@pytest.mark.asyncio
async def test_process_payroll_calculates_basic_wage_correctly(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    stmt = select(PayslipEntry).where(
        and_(
            PayslipEntry.employee_id == "emp1",
            PayslipEntry.month == 5,
            PayslipEntry.year == 2024,
        )
    )
    entry = (await payroll_service.db.execute(stmt)).scalar_one_or_none()
    assert entry is not None
    assert entry.basic_wage == 13800.0, f"Expected 13800.0, got {entry.basic_wage}"


@pytest.mark.asyncio
async def test_process_payroll_calculates_overtime(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    stmt = select(PayslipEntry).where(
        and_(
            PayslipEntry.employee_id == "emp1",
            PayslipEntry.month == 5,
            PayslipEntry.year == 2024,
        )
    )
    entry = (await payroll_service.db.execute(stmt)).scalar_one_or_none()
    assert entry is not None
    assert entry.overtime_amount == 450.0, f"Expected 450.0, got {entry.overtime_amount}"


@pytest.mark.asyncio
async def test_process_payroll_calculates_pf_enrolled(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    stmt = select(PayslipEntry).where(
        and_(
            PayslipEntry.employee_id == "emp1",
            PayslipEntry.month == 5,
            PayslipEntry.year == 2024,
        )
    )
    entry = (await payroll_service.db.execute(stmt)).scalar_one_or_none()
    assert entry is not None
    assert entry.pf_employee == 1656.0, f"Expected 1656.0, got {entry.pf_employee}"


@pytest.mark.asyncio
async def test_process_payroll_skips_pf_not_enrolled(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    stmt = select(PayslipEntry).where(
        and_(
            PayslipEntry.employee_id == "emp2",
            PayslipEntry.month == 5,
            PayslipEntry.year == 2024,
        )
    )
    entry = (await payroll_service.db.execute(stmt)).scalar_one_or_none()
    assert entry is not None
    assert entry.pf_employee == 0.0, f"Expected 0.0, got {entry.pf_employee}"


@pytest.mark.asyncio
async def test_process_payroll_calculates_esic(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    stmt = select(PayslipEntry).where(
        and_(
            PayslipEntry.employee_id == "emp1",
            PayslipEntry.month == 5,
            PayslipEntry.year == 2024,
        )
    )
    entry = (await payroll_service.db.execute(stmt)).scalar_one_or_none()
    assert entry is not None
    assert entry.esic_employee == pytest.approx(106.88, rel=0.01), f"Expected ~106.88, got {entry.esic_employee}"


@pytest.mark.asyncio
async def test_process_payroll_net_wage_calculation(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    stmt = select(PayslipEntry).where(
        and_(
            PayslipEntry.employee_id == "emp1",
            PayslipEntry.month == 5,
            PayslipEntry.year == 2024,
        )
    )
    entry = (await payroll_service.db.execute(stmt)).scalar_one_or_none()
    assert entry is not None
    expected_net = round(entry.gross_wage - entry.pf_employee - entry.esic_employee, 2)
    assert entry.net_wage == pytest.approx(expected_net, rel=0.01)


@pytest.mark.asyncio
async def test_payroll_month_totals_aggregated(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    pm_result = await payroll_service.db.execute(
        select(PayrollMonth).where(
            and_(
                PayrollMonth.mill_id == "m1",
                PayrollMonth.month == 5,
                PayrollMonth.year == 2024,
            )
        )
    )
    pm = pm_result.scalar_one_or_none()
    assert pm is not None
    assert pm.total_employees == 3, f"Expected 3 employees, got {pm.total_employees}"

    stmt = select(PayslipEntry).where(PayslipEntry.payroll_month_id == pm.id)
    entries = (await payroll_service.db.execute(stmt)).scalars().all()
    expected_gross = sum(e.gross_wage for e in entries)
    assert pm.total_gross == pytest.approx(expected_gross, rel=0.01)


@pytest.mark.asyncio
async def test_approve_requires_different_user(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    pm_result = await payroll_service.db.execute(
        select(PayrollMonth).where(
            and_(
                PayrollMonth.mill_id == "m1",
                PayrollMonth.month == 5,
                PayrollMonth.year == 2024,
            )
        )
    )
    pm = pm_result.scalar_one_or_none()
    with pytest.raises(Exception) as exc:
        await payroll_service.approve_payroll(
            pm.id,
            approver_id=payroll_service.current_user.id,
            approver_role="HR_MANAGER",
        )
    assert "Cannot approve" in str(exc.value)


@pytest.mark.asyncio
async def test_approve_with_different_user_succeeds(
    payroll_service: PayrollService,
    accountant_user: User,
    employees_with_attendance: list[Employee],
    session: AsyncSession,
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    pm_result = await payroll_service.db.execute(
        select(PayrollMonth).where(
            and_(
                PayrollMonth.mill_id == "m1",
                PayrollMonth.month == 5,
                PayrollMonth.year == 2024,
            )
        )
    )
    pm = pm_result.scalar_one_or_none()

    second_service = PayrollService(session, accountant_user)
    result = await second_service.approve_payroll(
        pm.id,
        approver_id=accountant_user.id,
        approver_role="ACCOUNTANT",
    )
    assert result["status"] == "approved"

    pm_result2 = await payroll_service.db.execute(
        select(PayrollMonth).where(PayrollMonth.id == pm.id)
    )
    pm2 = pm_result2.scalar_one()
    assert pm2.status == "approved"


@pytest.mark.asyncio
async def test_mark_paid_sets_all_payslips_paid(
    payroll_service: PayrollService,
    accountant_user: User,
    employees_with_attendance: list[Employee],
    session: AsyncSession,
):
    await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    pm_result = await payroll_service.db.execute(
        select(PayrollMonth).where(
            and_(
                PayrollMonth.mill_id == "m1",
                PayrollMonth.month == 5,
                PayrollMonth.year == 2024,
            )
        )
    )
    pm = pm_result.scalar_one_or_none()

    second_service = PayrollService(session, accountant_user)
    await second_service.approve_payroll(
        pm.id,
        approver_id=accountant_user.id,
        approver_role="ACCOUNTANT",
    )
    await second_service.mark_paid(pm.id, user_id=accountant_user.id)

    stmt = select(PayslipEntry).where(PayslipEntry.payroll_month_id == pm.id)
    entries = (await second_service.db.execute(stmt)).scalars().all()
    for e in entries:
        assert e.status == "paid", f"Payslip {e.id} status is {e.status}, expected paid"


@pytest.mark.asyncio
async def test_process_idempotent(
    payroll_service: PayrollService,
    employees_with_attendance: list[Employee],
):
    r1 = await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    r2 = await payroll_service.process_payroll(
        "m1", 5, 2024,
        processor_id=payroll_service.current_user.id,
        processor_role="HR_MANAGER",
    )
    assert r1["total_employees"] == r2["total_employees"], (
        f"Idempotent process changed employee count: {r1['total_employees']} vs {r2['total_employees']}"
    )
