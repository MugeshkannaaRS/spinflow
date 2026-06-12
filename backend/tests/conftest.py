import asyncio
import uuid
from typing import AsyncGenerator

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import event

from app.db.base import Base
from app.models.user import User, Role
from app.models.production import Machine, Shift, MachineStatus
from app.models.inventory import Lot, Warehouse, InventoryBag
from app.models.dispatch import Vehicle
from app.models.stock import StockLedger, StockBalance, SalesOrder, SalesOrderLine
from app.models.masters import Mill, Customer, MasterVehicle, Route
from app.services.stock_service import StockLedgerService
from app.services.sales_service import SalesOrderService
from app.services.trip_service import TripService


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(TEST_DATABASE_URL, echo=False)

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield eng

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine) -> AsyncGenerator[AsyncSession, None]:
    connection = await engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False)

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()


@pytest_asyncio.fixture
async def db_session(session: AsyncSession) -> AsyncSession:
    return session


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncGenerator[httpx.AsyncClient, None]:
    from app.db.session import get_db
    from app.main import app as fastapi_app

    fastapi_app.dependency_overrides[get_db] = lambda: session
    transport = httpx.ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    fastapi_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def roles(session: AsyncSession) -> dict:
    roles_data = {
        "machine_operator": {"code": "MACHINE_OPERATOR", "name": "Machine Operator"},
        "prod_manager": {"code": "PRODUCTION_MANAGER", "name": "Production Manager"},
        "quality_manager": {"code": "QUALITY_MANAGER", "name": "Quality Manager"},
        "dispatch_manager": {"code": "DISPATCH_MANAGER", "name": "Dispatch Manager"},
    }
    result = {}
    for key, data in roles_data.items():
        role = Role(id=str(uuid.uuid4()), **data)
        session.add(role)
        result[key] = role
    await session.flush()
    return result


@pytest_asyncio.fixture
async def operator_user(session: AsyncSession, roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="operator1",
        email="operator@test.com",
        password_hash="hash",
        role_id=roles["machine_operator"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def prod_manager_user(session: AsyncSession, roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="prod_mgr",
        email="prod_mgr@test.com",
        password_hash="hash",
        role_id=roles["prod_manager"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def quality_manager_user(session: AsyncSession, roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="quality_mgr",
        email="quality_mgr@test.com",
        password_hash="hash",
        role_id=roles["quality_manager"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def dispatch_manager_user(session: AsyncSession, roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="dispatch_mgr",
        email="dispatch_mgr@test.com",
        password_hash="hash",
        role_id=roles["dispatch_manager"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def machine(session: AsyncSession) -> Machine:
    m = Machine(
        id=str(uuid.uuid4()),
        code="MCH-001",
        name="Ring Frame 1",
        department="spinning",
        target_kg=500.0,
        current_status="running",
    )
    session.add(m)
    await session.flush()
    return m


@pytest_asyncio.fixture
async def shift(session: AsyncSession) -> Shift:
    s = Shift(
        id=str(uuid.uuid4()),
        code="A",
        name="Shift A",
        start_time="06:00",
        end_time="14:00",
    )
    session.add(s)
    await session.flush()
    return s


@pytest_asyncio.fixture
async def warehouse(session: AsyncSession) -> Warehouse:
    w = Warehouse(
        id=str(uuid.uuid4()),
        code="WH-01",
        name="Main Warehouse",
        location="Plant A",
    )
    session.add(w)
    await session.flush()
    return w


@pytest_asyncio.fixture
async def approved_lot(session: AsyncSession, warehouse: Warehouse) -> Lot:
    lot = Lot(
        id=str(uuid.uuid4()),
        lot_no="LOT-APPROVED-001",
        type="yarn",
        quantity=5000.0,
        unit="kg",
        warehouse_id=warehouse.id,
        total_bags=100,
        quality_status="approved",
        status="in-stock",
        mill_id="m1",
    )
    session.add(lot)
    await session.flush()
    return lot


@pytest_asyncio.fixture
async def pending_lot(session: AsyncSession, warehouse: Warehouse) -> Lot:
    lot = Lot(
        id=str(uuid.uuid4()),
        lot_no="LOT-PENDING-001",
        type="yarn",
        quantity=3000.0,
        unit="kg",
        warehouse_id=warehouse.id,
        total_bags=50,
        quality_status="pending",
        status="in-stock",
        mill_id="m1",
    )
    session.add(lot)
    await session.flush()
    return lot


@pytest_asyncio.fixture
async def second_user(session: AsyncSession, roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="second_user",
        email="second@test.com",
        password_hash="hash",
        role_id=roles["prod_manager"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def stock_service(session: AsyncSession, operator_user: User) -> StockLedgerService:
    return StockLedgerService(session, operator_user)


@pytest_asyncio.fixture
async def sales_service(session: AsyncSession, operator_user: User) -> SalesOrderService:
    return SalesOrderService(session, operator_user)


@pytest_asyncio.fixture
async def approved_lot_with_balance(
    session: AsyncSession,
    warehouse: Warehouse,
    stock_service: StockLedgerService,
    operator_user: User,
) -> Lot:
    lot = Lot(
        id=str(uuid.uuid4()),
        lot_no="LOT-BALANCE-001",
        type="yarn",
        quantity=5000.0,
        unit="kg",
        warehouse_id=warehouse.id,
        total_bags=100,
        quality_status="approved",
        status="in-stock",
        mill_id="m1",
    )
    session.add(lot)
    await session.flush()

    await stock_service.record_move(
        mill_id="m1",
        lot_id=lot.id,
        warehouse_id=warehouse.id,
        move_type="PRODUCTION_IN",
        qty_in=100,
        weight_in_kg=lot.quantity,
        user_id=operator_user.id,
        lot_no=lot.lot_no,
    )
    return lot


@pytest_asyncio.fixture
async def loader_user(session: AsyncSession, roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="loader1",
        email="loader@test.com",
        password_hash="hash",
        role_id=roles["machine_operator"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def receiver_user(session: AsyncSession, roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="receiver1",
        email="receiver@test.com",
        password_hash="hash",
        role_id=roles["dispatch_manager"].id,
        mill_id="m1",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def sample_bags(session: AsyncSession, approved_lot: Lot, warehouse: Warehouse) -> list[InventoryBag]:
    bags = []
    for i in range(5):
        bag = InventoryBag(
            id=str(uuid.uuid4()),
            mill_id="m1",
            lot_id=approved_lot.id,
            lot_no=approved_lot.lot_no,
            bag_no=f"BAG-{i+1:03d}",
            yarn_count="20s",
            weight_kg=23.0 + i,
            warehouse_id=warehouse.id,
            status="available",
        )
        session.add(bag)
        bags.append(bag)
    await session.flush()
    return bags


@pytest_asyncio.fixture
async def trip_service(session: AsyncSession, operator_user: User) -> TripService:
    return TripService(session, operator_user)
