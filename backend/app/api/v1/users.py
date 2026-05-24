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
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    scope = await get_mill_scope(current_user)
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
    existing = await db.execute(select(User).where(User.email == req.email, User.deleted_at.is_(None)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")
    role_result = await db.execute(select(Role).where(Role.code == req.role))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role: {req.role}")

    # Resolve mill_id and company_id
    mill_id = req.mill_id or current_user.mill_id
    company_id = current_user.company_id

    if mill_id:
        mill_result = await db.execute(select(Mill).where(Mill.id == mill_id))
        mill = mill_result.scalar_one_or_none()
        if not mill:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mill not found")
        company_id = mill.company_id

        # If current user is MILL_OWNER, validate mill belongs to their company
        current_role = current_user.role
        if current_role == "MILL_OWNER" and mill.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mill does not belong to your company")

    # Check user limit for company
    if company_id:
        company_result = await db.execute(select(Company).where(Company.id == company_id))
        company = company_result.scalar_one_or_none()
        if company and company.max_users:
            count_result = await db.execute(
                select(func.count()).where(
                    User.company_id == company_id,
                    User.deleted_at.is_(None),
                    User.is_active == True,
                )
            )
            active_count = count_result.scalar() or 0
            if active_count >= company.max_users:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"User limit reached ({active_count}/{company.max_users}). Contact your administrator.",
                )

    user = User(
        name=req.full_name,
        email=req.email,
        password_hash=hash_password(req.password),
        role_id=role.id,
        department=req.department,
        phone=req.mobile,
        mill_id=mill_id,
        company_id=company_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    role_code = user.role_rel.code if user.role_rel else role.code
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
    result = await db.execute(select(User).options(selectinload(User.role_rel)).where(User.id == user_id, User.deleted_at.is_(None)))
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
    result = await db.execute(select(User).options(selectinload(User.role_rel)).where(User.id == user_id, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = not user.is_active
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


@router.patch("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    req: UserResetPassword,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users", write=True)),
):
    result = await db.execute(select(User).options(selectinload(User.role_rel)).where(User.id == user_id, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.password_hash = hash_password(req.new_password)
    user.must_change_password = True
    await db.flush()
    return {"message": "Password reset successfully"}
