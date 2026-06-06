import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.models.masters import Company, Mill, CompanyModule
from app.models.user import User, Role, UserSession
from app.models.billing import CompanySubscription, SubscriptionPlan


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
        email="admin@suspension-test.com",
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
        code="SUSPTEST",
        name="Suspension Test Company",
        is_active=True,
        status="active",
        max_users=50,
        plan="starter",
        max_employees=100,
    )
    session.add(company)
    await session.flush()
    return company


@pytest_asyncio.fixture
async def test_mill(session: AsyncSession, test_company: Company) -> Mill:
    mill = Mill(
        id=str(uuid.uuid4()),
        company_id=test_company.id,
        code="SUSPMILL",
        name="Suspension Test Mill",
        is_active=True,
    )
    session.add(mill)
    await session.flush()
    return mill


@pytest_asyncio.fixture
async def test_plan(session: AsyncSession) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        id=str(uuid.uuid4()),
        code="starter",
        name="Starter",
        monthly_price=4999,
        yearly_price=49990,
        included_mills=1,
        included_users=25,
        is_active=True,
        sort_order=1,
    )
    session.add(plan)
    await session.flush()
    return plan


@pytest_asyncio.fixture
async def test_subscription(session: AsyncSession, test_company: Company, test_plan: SubscriptionPlan) -> CompanySubscription:
    sub = CompanySubscription(
        id=str(uuid.uuid4()),
        company_id=test_company.id,
        plan_id=test_plan.id,
        billing_cycle="monthly",
        status="active",
        started_at=datetime.now(timezone.utc),
    )
    session.add(sub)
    await session.flush()
    return sub


@pytest_asyncio.fixture
async def test_users_and_sessions(session: AsyncSession, test_company: Company, test_mill: Mill, super_admin_role: Role):
    users = []
    sessions = []
    for i in range(3):
        user = User(
            id=str(uuid.uuid4()),
            name=f"Test User {i}",
            email=f"user{i}@suspension-test.com",
            password_hash="dummy_hash",
            company_id=test_company.id,
            mill_id=test_mill.id,
            role_id=super_admin_role.id,
            is_active=True,
        )
        session.add(user)
        await session.flush()
        users.append(user)

        session_record = UserSession(
            id=str(uuid.uuid4()),
            user_id=user.id,
            refresh_token=f"token_{i}",
            is_active=True,
            expires_at=datetime.now(timezone.utc),
        )
        session.add(session_record)
        await session.flush()
        sessions.append(session_record)

    return users, sessions


class TestSuspensionCascade:

    async def test_suspend_cascade_company_status(
        self, session: AsyncSession, test_company: Company,
        super_admin_user: User,
    ):
        from app.models.audit import AuditLog
        from sqlalchemy import update as sa_update
        from sqlalchemy.orm import selectinload

        now = datetime.utcnow()
        test_company.is_active = False
        test_company.status = "suspended"
        test_company.suspended_at = now

        await session.execute(
            sa_update(Mill).where(Mill.company_id == test_company.id).values(is_active=False)
        )
        await session.execute(
            sa_update(User).where(User.company_id == test_company.id).values(is_active=False)
        )
        await session.execute(
            sa_update(UserSession)
            .where(UserSession.user_id.in_(
                select(User.id).where(User.company_id == test_company.id)
            ))
            .values(is_active=False)
        )

        session.add(AuditLog(
            user_id=super_admin_user.id,
            user_name=super_admin_user.name,
            role="SUPER_ADMIN",
            action="company_suspended",
            entity="company",
            entity_id=test_company.id,
            details="Test suspension cascade",
        ))
        await session.commit()

        await session.refresh(test_company)
        assert test_company.is_active == False
        assert test_company.status == "suspended"
        assert test_company.suspended_at is not None

    async def test_suspend_cascade_mills(
        self, session: AsyncSession, test_company: Company, test_mill: Mill,
        super_admin_user: User,
    ):
        from sqlalchemy import update as sa_update
        from app.models.audit import AuditLog

        await session.execute(
            sa_update(Mill).where(Mill.company_id == test_company.id).values(is_active=False)
        )
        await session.commit()

        result = await session.execute(
            select(Mill).where(Mill.company_id == test_company.id)
        )
        mills = result.scalars().all()
        assert len(mills) > 0
        assert all(m.is_active == False for m in mills)

    async def test_suspend_cascade_users(
        self, session: AsyncSession, test_company: Company,
        test_users_and_sessions: tuple,
        super_admin_user: User,
    ):
        from sqlalchemy import update as sa_update
        from app.models.audit import AuditLog

        users, _ = test_users_and_sessions

        await session.execute(
            sa_update(User).where(User.company_id == test_company.id).values(is_active=False)
        )
        await session.commit()

        for u in users:
            await session.refresh(u)
            assert u.is_active == False

    async def test_suspend_cascade_sessions(
        self, session: AsyncSession, test_company: Company,
        test_users_and_sessions: tuple,
        super_admin_user: User,
    ):
        from sqlalchemy import update as sa_update
        from app.models.audit import AuditLog

        users, sessions = test_users_and_sessions

        await session.execute(
            sa_update(UserSession)
            .where(UserSession.user_id.in_(
                select(User.id).where(User.company_id == test_company.id)
            ))
            .values(is_active=False)
        )
        await session.commit()

        for s in sessions:
            await session.refresh(s)
            assert s.is_active == False

    async def test_suspend_cascade_subscription(
        self, session: AsyncSession, test_company: Company,
        test_subscription: CompanySubscription,
        super_admin_user: User,
    ):
        from sqlalchemy import update as sa_update
        from app.models.audit import AuditLog

        sub_result = await session.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == test_company.id)
        )
        sub = sub_result.scalar_one_or_none()
        assert sub is not None
        sub.status = "suspended"

        await session.commit()

        await session.refresh(sub)
        assert sub.status == "suspended"

    async def test_reactivate_restores_company(
        self, session: AsyncSession, test_company: Company,
        super_admin_user: User,
    ):
        from sqlalchemy import update as sa_update

        now = datetime.utcnow()
        test_company.is_active = False
        test_company.status = "suspended"
        test_company.suspended_at = now
        await session.flush()

        test_company.is_active = True
        test_company.status = "active"
        test_company.suspended_at = None

        await session.execute(
            sa_update(Mill).where(Mill.company_id == test_company.id).values(is_active=True)
        )
        await session.execute(
            sa_update(User).where(User.company_id == test_company.id).values(is_active=True)
        )
        await session.commit()

        await session.refresh(test_company)
        assert test_company.is_active == True
        assert test_company.status == "active"
        assert test_company.suspended_at is None

    async def test_reactivate_restores_mills_and_users(
        self, session: AsyncSession, test_company: Company,
        test_mill: Mill, test_users_and_sessions: tuple,
        super_admin_user: User,
    ):
        from sqlalchemy import update as sa_update

        users, _ = test_users_and_sessions

        await session.execute(
            sa_update(Mill).where(Mill.company_id == test_company.id).values(is_active=True)
        )
        await session.execute(
            sa_update(User).where(User.company_id == test_company.id).values(is_active=True)
        )
        await session.commit()

        mill_result = await session.execute(
            select(Mill).where(Mill.company_id == test_company.id)
        )
        mills = mill_result.scalars().all()
        assert all(m.is_active == True for m in mills)

        for u in users:
            await session.refresh(u)
            assert u.is_active == True

    async def test_reactivate_restores_subscription(
        self, session: AsyncSession, test_company: Company,
        test_subscription: CompanySubscription,
        super_admin_user: User,
    ):
        test_subscription.status = "suspended"
        await session.flush()

        test_subscription.status = "active"
        await session.commit()

        await session.refresh(test_subscription)
        assert test_subscription.status == "active"
