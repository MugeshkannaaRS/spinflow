import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status, Header, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from typing import Optional, Annotated
from datetime import datetime, timezone, timedelta
import random
import string
import re

logger = logging.getLogger(__name__)

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


def _set_refresh_cookie(response: Response, token: str) -> None:
    secure = not settings.DEBUG
    response.set_cookie(
        key="refresh_token",
        value=token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/api/v1/auth/refresh",
    )
from app.models.masters import Company, CompanyModule, MillSettings, Mill
from app.models.ui_config import ColumnConfig
from pydantic import BaseModel, Field

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 30

router = APIRouter()


class ForceChangePasswordRequest(BaseModel):
    user_id: str
    new_password: str = Field(..., min_length=8)


@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()], request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(User).options(selectinload(User.role_rel)).where(
                or_(User.email == form_data.username, User.name == form_data.username),
                User.deleted_at.is_(None),
            )
        )
        user = result.scalar_one_or_none()
    except Exception as e:
        logger.exception("Login DB error")
        raise HTTPException(status_code=500, detail="Login failed. Please try again.")

    if not user or not verify_password(form_data.password, user.password_hash):
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
        if user:
            await log_audit(db, user.id, user.role_rel.code if user.role_rel else "UNKNOWN", "failed_login", "auth", user.id, "Failed login attempt", ip_address=client_ip)
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
        else:
            await log_audit(db, None, "UNKNOWN", "failed_login", "auth", "", "Failed login attempt for unknown email", ip_address=client_ip)
        raise SpinFlowException(
            status_code=401,
            code=ErrorCode.INVALID_CREDENTIALS,
            message="Invalid username or password",
        )

    try:
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

        if user.company_id:
            company = await db.get(Company, user.company_id)
            if company and company.status == "suspended":
                raise SpinFlowException(
                    status_code=423,
                    code=ErrorCode.ACCOUNT_LOCKED,
                    message="Company account is suspended. Contact SpinFlow support.",
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

        # Fetch enabled modules for this company
        enabled_modules: list[str] = []
        if user.company_id:
            mods_result = await db.execute(
                select(CompanyModule.module_name)
                .where(
                    CompanyModule.company_id == str(user.company_id),
                    CompanyModule.is_enabled == True,
                )
            )
            enabled_modules = [r[0] for r in mods_result.all()]
        else:
            enabled_modules = ["all"]

        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
        await log_audit(db, user.id, role_code, "login", "auth", user.id, "User logged in", ip_address=client_ip)
        _set_refresh_cookie(response, refresh_token)
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
                must_change_password=user.must_change_password,
                enabled_modules=enabled_modules,
            ),
        )
    except SpinFlowException:
        raise
    except Exception as e:
        logger.exception("Login post-auth error")
        raise HTTPException(status_code=500, detail="Login failed. Please try again.")


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, req: Optional[RefreshRequest] = None, body: Optional[dict] = None, db: AsyncSession = Depends(get_db)):
    # Read refresh token: cookie first, then body (backward compat)
    token = request.cookies.get("refresh_token")
    if not token and req:
        token = req.refresh_token
    if not token:
        raise SpinFlowException(
            status_code=401,
            code=ErrorCode.TOKEN_INVALID,
            message="No refresh token provided",
        )
    result = verify_and_refresh(token)
    if not result:
        raise SpinFlowException(
            status_code=401,
            code=ErrorCode.TOKEN_INVALID,
            message="Invalid or expired refresh token",
        )
    new_access, new_refresh, payload = result
    session_result = await db.execute(
        select(UserSession).where(UserSession.refresh_token == token, UserSession.is_active == True)
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
    _set_refresh_cookie(response, new_refresh)
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


@router.get("/auth/me")
async def get_me(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        role_code = current_user.role_rel.code if current_user.role_rel else "MACHINE_OPERATOR"

        # Get fresh mill name from mills table (not from users.mill_name)
        mill_name = current_user.mill_name
        if current_user.mill_id:
            mill_result = await db.execute(select(Mill).where(Mill.id == current_user.mill_id))
            mill = mill_result.scalar_one_or_none()
            if mill:
                mill_name = mill.name
                # Auto-fix stale mill_name in users table
                if current_user.mill_name != mill.name:
                    current_user.mill_name = mill.name
                    await db.commit()

        # Get all mills in user's company (for mill switcher)
        company_mills = []
        if current_user.company_id:
            mills_result = await db.execute(
                select(Mill).where(Mill.company_id == current_user.company_id, Mill.is_active == True).order_by(Mill.name)
            )
            company_mills = [
                {"id": str(m.id), "name": m.name, "code": m.code or ""}
                for m in mills_result.scalars().all()
            ]

        # Fetch enabled modules for this company
        enabled_modules: list[str] = []
        if current_user.company_id:
            mods_result = await db.execute(
                select(CompanyModule.module_name)
                .where(
                    CompanyModule.company_id == str(current_user.company_id),
                    CompanyModule.is_enabled == True,
                )
            )
            enabled_modules = [r[0] for r in mods_result.all()]
        else:
            enabled_modules = ["all"]

        return {
            "id": str(current_user.id),
            "name": current_user.name,
            "email": current_user.email,
            "role": role_code,
            "mill_id": str(current_user.mill_id) if current_user.mill_id else None,
            "company_id": str(current_user.company_id) if current_user.company_id else None,
            "mill_name": mill_name,
            "company_mills": company_mills,
            "must_change_password": current_user.must_change_password,
            "module_restrictions": current_user.get_module_restrictions(),
            "enabled_modules": enabled_modules,
        }

    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.post("/auth/change-password")
async def change_password(
    req: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        if not verify_password(req.current_password, current_user.password_hash):
            raise SpinFlowException.bad_request("Current password is incorrect", ErrorCode.INVALID_VALUE)

        if len(req.new_password) < 6:
            raise SpinFlowException.bad_request("New password must be at least 6 characters", ErrorCode.INVALID_VALUE)

        current_user.password_hash = hash_password(req.new_password)
        current_user.must_change_password = False
        current_user.updated_at = datetime.now(timezone.utc)
        await db.commit()

        return {"success": True, "message": "Password changed successfully"}

    except SpinFlowException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


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
    stmt = select(User).options(selectinload(User.role_rel)).where(User.deleted_at.is_(None))
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
    current_user: User = Depends(require_module("users", write=True)),
):
    requester_role = current_user.role_rel.code if current_user.role_rel else ""
    company_id = current_user.company_id
    if requester_role == "SUPER_ADMIN":
        company_id = req.company_id or company_id
    if not company_id:
        raise SpinFlowException.bad_request("Cannot determine company for new user", ErrorCode.INVALID_VALUE)
    existing = await db.execute(select(User).where(User.email == req.email, User.deleted_at.is_(None)))
    if existing.scalar_one_or_none():
        raise SpinFlowException.bad_request("Email already exists", ErrorCode.ALREADY_EXISTS)
    role_result = await db.execute(select(Role).where(Role.code == req.role))
    role = role_result.scalar_one_or_none()
    if not role:
        raise SpinFlowException.bad_request("Invalid role", ErrorCode.INVALID_VALUE)
    user_count_result = await db.execute(
        select(func.count(User.id)).where(
            User.company_id == company_id,
            User.is_active == True,
        )
    )
    current_count = user_count_result.scalar() or 0
    company = await db.get(Company, company_id)
    max_users = getattr(company, "max_users", 10) or 10
    if current_count >= max_users:
        raise HTTPException(status_code=403, detail=f"User limit reached ({current_count}/{max_users}). Upgrade your plan to add more users.")
    user = User(
        name=req.name,
        email=req.email,
        password_hash=hash_password(req.password),
        role_id=role.id,
        department=req.department,
        mill_id=req.mill_id,
        mill_name=req.mill_name,
        phone=req.phone,
        company_id=company_id,
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
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise SpinFlowException.forbidden("Only admins can force change passwords", ErrorCode.ACCESS_DENIED)
    if len(req.new_password) < 8:
        raise SpinFlowException.bad_request("Password must be at least 8 characters", ErrorCode.INVALID_VALUE)
    if not re.search(r"[A-Z]", req.new_password):
        raise SpinFlowException.bad_request("Password must contain at least one uppercase letter", ErrorCode.INVALID_VALUE)
    if not re.search(r"\d", req.new_password):
        raise SpinFlowException.bad_request("Password must contain at least one digit", ErrorCode.INVALID_VALUE)
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\';/`~]", req.new_password):
        raise SpinFlowException.bad_request("Password must contain at least one special character", ErrorCode.INVALID_VALUE)

    # Only the user themself or a SUPER_ADMIN can force-change a password
    requester_role = current_user.role_rel.code if current_user.role_rel else ""
    if current_user.id != req.user_id and requester_role != "SUPER_ADMIN":
        raise SpinFlowException.forbidden("You can only change your own password unless you are a SUPER_ADMIN")

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
    _set_refresh_cookie(response, refresh_token)
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
            must_change_password=user.must_change_password,
        ),
    )
