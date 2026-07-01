import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.error_handler import SpinFlowException
from app.services.masters_service import MastersService
from app.schemas.masters import (
    CompanyCreate, MillCreate, DepartmentCreate, YarnCountCreate, CustomerCreate, MasterVehicleCreate,
)
from app.models.masters import Company, Mill, Department, YarnCount, Customer, MasterVehicle, Route


@pytest_asyncio.fixture
async def company(session: AsyncSession) -> Company:
    c = Company(code="TEST-CO", name="Test Company", gstin="29ABCDE1234F1Z5")
    session.add(c)
    await session.flush()
    return c


@pytest_asyncio.fixture
async def mill(session: AsyncSession, company: Company) -> Mill:
    m = Mill(code="TEST-MILL", name="Test Mill", company_id=company.id, city="Coimbatore", state="Tamil Nadu")
    session.add(m)
    await session.flush()
    return m


@pytest_asyncio.fixture
async def department(session: AsyncSession, mill: Mill) -> Department:
    d = Department(mill_id=mill.id, code="TEST-DEPT", name="Test Dept", department_type="ring_frame")
    session.add(d)
    await session.flush()
    return d


@pytest_asyncio.fixture
async def yarn_count(session: AsyncSession, mill: Mill) -> YarnCount:
    y = YarnCount(mill_id=mill.id, count="40s", count_value=40.0, blend="100% Cotton")
    session.add(y)
    await session.flush()
    return y


@pytest_asyncio.fixture
async def customer(session: AsyncSession, mill: Mill) -> Customer:
    c = Customer(mill_id=mill.id, code="TEST-CUST", name="Test Customer")
    session.add(c)
    await session.flush()
    return c


@pytest_asyncio.fixture
async def vehicle(session: AsyncSession, mill: Mill) -> MasterVehicle:
    v = MasterVehicle(mill_id=mill.id, vehicle_no="TN 11 AB 1234", vehicle_type="truck")
    session.add(v)
    await session.flush()
    return v


@pytest_asyncio.fixture
async def route(session: AsyncSession, mill: Mill) -> Route:
    r = Route(mill_id=mill.id, code="TEST-RTE", name="Test Route", origin="A", destination="B")
    session.add(r)
    await session.flush()
    return r


class TestCreateCompany:
    async def test_create_company_success(self, session: AsyncSession, operator_user: "User"):
        svc = MastersService(session, operator_user)
        dto = CompanyCreate(code="ACME", name="Acme Corp", gstin="29ABCDE1234F1Z5")
        company = await svc.create_company(dto)
        assert company.id is not None
        assert company.code == "ACME"
        assert company.name == "Acme Corp"
        assert company.gstin == "29ABCDE1234F1Z5"

    async def test_create_company_duplicate_code_raises_409(self, session: AsyncSession, operator_user: "User"):
        svc = MastersService(session, operator_user)
        dto = CompanyCreate(code="ACME", name="Acme Corp", gstin="29ABCDE1234F1Z5")
        await svc.create_company(dto)
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_company(dto)
        assert exc.value.status_code == 409


class TestCreateMill:
    async def test_create_mill_links_to_company(self, session: AsyncSession, operator_user: "User", company: Company):
        svc = MastersService(session, operator_user)
        dto = MillCreate(company_id=company.id, code="TEST-MILL", name="Test Mill")
        mill = await svc.create_mill(dto)
        assert mill.company_id == company.id


class TestDepartment:
    async def test_create_department_links_to_mill(self, session: AsyncSession, operator_user: "User", mill: Mill):
        svc = MastersService(session, operator_user)
        dto = DepartmentCreate(mill_id=mill.id, code="TEST-DEPT", name="Test Dept", department_type="ring_frame")
        dept = await svc.create_department(dto)
        assert dept.mill_id == mill.id
        assert dept.department_type == "ring_frame"

    async def test_list_departments_filtered_by_mill_id(self, session: AsyncSession, operator_user: "User", mill: Mill):
        svc = MastersService(session, operator_user)
        dto1 = DepartmentCreate(mill_id=mill.id, code="DEPT-01", name="Dept 1", department_type="carding")
        dto2 = DepartmentCreate(mill_id=mill.id, code="DEPT-02", name="Dept 2", department_type="drawing")
        await svc.create_department(dto1)
        await svc.create_department(dto2)
        result = await svc.list_departments(mill_id=mill.id)
        assert result["total"] == 2

    async def test_list_departments_excludes_other_mill(self, session: AsyncSession, operator_user: "User", mill: Mill, company: Company):
        svc = MastersService(session, operator_user)
        mill2 = Mill(company_id=company.id, code="MILL-02", name="Mill 2")
        session.add(mill2)
        await session.flush()
        dto1 = DepartmentCreate(mill_id=mill.id, code="DEPT-01", name="Dept 1", department_type="carding")
        dto2 = DepartmentCreate(mill_id=mill2.id, code="DEPT-02", name="Dept 2", department_type="drawing")
        await svc.create_department(dto1)
        await svc.create_department(dto2)
        result = await svc.list_departments(mill_id=mill2.id)
        assert result["total"] == 1
        assert result["data"][0].mill_id == mill2.id


class TestYarnCountValidation:
    async def test_yarn_count_invalid_format_raises_validation_error(self):
        with pytest.raises(ValueError):
            YarnCountCreate(mill_id="x", count="cotton", count_value=40.0)

        valid = YarnCountCreate(mill_id="x", count="40s", count_value=40.0)
        assert valid.count == "40s"

        with pytest.raises(ValueError):
            YarnCountCreate(mill_id="x", count="40S", count_value=40.0)


class TestCustomer:
    async def test_create_customer_success(self, session: AsyncSession, operator_user: "User", mill: Mill):
        svc = MastersService(session, operator_user)
        dto = CustomerCreate(mill_id=mill.id, code="CUST-001", name="Test Customer")
        cust = await svc.create_customer(dto)
        assert cust.code == "CUST-001"
        assert cust.name.startswith("Test")
        assert cust.phone is None

    async def test_deactivate_customer_sets_is_active_false(self, session: AsyncSession, operator_user: "User", customer: Customer):
        svc = MastersService(session, operator_user)
        await svc.deactivate_customer(customer.id, operator_user.id)
        assert customer.is_active is False

    async def test_deactivated_customer_excluded_from_list(self, session: AsyncSession, operator_user: "User", mill: Mill, customer: Customer):
        svc = MastersService(session, operator_user)
        await svc.deactivate_customer(customer.id, operator_user.id)
        result = await svc.list_customers(mill_id=mill.id, include_inactive=False)
        assert result["total"] == 0


class TestVehicle:
    async def test_create_vehicle_success(self, session: AsyncSession, operator_user: "User", mill: Mill):
        svc = MastersService(session, operator_user)
        dto = MasterVehicleCreate(mill_id=mill.id, vehicle_no="TN 11 AB 1234", vehicle_type="truck")
        vehicle = await svc.create_vehicle(dto)
        assert vehicle.vehicle_no == "TN 11 AB 1234"
        assert vehicle.vehicle_type == "truck"

    async def test_create_vehicle_duplicate_vehicle_no_raises_409(self, session: AsyncSession, operator_user: "User", mill: Mill):
        svc = MastersService(session, operator_user)
        dto = MasterVehicleCreate(mill_id=mill.id, vehicle_no="TN 11 AB 1234", vehicle_type="truck")
        await svc.create_vehicle(dto)
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_vehicle(dto)
        assert exc.value.status_code == 409

    async def test_list_vehicles_scoped_to_mill(self, session: AsyncSession, operator_user: "User", mill: Mill, vehicle: MasterVehicle):
        svc = MastersService(session, operator_user)
        result = await svc.list_vehicles(mill_id=mill.id)
        assert result["total"] == 1
