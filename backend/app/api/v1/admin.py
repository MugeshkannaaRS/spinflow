import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Dict, Optional
from datetime import datetime
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

from app.db.session import get_db
from app.core.deps import get_current_user, get_mill_scope
from app.models.user import User, Role
from app.models.masters import Company, CompanyModule, Mill, MillSettings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()

ALL_MODULE_KEYS = [
    "dashboard", "production", "quality", "maintenance", "hr",
    "payroll", "purchase", "stores", "inventory", "dispatch",
    "lotrac", "accounts", "sales", "masters", "users", "reports",
]


@router.get("/admin/companies/{company_id}/modules")
async def get_company_modules(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        if current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can manage modules")
        result = await db.execute(
            select(CompanyModule).where(CompanyModule.company_id == company_id)
        )
        modules = result.scalars().all()
        module_map = {m.module_name: m.is_enabled for m in modules}
        return {mod: module_map.get(mod, False) for mod in ALL_MODULE_KEYS}
    except HTTPException:
        raise
    except Exception as e:
        return {mod: False for mod in ALL_MODULE_KEYS}


@router.put("/admin/companies/{company_id}/modules")
async def update_company_modules(
    company_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        if current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can manage modules")
        modules_data: Dict[str, bool] = body.get("modules")
        if modules_data is None:
            modules_data = {k: bool(v) for k, v in body.items() if k in ALL_MODULE_KEYS}
        for module_name, is_enabled in modules_data.items():
            existing = await db.execute(
                select(CompanyModule).where(
                    CompanyModule.company_id == company_id,
                    CompanyModule.module_name == module_name,
                )
            )
            record = existing.scalar_one_or_none()
            if record:
                record.is_enabled = bool(is_enabled)
            else:
                db.add(CompanyModule(
                    company_id=company_id,
                    module_name=module_name,
                    is_enabled=bool(is_enabled),
                    enabled_by=current_user.id,
                ))
        await db.commit()
        return {"saved": True}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/users/{user_id}/modules")
async def get_user_modules(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role_rel.code if current_user.role_rel else ""
    if role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN or MILL_OWNER can view modules")

    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    result = await db.execute(
        select(CompanyModule).where(CompanyModule.company_id == target_user.company_id)
    )
    modules = result.scalars().all()

    company = await db.get(Company, target_user.company_id)

    return {
        "user_id": user_id,
        "company_id": target_user.company_id,
        "company_name": company.name if company else "Unknown",
        "modules": {m.module_name: m.is_enabled for m in modules},
    }


@router.post("/admin/users")
async def create_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        body = await request.json()
        name = body.get("name")
        email = body.get("email")
        password = body.get("password")
        role_code = body.get("role_code", "MILL_OWNER")
        company_id = body.get("company_id")
        mill_id = body.get("mill_id")

        if not all([name, email, password, company_id]):
            raise HTTPException(400, "name, email, password, company_id are required")

        existing = await db.execute(
            select(User).where(User.email == email, User.deleted_at.is_(None))
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, f"Email {email} already exists")

        user_count = await db.execute(
            select(func.count(User.id)).where(
                User.company_id == company_id,
                User.is_active == True,
                User.deleted_at.is_(None)
            )
        )
        count = user_count.scalar() or 0
        company_result = await db.execute(select(Company).where(Company.id == company_id))
        company = company_result.scalar_one_or_none()
        max_users = getattr(company, 'max_users', 50) or 50
        if count >= max_users:
            raise HTTPException(403, f"User limit reached ({count}/{max_users}). Upgrade plan first.")

        role_result = await db.execute(select(Role).where(Role.code == role_code))
        role = role_result.scalar_one_or_none()
        if not role:
            raise HTTPException(400, f"Role {role_code} not found")

        mill_name = None
        if mill_id:
            mill_result = await db.execute(select(Mill).where(Mill.id == mill_id))
            mill = mill_result.scalar_one_or_none()
            mill_name = mill.name if mill else None

        new_user = User(
            id=str(uuid.uuid4()),
            name=name,
            email=email,
            password_hash=pwd_context.hash(password),
            role_id=role.id,
            company_id=company_id,
            mill_id=mill_id,
            mill_name=mill_name,
            is_active=True,
            must_change_password=True,
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        return {
            "id": str(new_user.id),
            "name": new_user.name,
            "email": new_user.email,
            "role": role_code,
            "mill_id": mill_id,
            "must_change_password": True,
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"admin create user error: {e}")
        raise HTTPException(500, detail=str(e))


@router.get("/admin/users")
async def list_all_users(
    company_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        query = select(User).where(User.deleted_at.is_(None))
        if company_id:
            query = query.where(User.company_id == company_id)
        query = query.order_by(User.created_at.desc())

        count_q = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_q)).scalar() or 0

        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        users = result.scalars().all()

        role_ids = [u.role_id for u in users if u.role_id]
        roles = {}
        if role_ids:
            roles_result = await db.execute(select(Role).where(Role.id.in_(role_ids)))
            roles = {r.id: r.code for r in roles_result.scalars().all()}

        return {
            "items": [
                {
                    "id": str(u.id),
                    "name": u.name,
                    "email": u.email,
                    "role": roles.get(u.role_id, "unknown"),
                    "company_id": str(u.company_id) if u.company_id else None,
                    "mill_id": str(u.mill_id) if u.mill_id else None,
                    "mill_name": u.mill_name,
                    "is_active": u.is_active,
                    "last_login": u.last_login.isoformat() if u.last_login else None,
                    "must_change_password": u.must_change_password,
                }
                for u in users
            ],
            "total": total,
            "page": page,
            "pages": -(-total // page_size) if page_size else 0,
        }
    except Exception as e:
        logger.error(f"admin list users error: {e}")
        return {"items": [], "total": 0, "page": 1, "pages": 0}


@router.patch("/admin/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        body = await request.json()
        new_password = body.get("password")
        if not new_password or len(new_password) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "User not found")

        user.password_hash = pwd_context.hash(new_password)
        user.must_change_password = True
        await db.commit()

        return {"reset": True, "must_change_password": True}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"admin reset password error: {e}")
        raise HTTPException(500, str(e))


@router.patch("/admin/companies/{company_id}/limits")
async def update_company_limits(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        body = await request.json()
        max_users = body.get("max_users")

        if max_users is None or int(max_users) < 1:
            raise HTTPException(400, "max_users must be at least 1")

        result = await db.execute(
            select(Company).where(Company.id == company_id)
        )
        company = result.scalar_one_or_none()
        if not company:
            raise HTTPException(404, "Company not found")

        company.max_users = int(max_users)
        await db.commit()

        return {"max_users": company.max_users, "updated": True}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, detail=str(e))


@router.patch("/admin/companies/{company_id}/suspend")
async def toggle_company_status(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await db.execute(
            select(Company).where(Company.id == company_id)
        )
        company = result.scalar_one_or_none()
        if not company:
            raise HTTPException(404, "Company not found")
        current = getattr(company, "is_active", True)
        company.is_active = not current
        await db.commit()
        status = "activated" if company.is_active else "suspended"
        return {"status": status, "is_active": company.is_active}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"admin.companies suspend error: {e}")
        try:
            from sqlalchemy import text
            await db.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE"))
            await db.commit()
            result = await db.execute(select(Company).where(Company.id == company_id))
            company = result.scalar_one_or_none()
            if company:
                company.is_active = not getattr(company, "is_active", True)
                await db.commit()
                return {"status": "activated" if company.is_active else "suspended", "is_active": company.is_active}
        except Exception as e2:
            logger.error(f"admin.companies suspend fallback also failed: {e2}")
            await db.rollback()
        raise HTTPException(500, detail=str(e))


@router.get("/admin/mills/{mill_id}/settings")
async def get_mill_settings(
    mill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await db.execute(
            select(MillSettings).where(MillSettings.mill_id == mill_id)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            return {
                "working_hours_per_day": 8,
                "shifts_per_day": 3,
                "production_target_kg": 0,
                "currency": "INR",
                "timezone": "Asia/Kolkata",
            }
        return {
            "working_hours_per_day": settings.working_hours_per_day,
            "shifts_per_day": settings.shifts_per_day,
            "production_target_kg": settings.production_target_kg,
            "currency": settings.currency,
            "timezone": settings.timezone,
        }
    except Exception as e:
        logger.error(f"admin.mill_settings get error: {e}")
        return {
            "working_hours_per_day": 8,
            "shifts_per_day": 3,
            "production_target_kg": 0,
            "currency": "INR",
            "timezone": "Asia/Kolkata",
        }


@router.put("/admin/mills/{mill_id}/settings")
async def update_mill_settings(
    mill_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await db.execute(
            select(MillSettings).where(MillSettings.mill_id == mill_id)
        )
        settings = result.scalar_one_or_none()
        if settings:
            if "working_hours_per_day" in body:
                settings.working_hours_per_day = body["working_hours_per_day"]
            if "shifts_per_day" in body:
                settings.shifts_per_day = body["shifts_per_day"]
            if "production_target_kg" in body:
                settings.production_target_kg = body["production_target_kg"]
            if "currency" in body:
                settings.currency = body["currency"]
            if "timezone" in body:
                settings.timezone = body["timezone"]
        else:
            settings = MillSettings(
                mill_id=mill_id,
                working_hours_per_day=body.get("working_hours_per_day", 8),
                shifts_per_day=body.get("shifts_per_day", 3),
                production_target_kg=body.get("production_target_kg", 0),
                currency=body.get("currency", "INR"),
                timezone=body.get("timezone", "Asia/Kolkata"),
            )
            db.add(settings)
        await db.flush()
        return {"message": "Mill settings updated"}
    except Exception as e:
        logger.error(f"admin.mill_settings update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/users/{user_id}/modules")
async def update_user_modules(
    user_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role_rel.code if current_user.role_rel else ""
    if role != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin only")

    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    modules_data: Dict[str, bool] = body.get("modules", {})
    for module_name, is_enabled in modules_data.items():
        existing = await db.execute(
            select(CompanyModule).where(
                CompanyModule.company_id == target_user.company_id,
                CompanyModule.module_name == module_name,
            )
        )
        cm = existing.scalar_one_or_none()
        if cm:
            cm.is_enabled = is_enabled
        else:
            db.add(CompanyModule(
                company_id=target_user.company_id,
                module_name=module_name,
                is_enabled=is_enabled,
                enabled_by=current_user.id,
            ))
    await db.commit()
    return {"message": "Module access updated successfully"}
