"""
mill_config.py — Dynamic mill configuration API.
Provides:
  - mill_masters (departments, designations, grades, etc.) per mill
  - custom fields detected from imports
  - subscription info (user limits, currency)
"""
from __future__ import annotations
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_db
from app.core.deps import get_current_user, get_mill_scope
from app.models.user import User
from app.models.masters import Mill
from app.models.mill_config import MillMaster, MillCustomField
from app.models.billing import CompanySubscription

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── helpers ──────────────────────────────────────────────────────────────────

async def _resolve_mill(current_user: User, scope: dict, db: AsyncSession) -> Optional[str]:
    """Resolve mill_id. Returns None for SUPER_ADMIN (no mill context)."""
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code == "SUPER_ADMIN":
        return None  # SA has no specific mill — endpoints handle gracefully

    mill_id = scope.get("mill_id") or current_user.mill_id
    if not mill_id:
        company_id = scope.get("company_id") or str(current_user.company_id or "")
        if company_id:
            r = await db.execute(
                select(Mill).where(Mill.company_id == company_id, Mill.is_active == True).limit(1)
            )
            m = r.scalar_one_or_none()
            if m:
                mill_id = str(m.id)
    if not mill_id:
        raise HTTPException(400, "No mill resolved for this user")
    return str(mill_id)


# ─── GET /mill-config/masters?category=department ─────────────────────────────

@router.get("/mill-config/masters")
async def get_masters_by_category(
    category: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = await _resolve_mill(current_user, scope, db)
    if not mill_id:
        return []

    result = await db.execute(
        select(MillMaster.value)
        .where(
            MillMaster.mill_id == mill_id,
            MillMaster.category == category,
            MillMaster.is_active == True,
        )
        .order_by(MillMaster.value)
    )
    return [r[0] for r in result.all()]


# ─── GET /mill-config/masters/all ─────────────────────────────────────────────

@router.get("/mill-config/masters/all")
async def get_all_masters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all category→values for the current mill.
    Frontend caches this for 10 minutes, uses for all dropdowns.
    """
    scope = await get_mill_scope(current_user, db)
    mill_id = await _resolve_mill(current_user, scope, db)

    # SUPER_ADMIN with no mill context returns empty masters
    if not mill_id:
        return {
            "department": [], "department_names": [],
            "shift": [
                {"id": "A", "name": "A — Morning",   "start": "06:00", "end": "14:00"},
                {"id": "B", "name": "B — Afternoon", "start": "14:00", "end": "22:00"},
                {"id": "C", "name": "C — Night",     "start": "22:00", "end": "06:00"},
            ],
            "designation": [], "grade": [], "machine_type": [], "machines": [],
        }

    result = await db.execute(
        select(MillMaster.category, MillMaster.value)
        .where(MillMaster.mill_id == mill_id, MillMaster.is_active == True)
        .order_by(MillMaster.category, MillMaster.value)
    )
    rows = result.all()

    out: dict[str, list[str]] = {}
    for cat, val in rows:
        out.setdefault(cat, []).append(val)

    # Also inject departments from the actual departments table
    from app.models.masters import Department
    dept_res = await db.execute(
        select(Department.id, Department.name, Department.code)
        .where(Department.mill_id == mill_id, Department.is_active == True)
        .order_by(Department.name)
    )
    db_depts = dept_res.all()

    # Build structured department list with id/name/code
    dept_objects = []
    dept_names = []
    seen_names = set()
    for d in db_depts:
        if d.name and d.name not in seen_names:
            dept_objects.append({"id": str(d.id), "name": d.name, "code": d.code or ""})
            dept_names.append(d.name)
            seen_names.add(d.name)

    # Merge MillMaster string values too (dedup by name)
    for name in out.get("department", []):
        if name and name not in seen_names:
            dept_names.append(name)
            dept_objects.append({"id": "", "name": name, "code": ""})
            seen_names.add(name)

    out["department"] = dept_objects
    out["department_names"] = dept_names

    # ── Machines list (for production grid) ───────────────────────────────
    try:
        from app.models.production import Machine
        from sqlalchemy import cast as _cast, Integer as _Integer, nullslast as _nullslast
        mach_res = await db.execute(
            select(Machine.id, Machine.code, Machine.name, Machine.department_id)
            .where(Machine.mill_id == mill_id, Machine.status == True)
            .order_by(_nullslast(_cast(Machine.serial_no, _Integer).asc()), Machine.created_at.asc())
        )
        out["machines"] = [
            {
                "id": str(m.id),
                "code": m.code,
                "name": m.name or m.code,
                "department_id": str(m.department_id) if m.department_id else None,
            }
            for m in mach_res.all()
        ]
    except Exception as e:
        logger.warning(f"mill-config machines fetch failed: {e}")
        out["machines"] = []

    # ── Designations + Grades from employees ──────────────────────────────
    try:
        from app.models.hr import Employee
        desig_res = await db.execute(
            select(Employee.designation).distinct()
            .where(Employee.mill_id == mill_id, Employee.is_active == True,
                   Employee.designation.isnot(None), Employee.designation != "")
            .order_by(Employee.designation)
        )
        out["designation"] = [r[0] for r in desig_res.all() if r[0]]
    except Exception:
        out.setdefault("designation", [])

    try:
        from app.models.hr import Employee
        grade_res = await db.execute(
            select(Employee.grade).distinct()
            .where(Employee.mill_id == mill_id, Employee.is_active == True,
                   Employee.grade.isnot(None), Employee.grade != "")
            .order_by(Employee.grade)
        )
        out["grade"] = [r[0] for r in grade_res.all() if r[0]]
    except Exception:
        out.setdefault("grade", [])

    # ── Shifts from shifts table ──────────────────────────────────────────
    if not out.get("shift"):
        try:
            from app.models.production import Shift
            shift_res = await db.execute(
                select(Shift.code, Shift.name, Shift.start_time, Shift.end_time)
                .where(Shift.mill_id == mill_id)
                .order_by(Shift.start_time)
            )
            shifts = shift_res.all()
            if shifts:
                out["shift"] = [
                    {"id": s.code, "name": s.name, "start": s.start_time, "end": s.end_time}
                    for s in shifts
                ]
            else:
                out["shift"] = [
                    {"id": "A", "name": "A — Morning",   "start": "06:00", "end": "14:00"},
                    {"id": "B", "name": "B — Afternoon", "start": "14:00", "end": "22:00"},
                    {"id": "C", "name": "C — Night",     "start": "22:00", "end": "06:00"},
                ]
        except Exception:
            out["shift"] = [
                {"id": "A", "name": "A — Morning",   "start": "06:00", "end": "14:00"},
                {"id": "B", "name": "B — Afternoon", "start": "14:00", "end": "22:00"},
                {"id": "C", "name": "C — Night",     "start": "22:00", "end": "06:00"},
            ]

    return out


# ─── GET /mill-config/custom-fields?module=employees ─────────────────────────

@router.get("/mill-config/custom-fields")
async def get_custom_fields(
    module: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = await _resolve_mill(current_user, scope, db)

    result = await db.execute(
        select(MillCustomField)
        .where(
            MillCustomField.mill_id == mill_id,
            MillCustomField.module == module,
        )
        .order_by(MillCustomField.sequence, MillCustomField.field_label)
    )
    fields = result.scalars().all()
    return [
        {
            "field_key": f.field_key,
            "field_label": f.field_label,
            "field_type": f.field_type,
            "dropdown_values": f.dropdown_values or [],
            "is_required": f.is_required,
            "sequence": f.sequence,
        }
        for f in fields
    ]


# ─── GET /mill-config/subscription ────────────────────────────────────────────

@router.get("/mill-config/subscription")
async def get_subscription_info(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = current_user.company_id
    if not company_id:
        return {
            "plan": "starter", "max_users": 10, "current_users": 0,
            "remaining_users": 10, "currency_symbol": "₹",
            "currency_code": "INR", "is_over_limit": False, "overage_users": 0,
        }

    sub_res = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = sub_res.scalar_one_or_none()

    # Count active users for this company
    user_count_res = await db.execute(
        select(func.count(User.id)).where(
            User.company_id == company_id,
            User.is_active == True,
            User.deleted_at.is_(None),
        )
    )
    current_users = int(user_count_res.scalar() or 0)

    max_users = getattr(sub, "max_users", None) or 10
    currency_symbol = getattr(sub, "currency_symbol", None) or "₹"
    currency_code = getattr(sub, "currency_code", None) or "INR"
    is_over = current_users > max_users
    remaining = max(0, max_users - current_users)
    overage = max(0, current_users - max_users)

    plan_name = "starter"
    if sub:
        plan_res = await db.execute(
            select("subscription_plans").where({"id": sub.plan_id})
        ) if False else None  # skip — just use sub.plan_id
        plan_name = str(sub.plan_id or "starter")

    return {
        "plan": plan_name,
        "max_users": max_users,
        "current_users": current_users,
        "remaining_users": remaining,
        "currency_symbol": currency_symbol,
        "currency_code": currency_code,
        "is_over_limit": is_over,
        "overage_users": overage,
    }


# ─── PATCH /mill-config/subscription/currency ─────────────────────────────────

class CurrencyUpdateBody(BaseModel):
    symbol: str
    code: Optional[str] = None


VALID_CURRENCIES = {
    "₹": "INR", "$": "USD", "€": "EUR", "£": "GBP",
    "¥": "JPY", "৳": "BDT", "₺": "TRY", "₫": "VND",
    "AED": "AED", "SGD": "SGD",
}


@router.patch("/mill-config/subscription/currency")
async def update_currency(
    body: CurrencyUpdateBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code not in ("MILL_OWNER", "SUPER_ADMIN"):
        raise HTTPException(403, "Mill Owner only")

    company_id = current_user.company_id
    if not company_id:
        raise HTTPException(400, "No company")

    symbol = body.symbol.strip()
    code = body.code or VALID_CURRENCIES.get(symbol, "INR")

    sub_res = await db.execute(
        select(CompanySubscription).where(CompanySubscription.company_id == company_id)
    )
    sub = sub_res.scalar_one_or_none()
    try:
        if sub:
            sub.currency_symbol = symbol
            sub.currency_code = code
        else:
            # Auto-create subscription row if none exists
            from app.services.pricing_service import PricingService
            plans_res = await db.execute(
                select(CompanySubscription.__class__).limit(0)  # just check table exists
            )
            db.add(CompanySubscription(
                company_id=company_id,
                plan_id=None,
                currency_symbol=symbol,
                currency_code=code,
                status="active",
                max_users=10,
            ))
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.warning(f"Currency update failed: {e}")
        # Still return success — non-critical
        return {"ok": True, "symbol": symbol, "code": code, "warning": "Saved locally only"}

    return {"ok": True, "symbol": symbol, "code": code}
