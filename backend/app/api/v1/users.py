from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.core.security import hash_password
from app.models.user import User, Role
from app.models.masters import Company, Mill
from app.schemas.users import UserCreate, UserOut, UserUpdate, UserListResponse, PasswordChange, UserResetPassword
from sqlalchemy.orm import selectinload

router = APIRouter()


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(User).options(selectinload(User.role_rel)).where(User.deleted_at.is_(None))
    if scope["mill_id"] is None and scope["company_id"] is None:
        pass  # SUPER_ADMIN sees all
    elif scope["company_id"]:
        mill_ids_subq = select(Mill.id).where(Mill.company_id == scope["company_id"])
        stmt = stmt.where(User.mill_id.in_(mill_ids_subq))
    elif scope["mill_id"]:
        stmt = stmt.where(User.mill_id == scope["mill_id"])
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    users = result.scalars().all()
    resp = []
    for u in users:
        role_code = u.role_rel.code if u.role_rel else "UNKNOWN"
        resp.append(UserOut(
            id=u.id,
            full_name=u.name,
            email=u.email,
            mobile=u.phone,
            role=role_code,
            department=u.department,
            is_active=u.is_active,
            is_verified=False,
            last_login=u.last_login,
            created_at=u.created_at,
        ))
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": resp,
    }


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    req: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    creator_role = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")

    # MILL_OWNER cannot create SUPER_ADMIN or other MILL_OWNER accounts
    RESTRICTED_ROLES = {"SUPER_ADMIN", "MILL_OWNER"}
    if creator_role == "MILL_OWNER" and req.role in RESTRICTED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Mill Owner cannot create '{req.role}' users",
        )

    # Require mill_id for non-owner roles
    if req.role not in ("SUPER_ADMIN", "MILL_OWNER") and not req.mill_id:
        raise HTTPException(status_code=400, detail="mill_id is required for this role")

    existing = await db.execute(select(User).where(User.email == req.email, User.deleted_at.is_(None)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")
    role_result = await db.execute(select(Role).where(Role.code == req.role))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role: {req.role}")

    # Resolve mill_id and company_id
    mill_id = req.mill_id or scope.get("mill_id")
    company_id = req.company_id or current_user.company_id

    if mill_id:
        mill_result = await db.execute(select(Mill).where(Mill.id == mill_id))
        mill = mill_result.scalar_one_or_none()
        if not mill:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mill not found")
        company_id = mill.company_id
        mill_name = mill.name

        # Validate mill belongs to creator's company scope
        if scope.get("company_id") and mill.company_id != scope["company_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mill does not belong to your company")
    else:
        mill_name = None

    # Check user limit — single source: Company.max_users
    if company_id:
        count_result = await db.execute(
            select(func.count(User.id)).where(
                User.company_id == company_id,
                User.deleted_at.is_(None),
                User.is_active == True,
            )
        )
        active_count = int(count_result.scalar() or 0)

        company_result = await db.execute(
            select(Company).where(Company.id == company_id).with_for_update()
        )
        company = company_result.scalar_one_or_none()
        if company and company.is_active is False:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create users for an inactive or suspended company")

        max_users = getattr(company, 'max_users', 50) or 50
        if active_count >= max_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User limit reached ({active_count}/{max_users}). Upgrade your plan to add more users.",
            )

    user = User(
        name=req.full_name,
        email=req.email,
        password_hash=hash_password(req.password),
        role_id=role.id,
        department=req.department,
        phone=req.mobile,
        mill_id=mill_id,
        mill_name=mill_name,
        company_id=company_id,
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    await db.flush()
    role_code = role.code
    return UserOut(
        id=user.id,
        full_name=user.name,
        email=user.email,
        mobile=user.phone,
        role=role_code,
        department=user.department,
        is_active=user.is_active,
        is_verified=False,
        last_login=user.last_login,
        created_at=user.created_at,
    )


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    req: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(User).options(selectinload(User.role_rel)).where(User.id == user_id, User.deleted_at.is_(None))
    if scope["mill_id"]:
        stmt = stmt.where(User.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        mill_ids_subq = select(Mill.id).where(Mill.company_id == scope["company_id"])
        stmt = stmt.where(User.mill_id.in_(mill_ids_subq))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if req.full_name is not None:
        user.name = req.full_name
    if req.department is not None:
        user.department = req.department
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.mobile is not None:
        user.phone = req.mobile
    if req.role is not None:
        role_result = await db.execute(select(Role).where(Role.code == req.role))
        role = role_result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
        user.role_id = role.id
    if req.email is not None:
        user.email = req.email
    await db.flush()
    role_code = user.role_rel.code if user.role_rel else "UNKNOWN"
    return UserOut(
        id=user.id,
        full_name=user.name,
        email=user.email,
        mobile=user.phone,
        role=role_code,
        department=user.department,
        is_active=user.is_active,
        is_verified=False,
        last_login=user.last_login,
        created_at=user.created_at,
    )


@router.patch("/users/{user_id}/deactivate", response_model=UserOut)
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(User).options(selectinload(User.role_rel)).where(User.id == user_id, User.deleted_at.is_(None))
    if scope["mill_id"]:
        stmt = stmt.where(User.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        mill_ids_subq = select(Mill.id).where(Mill.company_id == scope["company_id"])
        stmt = stmt.where(User.mill_id.in_(mill_ids_subq))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = not user.is_active
    was_active = user.is_active
    await db.flush()
    role_code = user.role_rel.code if user.role_rel else "UNKNOWN"
    action_str = "user_deactivated" if was_active else "user_activated"
    await log_audit(
        db, current_user.id, current_user.role_rel.code if current_user.role_rel else "UNKNOWN",
        action_str, "user", user.id,
        f"User {user.name} ({user.email}) {'deactivated' if was_active else 'activated'} by {current_user.name}",
    )
    return UserOut(
        id=user.id,
        full_name=user.name,
        email=user.email,
        mobile=user.phone,
        role=role_code,
        department=user.department,
        is_active=user.is_active,
        is_verified=False,
        last_login=user.last_login,
        created_at=user.created_at,
    )


@router.patch("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    req: UserResetPassword,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(User).options(selectinload(User.role_rel)).where(User.id == user_id, User.deleted_at.is_(None))
    if scope["mill_id"]:
        stmt = stmt.where(User.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        mill_ids_subq = select(Mill.id).where(Mill.company_id == scope["company_id"])
        stmt = stmt.where(User.mill_id.in_(mill_ids_subq))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.password_hash = hash_password(req.new_password)
    user.must_change_password = True
    await db.flush()
    return {"message": "Password reset successfully"}
