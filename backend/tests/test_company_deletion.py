import pytest
import pytest_asyncio
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select

from app.models.masters import Company, Mill, CompanyModule
from app.models.user import User, Role
from app.models.hr import Employee
from app.models.production import Machine
from app.models.inventory import Lot, Warehouse
from app.models.deletion_log import DeletionLog
from app.services.deletion_service import CompanyDeletionService


@pytest_asyncio.fixture
async def super_admin_role(session: AsyncSession) -> Role:
    role = Role(id=str(uuid.uuid4()), code="SUPER_ADMIN", name="Super Admin", is_system=True)
    session.add(role)
    await session.flush()
    return role


@pytest_asyncio.fixture
async def super_admin_user(session: AsyncSession, super_admin_role: Role) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="Admin",
        email="admin@test.com",
        password_hash="dummy_hash",
        role_id=super_admin_role.id,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def test_company(session: AsyncSession) -> Company:
    company = Company(
        id=str(uuid.uuid4()),
        code="TESTCO",
        name="Test Company",
        is_active=True,
        max_users=50,
        plan="starter",
        max_employees=100,
    )
    session.add(company)
    await session.flush()

    cm = CompanyModule(company_id=company.id, module_name="production", is_enabled=True, enabled_by="system")
    session.add(cm)
    await session.flush()
    return company


@pytest_asyncio.fixture
async def test_mill(session: AsyncSession, test_company: Company) -> Mill:
    mill = Mill(
        id=str(uuid.uuid4()),
        company_id=test_company.id,
        code="MILL01",
        name="Test Mill 1",
        is_active=True,
    )
    session.add(mill)
    await session.flush()
    return mill


@pytest_asyncio.fixture
async def test_data(session: AsyncSession, test_company: Company, test_mill: Mill, super_admin_role: Role) -> dict:
    """Create a rich set of test data spanning multiple tables."""
    mill = test_mill
    company = test_company

    user = User(
        id=str(uuid.uuid4()),
        name="Test User",
        email="user@test.com",
        password_hash="dummy_hash",
        company_id=company.id,
        mill_id=mill.id,
        role_id=super_admin_role.id,
        is_active=True,
    )
    session.add(user)

    emp = Employee(
        id=str(uuid.uuid4()),
        mill_id=mill.id,
        code="EMP001",
        name="Test Employee",
        department="Production",
        is_active=True,
    )
    session.add(emp)

    machine = Machine(
        id=str(uuid.uuid4()),
        code="MAC001",
        name="Test Machine",
        mill_id=mill.id,
        department="Production",
    )
    session.add(machine)

    warehouse = Warehouse(
        id=str(uuid.uuid4()),
        code="WH01",
        name="Test Warehouse",
        mill_id=mill.id,
        is_active=True,
    )
    session.add(warehouse)

    lot = Lot(
        id=str(uuid.uuid4()),
        lot_no="LOT001",
        mill_id=mill.id,
        type="yarn",
        quantity=100,
        unit="kg",
        status="in_stock",
    )
    session.add(lot)

    await session.flush()
    return {
        "company": company,
        "mill": mill,
        "user": user,
        "employee": emp,
        "machine": machine,
        "warehouse": warehouse,
        "lot": lot,
    }


class TestCompanyDeletionService:
    """Test suite for CompanyDeletionService."""

    async def test_count_all(self, session: AsyncSession, test_data: dict, super_admin_user: User):
        """Verify the count endpoint correctly tallies affected records."""
        svc = CompanyDeletionService(session, super_admin_user)
        counts = await svc.count_all(test_data["company"].id)
        assert isinstance(counts, dict)
        assert counts.get("mills", 0) >= 1
        assert counts.get("users", 0) >= 1
        assert counts.get("employees", 0) >= 1
        assert counts.get("machines", 0) >= 1
        assert counts.get("warehouses", 0) >= 1
        assert counts.get("lots", 0) >= 1
        assert counts.get("company_modules", 0) >= 1

    async def test_hard_delete_company(self, session: AsyncSession, test_data: dict, super_admin_user: User):
        """Verify hard deletion removes all associated data."""
        company_id = test_data["company"].id
        mill_id = test_data["mill"].id

        svc = CompanyDeletionService(session, super_admin_user)
        result = await svc.hard_delete(company_id)

        assert result["success"] is True

        company_check = (await session.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
        assert company_check is None, "Company was not deleted"

        mill_check = (await session.execute(select(Mill).where(Mill.id == mill_id))).scalar_one_or_none()
        assert mill_check is None, "Mill was not deleted"

        user_check = (await session.execute(select(User).where(User.id == test_data["user"].id))).scalar_one_or_none()
        assert user_check is None, "User was not deleted"

        emp_check = (await session.execute(select(Employee).where(Employee.id == test_data["employee"].id))).scalar_one_or_none()
        assert emp_check is None, "Employee was not deleted"

        machine_check = (await session.execute(select(Machine).where(Machine.id == test_data["machine"].id))).scalar_one_or_none()
        assert machine_check is None, "Machine was not deleted"

        lot_check = (await session.execute(select(Lot).where(Lot.id == test_data["lot"].id))).scalar_one_or_none()
        assert lot_check is None, "Lot was not deleted"

        warehouse_check = (await session.execute(select(Warehouse).where(Warehouse.id == test_data["warehouse"].id))).scalar_one_or_none()
        assert warehouse_check is None, "Warehouse was not deleted"

    async def test_deletion_log_created(self, session: AsyncSession, test_data: dict, super_admin_user: User):
        """Verify a DeletionLog entry is created after deletion."""
        company = test_data["company"]
        svc = CompanyDeletionService(session, super_admin_user)
        await svc.hard_delete(company.id)

        log_q = await session.execute(
            select(DeletionLog).where(DeletionLog.company_id == company.id)
        )
        log_entry = log_q.scalar_one_or_none()
        assert log_entry is not None
        assert log_entry.company_name == company.name
        assert log_entry.company_code == company.code
        assert log_entry.deleted_by == super_admin_user.id
        assert log_entry.deletion_result == "success"
        assert log_entry.affected_records is not None
        assert "users" in log_entry.affected_records

    async def test_archive_soft_delete(self, session: AsyncSession, test_data: dict, super_admin_user: User):
        """Verify archive marks company as inactive but data remains."""
        company = test_data["company"]
        svc = CompanyDeletionService(session, super_admin_user)
        result = await svc.archive(company.id)

        assert result["success"] is True
        assert result["status"] == "archived"

        await session.refresh(company)
        assert company.is_active is False

        mill = await session.get(Mill, test_data["mill"].id)
        assert mill is not None

        user = await session.get(User, test_data["user"].id)
        assert user is not None

    async def test_delete_nonexistent_company(self, session: AsyncSession, super_admin_user: User):
        """Verify deletion of a non-existent company raises 404."""
        from fastapi import HTTPException
        svc = CompanyDeletionService(session, super_admin_user)
        with pytest.raises(HTTPException) as exc_info:
            await svc.hard_delete("nonexistent-id")
        assert exc_info.value.status_code == 404

    async def test_no_orphan_records(self, session: AsyncSession, test_data: dict, super_admin_user: User):
        """Verify after deletion, no orphan records exist for that company."""
        company_id = test_data["company"].id
        mill_id = test_data["mill"].id

        svc = CompanyDeletionService(session, super_admin_user)
        await svc.hard_delete(company_id)

        orphan_q = await session.execute(
            text("SELECT COUNT(*) FROM employees WHERE mill_id = :p"),
            {"p": mill_id}
        )
        assert (orphan_q.scalar() or 0) == 0

        orphan_q2 = await session.execute(
            text("SELECT COUNT(*) FROM machines WHERE mill_id = :p"),
            {"p": mill_id}
        )
        assert (orphan_q2.scalar() or 0) == 0

        orphan_q3 = await session.execute(
            text("SELECT COUNT(*) FROM users WHERE company_id = :p"),
            {"p": company_id}
        )
        assert (orphan_q3.scalar() or 0) == 0

    async def test_company_module_removed(self, session: AsyncSession, test_data: dict, super_admin_user: User):
        """Verify company modules are deleted."""
        company = test_data["company"]
        svc = CompanyDeletionService(session, super_admin_user)
        await svc.hard_delete(company.id)

        cm_q = await session.execute(
            select(CompanyModule).where(CompanyModule.company_id == company.id)
        )
        assert cm_q.scalar_one_or_none() is None

    async def test_backup_generated(self, session: AsyncSession, test_data: dict, super_admin_user: User, tmp_path):
        """Verify backup generates a backup key."""
        import os
        from app.services.deletion_service import BACKUP_DIR

        original_backup_dir = BACKUP_DIR
        try:
            from app.services import deletion_service
            deletion_service.BACKUP_DIR = str(tmp_path)

            svc = CompanyDeletionService(session, super_admin_user)
            backup_id = await svc.generate_backup(test_data["company"].id)
            assert backup_id is not None
            assert len(backup_id) > 0

            zip_path = os.path.join(str(tmp_path), f"company_{test_data['company'].id}_{backup_id}.zip")
            assert os.path.exists(zip_path)
        finally:
            deletion_service.BACKUP_DIR = original_backup_dir
