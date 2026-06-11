from __future__ import annotations
import json
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
from app.core.deps import get_current_user, get_mill_scope, log_audit
from app.core.limiter import limiter
from app.core.module_registry import ALL_MODULE_CODES as ALL_MODULE_KEYS
from app.models.user import User, Role, UserSession
from app.models.masters import Company, CompanyModule, Mill, MillSettings
from app.models.hr import Employee
from app.models.billing import CompanySubscription, SubscriptionPlan
from app.models.audit import AuditLog
from app.models.deletion_log import DeletionLog
from app.core.error_handler import SpinFlowException
from app.services.deletion_service import CompanyDeletionService
from app.services.stats_service import StatsService
from app.services.onboarding_service import OnboardingService
from app.schemas.onboarding import OnboardingRequest, OnboardingResult
from sqlalchemy import update as sa_update

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()


@router.get("/admin/companies/{company_id}/modules")
async def get_company_modules(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        role_code = current_user.role_rel.code if current_user.role_rel else ""

        # Non-SUPER_ADMIN can only read their own company's modules
        if role_code != "SUPER_ADMIN":
            if str(current_user.company_id) != str(company_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own company's modules")

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
        role_code = current_user.role_rel.code if current_user.role_rel else ""
        if role_code != "SUPER_ADMIN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can manage modules")
        modules_data: Dict[str, bool] = body.get("modules")
        if modules_data is None:
            modules_data = {k: bool(v) for k, v in body.items() if k in ALL_MODULE_KEYS}
        existing_result = await db.execute(
            select(CompanyModule).where(
                CompanyModule.company_id == company_id,
                CompanyModule.module_name.in_(list(modules_data.keys())),
            )
        )
        existing_map: dict[str, CompanyModule] = {cm.module_name: cm for cm in existing_result.scalars().all()}
        for module_name, is_enabled in modules_data.items():
            record = existing_map.get(module_name)
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
        role_code_audit = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
        changed = [f"{k}={v}" for k, v in modules_data.items()]
        await log_audit(db, current_user.id, role_code_audit, "update_company_modules", "company", company_id, f"Modules changed: {', '.join(changed)}")
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
@limiter.limit("10/minute")
async def create_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can create users via admin panel")
    try:
        body = await request.json()
        name = body.get("name")
        email = body.get("email")
        password = body.get("password")
        role_code = body.get("role_code", "MILL_OWNER")
        company_id = body.get("company_id")
        mill_id = body.get("mill_id") or None

        if not password or len(str(password)) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        if not name or not name.strip():
            raise HTTPException(400, "Name is required")
        if not email or "@" not in email:
            raise HTTPException(400, "Valid email is required")
        if not company_id:
            raise HTTPException(400, "Company is required")

        existing = await db.execute(
            select(User).where(User.email == email, User.deleted_at.is_(None))
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, f"Email {email} is already in use")

        from app.services.pricing_service import PricingService
        pricing_svc = PricingService(db)
        ok, msg = await pricing_svc.can_create_user(company_id)
        if not ok:
            raise HTTPException(status_code=403, detail=msg)

        # Use SELECT FOR UPDATE to prevent race condition on user limit check
        company_result = await db.execute(
            select(Company).where(Company.id == company_id).with_for_update()
        )
        company = company_result.scalar_one_or_none()
        if not company:
            raise HTTPException(404, "Company not found")
        if company.is_active is False:
            raise HTTPException(403, "Cannot create users for an inactive or suspended company")

        user_count = await db.execute(
            select(func.count(User.id)).where(
                User.company_id == company_id,
                User.is_active == True,
                User.deleted_at.is_(None)
            )
        )
        count = user_count.scalar() or 0
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
            name=name.strip(),
            email=email.strip().lower(),
            password_hash=pwd_context.hash(str(password)),
            role_id=role.id,
            company_id=company_id,
            mill_id=mill_id,
            mill_name=mill_name,
            is_active=True,
            must_change_password=True,
        )
        db.add(new_user)
        await db.flush()
        role_code_audit = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
        await log_audit(
            db, current_user.id, role_code_audit, "create_user", "user", new_user.id,
            f"Admin created user: {email} (role: {role_code})", ip_address=client_ip,
        )
        await db.commit()
        await db.refresh(new_user)

        return {
            "id": str(new_user.id),
            "name": new_user.name,
            "email": new_user.email,
            "role": role_code,
            "mill_id": mill_id,
            "mill_name": mill_name,
            "must_change_password": True,
            "created": True,
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"admin create user error: {e}")
        raise HTTPException(500, detail=f"Server error: {str(e)}")


@router.get("/admin/user-stats")
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cheap aggregate stats for the admin users page header cards."""
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    try:
        base = select(User).where(User.deleted_at.is_(None))
        if role_code == "MILL_OWNER":
            base = base.where(User.company_id == current_user.company_id)

        total = (await db.execute(
            select(func.count()).select_from(base.subquery())
        )).scalar() or 0

        active = (await db.execute(
            select(func.count()).select_from(base.where(User.is_active == True).subquery())
        )).scalar() or 0

        inactive = (await db.execute(
            select(func.count()).select_from(base.where(User.is_active == False).subquery())
        )).scalar() or 0

        # Mill owners: join with role
        mill_owner_role = (await db.execute(
            select(Role.id).where(Role.code == "MILL_OWNER")
        )).scalar_one_or_none()
        mill_owners = 0
        if mill_owner_role:
            mo_q = base.where(User.role_id == mill_owner_role)
            mill_owners = (await db.execute(
                select(func.count()).select_from(mo_q.subquery())
            )).scalar() or 0

        return {"total": total, "active": active, "inactive": inactive, "mill_owners": mill_owners}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"user-stats error: {e}")
        raise HTTPException(500, "Failed to load user stats")


@router.get("/admin/users")
async def list_all_users(
    company_id: Optional[str] = None,
    role: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 500,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN or MILL_OWNER can list users")
    try:
        # Base query — include ALL users (active + inactive) so stats are correct
        query = select(User).where(User.deleted_at.is_(None))

        if company_id:
            if role_code == "MILL_OWNER":
                if str(company_id) != str(current_user.company_id):
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="MILL_OWNER can only list users in their own company")
            query = query.where(User.company_id == company_id)
        elif role_code == "MILL_OWNER":
            query = query.where(User.company_id == current_user.company_id)

        if status_filter == "active":
            query = query.where(User.is_active == True)
        elif status_filter == "inactive":
            query = query.where(User.is_active == False)

        if search:
            q = f"%{search.strip()}%"
            from sqlalchemy import or_
            query = query.where(or_(User.name.ilike(q), User.email.ilike(q)))

        query = query.order_by(User.created_at.desc())

        count_q = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_q)).scalar() or 0

        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        users = result.scalars().all()

        # Batch-load roles
        role_ids = [u.role_id for u in users if u.role_id]
        roles = {}
        if role_ids:
            roles_result = await db.execute(select(Role).where(Role.id.in_(role_ids)))
            roles = {r.id: r.code for r in roles_result.scalars().all()}

        # Filter by role after resolving role codes
        if role:
            users = [u for u in users if roles.get(u.role_id) == role]
            total = len(users)

        # Batch-load company names
        company_ids = list({u.company_id for u in users if u.company_id})
        company_names: dict[str, str] = {}
        if company_ids:
            co_res = await db.execute(select(Company).where(Company.id.in_(company_ids)))
            company_names = {c.id: c.name for c in co_res.scalars().all()}

        return {
            "items": [
                {
                    "id": str(u.id),
                    "name": u.name,
                    "email": u.email,
                    "role": roles.get(u.role_id, "unknown"),
                    "company_id": str(u.company_id) if u.company_id else None,
                    "company_name": company_names.get(u.company_id) if u.company_id else None,
                    "mill_id": str(u.mill_id) if u.mill_id else None,
                    "mill_name": u.mill_name,
                    "is_active": u.is_active,
                    "last_login": u.last_login.isoformat() if u.last_login else None,
                    "must_change_password": u.must_change_password,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                }
                for u in users
            ],
            "total": total,
            "page": page,
            "pages": -(-total // page_size) if page_size else 0,
        }
    except HTTPException:
        raise
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
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can reset passwords")
    try:
        body = await request.json()
        new_password = body.get("password")
        if not new_password or len(new_password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "User not found")

        user.password_hash = pwd_context.hash(new_password)
        user.must_change_password = True
        await db.commit()
        role_code_audit = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
        await log_audit(db, current_user.id, role_code_audit, "reset_user_password", "user", user_id, "Password reset by admin")

        return {"reset": True, "must_change_password": True}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"admin reset password error: {e}")
        raise HTTPException(500, str(e))


@router.patch("/admin/companies/{company_id}")
async def update_company_admin(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can modify company settings")
    try:
        body = await request.json()
        result = await db.execute(
            select(Company).where(Company.id == company_id)
        )
        company = result.scalar_one_or_none()
        if not company:
            raise HTTPException(404, "Company not found")

        if "plan" in body:
            company.plan = body["plan"]
        if "max_employees" in body:
            company.max_employees = int(body["max_employees"])
        if "max_users" in body:
            val = int(body["max_users"])
            if val < 1:
                raise HTTPException(400, "max_users must be at least 1")
            company.max_users = val

        await db.commit()
        role_code_audit = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
        await log_audit(db, current_user.id, role_code_audit, "update_company", "company", company_id, f"Updated company: {json.dumps({k: body[k] for k in ('plan', 'max_employees', 'max_users') if k in body})}")
        return {"updated": True}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, detail=str(e))


@router.patch("/admin/companies/{company_id}/limits")
async def update_company_limits(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can modify company limits")
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
        if "plan" in body:
            company.plan = body["plan"]
        if "max_employees" in body:
            company.max_employees = int(body["max_employees"])
        await db.commit()
        role_code_audit = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
        await log_audit(db, current_user.id, role_code_audit, "update_company_limits", "company", company_id, f"Limits updated: max_users={company.max_users}, plan={company.plan}")

        return {"max_users": company.max_users, "plan": company.plan, "max_employees": company.max_employees, "updated": True}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, detail=str(e))


@router.post("/admin/companies/{company_id}/suspend")
@limiter.limit("10/minute")
async def suspend_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suspend a company and cascade to mills, users, and sessions."""
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(403, "Super Admin only")

    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    if company.status == "suspended":
        raise HTTPException(409, "Company is already suspended")

    now = datetime.utcnow()
    company.is_active = False
    company.status = "suspended"
    company.suspended_at = now

    await db.execute(
        sa_update(Mill).where(Mill.company_id == company_id).values(is_active=False)
    )
    await db.execute(
        sa_update(User).where(User.company_id == company_id).values(is_active=False)
    )
    await db.execute(
        sa_update(UserSession)
        .where(UserSession.user_id.in_(
            select(User.id).where(User.company_id == company_id)
        ))
        .values(is_active=False)
    )
    sub_result = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = sub_result.scalar_one_or_none()
    if sub:
        sub.status = "suspended"

    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.name,
        role=role_code,
        action="company_suspended",
        entity="company",
        entity_id=company_id,
        details="Company suspended with cascade: mills, users, sessions disabled",
    ))
    await db.commit()
    return {"id": company_id, "status": "suspended", "suspended_at": str(now)}


@router.post("/admin/companies/{company_id}/reactivate")
@limiter.limit("10/minute")
async def reactivate_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reactivate a suspended company and restore mills and users."""
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(403, "Super Admin only")

    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    if company.status != "suspended":
        raise HTTPException(409, "Company is not suspended")

    company.is_active = True
    company.status = "active"
    company.suspended_at = None

    await db.execute(
        sa_update(Mill).where(Mill.company_id == company_id).values(is_active=True)
    )
    await db.execute(
        sa_update(User).where(User.company_id == company_id).values(is_active=True)
    )
    sub_result = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = sub_result.scalar_one_or_none()
    if sub:
        sub.status = "active"

    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.name,
        role=role_code,
        action="company_reactivated",
        entity="company",
        entity_id=company_id,
        details="Company reactivated: mills and users restored",
    ))
    await db.commit()
    return {"id": company_id, "status": "active"}


# Keep old status endpoint for backward compatibility
@router.post("/admin/companies/{company_id}/status")
async def update_company_status(
    company_id: str,
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update company status — delegates to suspend/reactivate."""
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(403, "Super Admin only")

    new_status = body.get("status")
    if new_status == "suspended":
        return await suspend_company(company_id, request, db, current_user)
    elif new_status == "active":
        return await reactivate_company(company_id, request, db, current_user)
    else:
        raise HTTPException(422, "status must be 'active' or 'suspended'")


@router.get("/admin/companies/{company_id}/detail")
async def get_company_detail(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return full company detail with stats, subscription, and recent audit."""
    try:
        role_code = current_user.role_rel.code if current_user.role_rel else ""
        if role_code != "SUPER_ADMIN":
            raise HTTPException(403, "Super Admin only")

        company = await db.get(Company, company_id)
        if not company:
            raise HTTPException(404, "Company not found")

        mill_count = (
            await db.execute(select(func.count()).select_from(Mill).where(Mill.company_id == company_id, Mill.is_active == True))
        ).scalar() or 0

        user_count = (
            await db.execute(select(func.count()).select_from(User).where(User.company_id == company_id, User.is_active == True, User.deleted_at.is_(None)))
        ).scalar() or 0

        employee_count = (
            await db.execute(
                select(func.count()).select_from(Employee)
                .join(Mill, Employee.mill_id == Mill.id)
                .where(Mill.company_id == company_id, Employee.is_active == True)
            )
        ).scalar() or 0

        module_result = await db.execute(
            select(CompanyModule).where(CompanyModule.company_id == company_id)
        )
        modules = module_result.scalars().all()
        enabled_modules = [m.module_name for m in modules if m.is_enabled]

        sub_result = await db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == company_id)
        )
        sub = sub_result.scalar_one_or_none()
        subscription = None
        if sub:
            plan = await db.get(SubscriptionPlan, sub.plan_id)
            subscription = {
                "plan_id": sub.plan_id,
                "plan_code": plan.code if plan else None,
                "plan_name": plan.name if plan else None,
                "status": sub.status,
                "billing_cycle": sub.billing_cycle,
                "started_at": str(sub.started_at) if sub.started_at else None,
                "expires_at": str(sub.expires_at) if sub.expires_at else None,
            }

        from app.services.pricing_service import PricingService
        svc = PricingService(db)
        effective = await svc.get_effective_limits(company)

        audit_result = await db.execute(
            select(AuditLog)
            .where(AuditLog.entity_id == company_id)
            .order_by(AuditLog.created_at.desc())
            .limit(20)
        )
        recent_audit = [
            {
                "action": a.action,
                "user_name": a.user_name,
                "details": a.details,
                "created_at": str(a.created_at) if a.created_at else None,
            }
            for a in audit_result.scalars().all()
        ]

        return {
            "id": company.id,
            "code": company.code,
            "name": company.name,
            "gstin": company.gstin,
            "address": company.address,
        "phone": company.phone,
        "email": company.email,
        "is_active": company.is_active,
        "status": company.status,
        "suspended_at": str(company.suspended_at) if company.suspended_at else None,
        "archived_at": str(company.archived_at) if company.archived_at else None,
        "max_users": company.max_users,
        "plan": company.plan,
        "max_employees": company.max_employees,
        "created_at": str(company.created_at) if company.created_at else None,
        "stats": {
            "mill_count": mill_count,
            "user_count": user_count,
            "employee_count": employee_count,
            "enabled_modules_count": len(enabled_modules),
            "enabled_modules": enabled_modules,
            "user_limit": effective.user_limit,
            "mill_limit": effective.mill_limit,
            "employee_limit": effective.employee_limit,
            "included_users": effective.included_users,
            "included_mills": effective.included_mills,
        },
        "subscription": subscription,
        "recent_audit": recent_audit,
    }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_company_detail error: {e}")
        raise HTTPException(500, "Failed to load company detail")


@router.post("/admin/onboarding", response_model=OnboardingResult)
async def admin_onboarding(
    dto: OnboardingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Onboard a new company with mills + owner in a single transaction."""
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(403, "Super Admin only")

    svc = OnboardingService(db, current_user)
    try:
        return await svc.onboard(dto)
    except SpinFlowException:
        raise
    except Exception:
        logger.exception("Onboarding failed unexpectedly")
        raise HTTPException(500, "Internal server error during onboarding")


@router.get("/admin/mills/{mill_id}/settings")
async def get_mill_settings(
    mill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN or MILL_OWNER can view mill settings")
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"admin.mill_settings get error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/mills/{mill_id}/settings")
async def update_mill_settings(
    mill_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can modify mill settings")
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
    existing_result = await db.execute(
        select(CompanyModule).where(
            CompanyModule.company_id == target_user.company_id,
            CompanyModule.module_name.in_(list(modules_data.keys())),
        )
    )
    existing_map: dict[str, CompanyModule] = {cm.module_name: cm for cm in existing_result.scalars().all()}
    for module_name, is_enabled in modules_data.items():
        cm = existing_map.get(module_name)
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
    role_code_audit = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    changed = [f"{k}={v}" for k, v in modules_data.items()]
    await log_audit(db, current_user.id, role_code_audit, "update_user_modules", "user", user_id, f"Company modules changed: {', '.join(changed)}")
    return {"message": "Company module access updated successfully"}


@router.get("/admin/users/{user_id}/restrictions")
async def get_user_restrictions(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role_rel.code if current_user.role_rel else ""
    if role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN or MILL_OWNER can view restrictions")
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "user_id": user_id,
        "module_restrictions": target_user.get_module_restrictions(),
    }


@router.put("/admin/users/{user_id}/restrictions")
async def update_user_restrictions(
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
    old_value = dict(target_user.get_module_restrictions())
    new_restrictions: Dict[str, bool] = body.get("module_restrictions", {})
    target_user.module_restrictions = new_restrictions
    await db.commit()
    await db.refresh(target_user)
    role_code_audit = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    await log_audit(
        db, current_user.id, role_code_audit,
        "update_user_restrictions", "user", user_id,
        f"Module restrictions updated",
        old_value=str(old_value), new_value=str(new_restrictions),
    )
    return {"message": "User module restrictions updated", "module_restrictions": new_restrictions}


# ── Admin Dashboard (Vendor overview) ─────────────────────────────────────────

@router.get("/admin/dashboard")
async def admin_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full company overview for Super Admin vendor dashboard."""
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin only")

    from sqlalchemy import and_ as _and, distinct
    from app.models.masters import CompanyModule
    from app.models.billing import CompanySubscription

    try:
        # Batch aggregate queries — 4 queries total regardless of company count
        companies_res = await db.execute(
            select(Company).order_by(Company.name)
        )
        companies = companies_res.scalars().all()
        company_ids = [c.id for c in companies]

        # Single query: mill counts per company (active mills only)
        mill_counts = {
            row[0]: row[1] for row in (
                await db.execute(
                    select(Mill.company_id, func.count(Mill.id))
                    .where(
                        Mill.company_id.in_(company_ids),
                        Mill.is_active == True,
                    )
                    .group_by(Mill.company_id)
                )
            ).all()
        }

        # Single query: user counts per company
        user_counts = {
            row[0]: row[1] for row in (
                await db.execute(
                    select(User.company_id, func.count(User.id))
                    .where(
                        User.company_id.in_(company_ids),
                        User.is_active == True,
                        User.deleted_at.is_(None),
                    )
                    .group_by(User.company_id)
                )
            ).all()
        }

        # Single query: enabled module counts per company
        mod_counts = {
            row[0]: row[1] for row in (
                await db.execute(
                    select(CompanyModule.company_id, func.count(CompanyModule.id))
                    .where(
                        CompanyModule.company_id.in_(company_ids),
                        CompanyModule.is_enabled == True,
                    )
                    .group_by(CompanyModule.company_id)
                )
            ).all()
        }

        result_companies = []
        total_mills = 0
        total_users_all = 0
        over_limit = 0

        for co in companies:
            mills_cnt = mill_counts.get(co.id, 0)
            users_cnt = user_counts.get(co.id, 0)
            mods_cnt = mod_counts.get(co.id, 0)

            max_u = co.max_users or 0
            company_status = "active" if co.is_active else "suspended"
            is_over = max_u > 0 and users_cnt > max_u
            if is_over:
                over_limit += 1

            total_mills += mills_cnt
            total_users_all += users_cnt

            result_companies.append({
                "id": str(co.id),
                "name": co.name,
                "code": co.code,
                "status": company_status,
                "plan": co.plan or "starter",
                "mills": mills_cnt,
                "users": users_cnt,
                "max_users": max_u,
                "modules": mods_cnt,
                "is_over_limit": is_over,
            })

        return {
            "total_companies": len(companies),
            "active_companies": sum(1 for c in result_companies if c["status"] == "active"),
            "total_mills": total_mills,
            "total_users": total_users_all,
            "companies_over_limit": over_limit,
            "companies": result_companies,
        }
    except Exception as e:
        logger.error(f"admin_dashboard error: {e}", exc_info=True)
        raise HTTPException(500, f"Dashboard error: {str(e)[:200]}")


@router.get("/admin/companies/{company_id}/deletion-count")
async def get_deletion_count(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can view deletion counts")
    try:
        svc = CompanyDeletionService(db, current_user)
        counts = await svc.count_all(company_id)
        return {"company_id": company_id, "affected_records": counts}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"deletion count error: {e}")
        raise HTTPException(500, "Failed to count affected records")


@router.delete("/admin/companies/{company_id}")
async def delete_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can delete companies")

    company_q = await db.execute(select(Company).where(Company.id == company_id))
    company = company_q.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if company.status != "archived":
        raise HTTPException(status_code=409, detail="Company must be archived before deletion. Archive it first.")

    svc = CompanyDeletionService(db, current_user)
    result = await svc.hard_delete(company_id)
    return result


@router.get("/admin/company-stats")
async def get_company_stats(
    company_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can view company stats")
    try:
        svc = StatsService(db)
        if company_id:
            stats = await svc.per_company_stats()
            match = [s for s in stats if s["company_id"] == company_id]
            return match[0] if match else None
        return await svc.per_company_stats()
    except Exception as e:
        logger.error(f"company stats error: {e}")
        return []


@router.post("/admin/companies/{company_id}/archive")
@limiter.limit("10/minute")
async def archive_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can archive companies")

    company_q = await db.execute(select(Company).where(Company.id == company_id))
    company = company_q.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if company.status != "suspended":
        raise HTTPException(status_code=409, detail="Company must be suspended before archiving. Suspend it first.")

    svc = CompanyDeletionService(db, current_user)
    result = await svc.archive(company_id)
    return result


@router.post("/admin/companies/{company_id}/delete")
@limiter.limit("10/minute")
async def permanent_delete_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a company. Requires X-Confirm-Code header matching the company code."""
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can delete companies")

    confirm_code = request.headers.get("X-Confirm-Code", "")
    if not confirm_code:
        raise HTTPException(status_code=400, detail="X-Confirm-Code header is required (must match company code)")

    company_q = await db.execute(select(Company).where(Company.id == company_id))
    company = company_q.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if company.code != confirm_code:
        raise HTTPException(status_code=400, detail="X-Confirm-Code does not match company code")

    svc = CompanyDeletionService(db, current_user)
    result = await svc.hard_delete(company_id)
    return result


@router.post("/admin/companies/{company_id}/restore")
@limiter.limit("10/minute")
async def restore_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore an archived company back to suspended state with full lifecycle validation."""
    try:
        role_code = current_user.role_rel.code if current_user.role_rel else ""
        if role_code != "SUPER_ADMIN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN can restore companies")

        company_q = await db.execute(select(Company).where(Company.id == company_id))
        company = company_q.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
        if company.status != "archived":
            raise HTTPException(status_code=409, detail="Company must be archived before restoring. Only archived companies can be restored.")

        # Restore to suspended — admin must explicitly reactivate
        company.is_active = False
        company.status = "suspended"
        company.suspended_at = datetime.utcnow()
        company.archived_at = None

        # Restore subscription to suspended
        sub_result = await db.execute(
            select(CompanySubscription).where(CompanySubscription.company_id == company_id)
        )
        sub = sub_result.scalar_one_or_none()
        if sub:
            sub.status = "suspended"

        db.add(AuditLog(
            user_id=current_user.id,
            user_name=current_user.name,
            role=role_code,
            action="company_restored",
            entity="company",
            entity_id=company_id,
            details="Company restored from archive to suspended state",
        ))
        await db.commit()
        return {"id": company_id, "status": "suspended", "message": "Company restored from archive. Use reactivate to fully enable."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"restore_company error: {e}")
        raise HTTPException(500, "Failed to restore company")


# ── Mill Suspend / Reactivate ─────────────────────────────────────────────────

@router.post("/admin/mills/{mill_id}/suspend")
@limiter.limit("20/minute")
async def suspend_mill(
    mill_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suspend a single mill and cascade: deactivates all mill users + sessions.
    This is a partial suspension — the parent company remains active.
    """
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(403, "Super Admin only")

    mill = await db.get(Mill, mill_id)
    if not mill:
        raise HTTPException(404, "Mill not found")
    if not mill.is_active:
        raise HTTPException(409, "Mill is already suspended")

    # Suspend the mill
    mill.is_active = False

    # Cascade: deactivate all users assigned to this mill
    await db.execute(
        sa_update(User).where(User.mill_id == mill_id).values(is_active=False)
    )

    # Cascade: kill all active sessions for those users
    await db.execute(
        sa_update(UserSession)
        .where(UserSession.user_id.in_(
            select(User.id).where(User.mill_id == mill_id)
        ))
        .values(is_active=False)
    )

    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.name,
        role=role_code,
        action="mill_suspended",
        entity="mill",
        entity_id=mill_id,
        details=f"Mill '{mill.name}' ({mill.code}) suspended — users and sessions deactivated",
    ))
    await db.commit()
    return {"id": mill_id, "name": mill.name, "status": "suspended"}


@router.post("/admin/mills/{mill_id}/reactivate")
@limiter.limit("20/minute")
async def reactivate_mill(
    mill_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reactivate a suspended mill and restore its users."""
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(403, "Super Admin only")

    mill = await db.get(Mill, mill_id)
    if not mill:
        raise HTTPException(404, "Mill not found")
    if mill.is_active:
        raise HTTPException(409, "Mill is already active")

    # Check parent company is active before restoring
    company = await db.get(Company, mill.company_id)
    if company and not company.is_active:
        raise HTTPException(400, "Cannot reactivate mill — parent company is suspended")

    mill.is_active = True
    await db.execute(
        sa_update(User).where(User.mill_id == mill_id).values(is_active=True)
    )

    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.name,
        role=role_code,
        action="mill_reactivated",
        entity="mill",
        entity_id=mill_id,
        details=f"Mill '{mill.name}' ({mill.code}) reactivated — users restored",
    ))
    await db.commit()
    return {"id": mill_id, "name": mill.name, "status": "active"}
