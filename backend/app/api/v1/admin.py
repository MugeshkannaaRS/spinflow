import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict
from datetime import datetime

logger = logging.getLogger(__name__)

from app.db.session import get_db
from app.core.deps import get_current_user, get_mill_scope
from app.models.user import User
from app.models.masters import Company, CompanyModule, MillSettings

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
        modules_data: Dict[str, bool] = body.get("modules", {})
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
        company.is_active = not company.is_active
        await db.commit()
        status = "activated" if company.is_active else "suspended"
        return {"status": status, "is_active": company.is_active}
    except HTTPException:
        raise
    except Exception as e:
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
