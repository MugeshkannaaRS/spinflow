from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict

from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.masters import Company, CompanyModule

router = APIRouter()

@router.get("/admin/companies/{company_id}/modules")
async def get_company_modules(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can manage modules")
    result = await db.execute(
        select(CompanyModule).where(CompanyModule.company_id == company_id)
    )
    modules = result.scalars().all()
    return {
        "modules": {m.module_name: m.is_enabled for m in modules},
    }


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
                record.is_enabled = is_enabled
            else:
                db.add(CompanyModule(
                    company_id=company_id,
                    module_name=module_name,
                    is_enabled=is_enabled,
                    enabled_by=current_user.id,
                ))
        await db.commit()
        result = await db.execute(
            select(CompanyModule).where(CompanyModule.company_id == company_id)
        )
        modules = result.scalars().all()
        return {
            "modules": {m.module_name: m.is_enabled for m in modules},
        }
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
