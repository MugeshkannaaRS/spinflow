from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
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
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can manage modules")
    modules_data: Dict[str, bool] = body.get("modules", {})
    for module_name, is_enabled in modules_data.items():
        await db.execute(
            update(CompanyModule)
            .where(
                CompanyModule.company_id == company_id,
                CompanyModule.module_name == module_name,
            )
            .values(is_enabled=is_enabled, enabled_by=current_user.id)
        )
    await db.commit()
    result = await db.execute(
        select(CompanyModule).where(CompanyModule.company_id == company_id)
    )
    modules = result.scalars().all()
    return {
        "modules": {m.module_name: m.is_enabled for m in modules},
    }
