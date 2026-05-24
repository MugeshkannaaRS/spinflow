from fastapi import APIRouter, Depends, HTTPException, Query, status, Header, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from typing import Optional, Annotated
from datetime import datetime, timezone, timedelta
import random
import string
import re

from app.db.session import get_db
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token, verify_and_refresh
from app.core.deps import get_current_user, log_audit, require_module
from app.core.config import settings
from app.core.error_handler import SpinFlowException, ErrorCode
from app.core.email import send_otp_email
from app.core.limiter import limiter
from app.models.user import User, Role, UserSession
from app.schemas.auth import (
    LoginRequest, LoginResponse, TokenResponse, RefreshRequest,
    UserResponse, ChangePasswordRequest, ForgotPasswordRequest,
    ResetPasswordRequest, VerifyOTPRequest, UserCreateRequest, UserUpdateRequest,
    MeResponse, MillSettingsOut, CompanyInfo,
)
from app.models.masters import Company, CompanyModule, MillSettings
from pydantic import BaseModel, Field

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 30

router = APIRouter()


class ForceChangePasswordRequest(BaseModel):
    user_id: str
    new_password: str = Field(..., min_length=8)


@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit("100/minute")
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()], request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).options(selectinload(User.role_rel)).where(
            or_(User.email == form_data.username, User.name == form_data.username),
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
                user.failed_login_attempts = 0
                await db.commit()
                raise SpinFlowException(
                    status_code=423,
                    code=ErrorCode.ACCOUNT_LOCKED,
                    message=f"Account locked after {MAX_FAILED_ATTEMPTS} failed attempts. Try again in {LOCKOUT_MINUTES} minutes.",
                )
            await db.commit()
        raise SpinFlowException(
            status_code=401,
            code=ErrorCode.INVALID_CREDENTIALS,
            message="Invalid username or password",
        )

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise SpinFlowException(
            status_code=423,
            code=ErrorCode.ACCOUNT_LOCKED,
            message=f"Account locked. Try again after {user.locked_until.strftime('%H:%M UTC')}",
        )

    if not user.is_active:
        raise SpinFlowException(
            status_code=423,
            code=ErrorCode.ACCOUNT_LOCKED,
            message="Account is inactive",
        )

    if user.must_change_password:
        raise SpinFlowException(
            status_code=403,
            code=ErrorCode.INSUFFICIENT_PERMISSIONS,
            message="Password reset required before login",
            detail={"must_change_password": True, "user_id": str(user.id)},
        )

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    role_code = user.role_rel.code if user.role_rel else "UNKNOWN"
    access_token = create_access_token(user.id, role_code)
    refresh_token = create_refresh_token(user.id, role_code)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(session)
    await db.flush()
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, user.id, role_code, "login", "auth", user.id, "User logged in", ip_address=client_ip)
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            role=role_code,
            role_name=user.role_rel.name if user.role_rel else role_code,
            department=user.department,
            mill_id=user.mill_id,
            mill_name=user.mill_name,
            company_id=user.company_id,
            is_active=user.is_active,
            last_login=user.last_login,
        ),
    )


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    result = verify_and_refresh(req.refresh_token)
    if not result:
        raise SpinFlowException(
            status_code=401,
            code=ErrorCode.TOKEN_INVALID,
            message="Invalid or expired refresh token",
        )
    new_access, new_refresh, payload = result
    session_result = await db.execute(
        select(UserSession).where(UserSession.refresh_token == req.refresh_token, UserSession.is_active == True)
    )
    session = session_result.scalar_one_or_none()
    if session:
        session.is_active = False
        new_expires = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        new_session = UserSession(
            user_id=payload["user_id"],
            refresh_token=new_refresh,
            is_active=True,
            expires_at=new_expires,
        )
        db.add(new_session)
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/auth/logout")
async def logout(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(UserSession).where(UserSession.user_id == current_user.id, UserSession.is_active == True)
    )
    sessions = result.scalars().all()
    for s in sessions:
        s.is_active = False
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(db, current_user.id, role_code, "logout", "auth", current_user.id, "User logged out")
    return {"message": "Logged out successfully"}


@router.get("/auth/me", response_model=MeResponse)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"

    allowed_modules = []
    if current_user.company_id:
        result = await db.execute(
            select(CompanyModule.module_name).where(
                CompanyModule.company_id == current_user.company_id,
                CompanyModule.is_enabled == True,
            )
        )
        allowed_modules = [row[0] for row in result.all()]

    mill_settings = None
    if current_user.mill_id:
        result = await db.execute(
            select(MillSettings).where(MillSettings.mill_id == current_user.mill_id)
        )
        mill_settings_row = result.scalar_one_or_none()
        if mill_settings_row:
            mill_settings = MillSettingsOut.model_validate(mill_settings_row)

    company_info = None
    if current_user.company_id:
        result = await db.execute(
            select(Company).where(Company.id == current_user.company_id)
        )
        company = result.scalar_one_or_none()
        if company:
            count_result = await db.execute(
                select(func.count(User.id)).where(
                    User.company_id == current_user.company_id,
                    User.deleted_at.is_(None),
                )
            )
            user_count = count_result.scalar() or 0
            company_info = CompanyInfo(
                name=company.name,
                max_users=company.max_users,
                current_user_count=user_count,
            )

    return MeResponse(
        user=UserResponse(
            id=current_user.id,
            name=current_user.name,
            email=current_user.email,
            role=role_code,
            role_name=current_user.role_rel.name if current_user.role_rel else role_code,
            department=current_user.department,
            mill_id=current_user.mill_id,
            mill_name=current_user.mill_name,
            company_id=current_user.company_id,
            is_active=current_user.is_active,
            last_login=current_user.last_login,
        ),
        allowed_modules=allowed_modules,
        mill_settings=mill_settings,
        company=company_info,
    )


@router.post("/auth/change-password")
async def change_password(
    req: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(req.current_password, current_user.password_hash):
        raise SpinFlowException.bad_request("Current password is incorrect", ErrorCode.INVALID_VALUE)
    current_user.password_hash = hash_password(req.new_password)
    await db.flush()
    return {"message": "Password changed successfully"}


@router.post("/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(req: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if user:
        otp = "".join(random.choices(string.digits, k=6))
        user.force_password_reset = True
        user.otp_code = otp
        user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        await db.flush()
        try:
            await send_otp_email(to=user.email, full_name=user.name, otp_code=otp, otp_type="password_reset")
        except SpinFlowException:
            logger = __import__("logging").getLogger("spinflow")
            logger.exception("Failed to send OTP email to %s", user.email)
    return {"message": "If email exists, OTP will be sent"}


@router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.token)
    if not payload:
        raise SpinFlowException(
            status_code=400,
            code=ErrorCode.TOKEN_INVALID,
            message="Invalid or expired token",
        )
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if not user:
        raise SpinFlowException.not_found("User")
    user.password_hash = hash_password(req.new_password)
    user.force_password_reset = False
    await db.flush()
    return {"message": "Password reset successfully"}


@router.get("/auth/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    stmt = select(User).where(User.deleted_at.is_(None))
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    users = result.scalars().all()
    resp = []
    for u in users:
        role_code = u.role_rel.code if u.role_rel else "UNKNOWN"
        resp.append(UserResponse(
            id=u.id,
            name=u.name,
            email=u.email,
            role=role_code,
            role_name=u.role_rel.name if u.role_rel else role_code,
            department=u.department,
            mill_id=u.mill_id,
            mill_name=u.mill_name,
            company_id=u.company_id,
            is_active=u.is_active,
            last_login=u.last_login,
        ))
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": resp,
    }


@router.post("/auth/users", response_model=UserResponse)
async def create_user(
    req: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await db.execute(select(User).where(User.email == req.email, User.deleted_at.is_(None)))
    if existing.scalar_one_or_none():
        raise SpinFlowException.bad_request("Email already exists", ErrorCode.ALREADY_EXISTS)
    role_result = await db.execute(select(Role).where(Role.code == req.role))
    role = role_result.scalar_one_or_none()
    if not role:
        raise SpinFlowException.bad_request("Invalid role", ErrorCode.INVALID_VALUE)
    user = User(
        name=req.name,
        email=req.email,
        password_hash=hash_password(req.password),
        role_id=role.id,
        department=req.department,
        mill_id=req.mill_id,
        mill_name=req.mill_name,
        phone=req.phone,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    role_code = user.role_rel.code if user.role_rel else role.code
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=role_code,
        role_name=user.role_rel.name if user.role_rel else role_code,
        department=user.department,
        mill_id=user.mill_id,
        mill_name=user.mill_name,
        company_id=user.company_id,
        is_active=user.is_active,
        last_login=user.last_login,
    )


@router.post("/auth/force-change-password", response_model=LoginResponse)
async def force_change_password(
    req: ForceChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    if len(req.new_password) < 8:
        raise SpinFlowException.bad_request("Password must be at least 8 characters", ErrorCode.INVALID_VALUE)
    if not re.search(r"[A-Z]", req.new_password):
        raise SpinFlowException.bad_request("Password must contain at least one uppercase letter", ErrorCode.INVALID_VALUE)
    if not re.search(r"\d", req.new_password):
        raise SpinFlowException.bad_request("Password must contain at least one digit", ErrorCode.INVALID_VALUE)
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\';/`~]", req.new_password):
        raise SpinFlowException.bad_request("Password must contain at least one special character", ErrorCode.INVALID_VALUE)

    result = await db.execute(select(User).where(User.id == req.user_id, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if not user:
        raise SpinFlowException.not_found("User")
    if not user.must_change_password:
        raise SpinFlowException.bad_request("Password change is not required", ErrorCode.INVALID_VALUE)

    user.password_hash = hash_password(req.new_password)
    user.must_change_password = False
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    role_code = user.role_rel.code if user.role_rel else "UNKNOWN"
    access_token = create_access_token(user.id, role_code)
    refresh_token = create_refresh_token(user.id, role_code)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(session)
    await db.flush()
    client_ip = "0.0.0.0"
    await log_audit(db, user.id, role_code, "force_change_password", "auth", user.id, "Password changed via force change", ip_address=client_ip)
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            role=role_code,
            role_name=user.role_rel.name if user.role_rel else role_code,
            department=user.department,
            mill_id=user.mill_id,
            mill_name=user.mill_name,
            company_id=user.company_id,
            is_active=user.is_active,
            last_login=user.last_login,
        ),
    )
