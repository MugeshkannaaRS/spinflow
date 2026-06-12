import uuid
import pytest
from datetime import datetime, timezone, timedelta
from app.core.error_handler import SpinFlowException, ErrorCode
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.models.user import User

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 30


async def _simulate_login(db: AsyncSession, user: User, password: str) -> User:
    """Simulate the login logic from auth.py without issuing tokens."""
    result = await db.execute(
        select(User).where(
            or_(User.email == user.email, User.name == user.name),
            User.deleted_at.is_(None),
        )
    )
    found = result.scalar_one_or_none()

    if not found or not verify_password(password, found.password_hash):
        if found:
            found.failed_login_attempts = (found.failed_login_attempts or 0) + 1
            if found.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
                found.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
                found.failed_login_attempts = 0
                await db.flush()
                raise SpinFlowException(
                    status_code=423,
                    code=ErrorCode.ACCOUNT_LOCKED,
                    message=f"Account locked after {MAX_FAILED_ATTEMPTS} failed attempts. Try again in {LOCKOUT_MINUTES} minutes.",
                )
            await db.flush()
        raise SpinFlowException(
            status_code=401,
            code=ErrorCode.INVALID_CREDENTIALS,
            message="Invalid username or password",
        )

    if found.locked_until and found.locked_until > datetime.now(timezone.utc):
        raise SpinFlowException(
            status_code=423,
            code=ErrorCode.ACCOUNT_LOCKED,
            message=f"Account locked. Try again after {found.locked_until.strftime('%H:%M UTC')}",
        )

    if found.must_change_password:
        raise SpinFlowException(
            status_code=403,
            code=ErrorCode.INSUFFICIENT_PERMISSIONS,
            message="Password reset required before login",
            detail={"must_change_password": True, "user_id": str(found.id)},
        )

    found.failed_login_attempts = 0
    found.locked_until = None
    found.last_login = datetime.now(timezone.utc)
    await db.flush()
    return found


async def _simulate_force_change_password(db: AsyncSession, user_id: str, new_password: str) -> User:
    """Simulate the force-change-password logic."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise SpinFlowException.not_found("User")
    if not user.must_change_password:
        raise SpinFlowException.bad_request("Password change is not required", ErrorCode.INVALID_VALUE)

    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.now(timezone.utc)
    await db.flush()
    return user


class TestLoginLockout:
    @pytest.fixture
    async def test_user(self, session: AsyncSession, roles: dict) -> User:
        pw = hash_password("CorrectP@ss1")
        user = User(
            id=str(uuid.uuid4()),
            name="logintest",
            email="logintest@test.com",
            password_hash=pw,
            role_id=roles["machine_operator"].id,
            is_active=True,
            failed_login_attempts=0,
            locked_until=None,
            must_change_password=False,
        )
        session.add(user)
        await session.flush()
        return user

    async def test_failed_login_increments_counter(self, session: AsyncSession, test_user: User):
        for i in range(3):
            try:
                await _simulate_login(session, test_user, "WrongP@ss1")
            except SpinFlowException:
                pass
            await session.refresh(test_user)
        assert test_user.failed_login_attempts == 3
        assert test_user.locked_until is None

    async def test_fifth_failed_login_locks_account(self, session: AsyncSession, test_user: User):
        for i in range(5):
            try:
                await _simulate_login(session, test_user, "WrongP@ss1")
            except SpinFlowException:
                pass
            await session.refresh(test_user)
        assert test_user.locked_until is not None
        locked = test_user.locked_until
        if locked.tzinfo is None:
            locked = locked.replace(tzinfo=timezone.utc)
        assert locked > datetime.now(timezone.utc)
        assert test_user.failed_login_attempts == 0

    async def test_locked_account_rejected_before_expiry(self, session: AsyncSession, test_user: User):
        test_user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=25)
        await session.flush()
        with pytest.raises(SpinFlowException) as exc:
            await _simulate_login(session, test_user, "CorrectP@ss1")
        assert exc.value.code == ErrorCode.ACCOUNT_LOCKED
        assert exc.value.status_code == 423

    async def test_successful_login_resets_counter(self, session: AsyncSession, test_user: User):
        test_user.failed_login_attempts = 3
        await session.flush()
        result = await _simulate_login(session, test_user, "CorrectP@ss1")
        assert result.failed_login_attempts == 0
        assert result.locked_until is None

    async def test_must_change_password_blocks_token_issue(self, session: AsyncSession, test_user: User):
        test_user.must_change_password = True
        await session.flush()
        with pytest.raises(SpinFlowException) as exc:
            await _simulate_login(session, test_user, "CorrectP@ss1")
        assert exc.value.status_code == 403
        assert exc.value.detail is not None
        assert exc.value.detail.get("must_change_password") is True

    async def test_force_change_password_clears_flag(self, session: AsyncSession, test_user: User):
        test_user.must_change_password = True
        await session.flush()
        result = await _simulate_force_change_password(session, test_user.id, "NewStr0ng!Pass")
        await session.refresh(result)
        assert result.must_change_password is False
