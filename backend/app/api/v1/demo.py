"""Wave 5.4 — Demo Platform + Trial API

Endpoints:
  POST   /auth/register                          — self-service demo signup
  POST   /demo/reset                             — reset demo data
  GET    /tours                                  — list product tours
  GET    /tours/{slug}                           — get tour details
  POST   /tours/{slug}/progress                  — update tour progress
  GET    /customer/engagement                    — per-company engagement score
  GET    /customer/trial                         — trial engagement summary
  GET    /customer/journey                       — journey timeline
  GET    /nudges                                 — active nudges for company
  POST   /nudges/{id}/dismiss                    — dismiss a nudge
  GET    /admin/sales/overview                   — sales command center overview
  GET    /admin/sales/funnel                     — conversion funnel
  POST   /admin/nudges/seed                      — seed default nudges
  POST   /admin/tours/seed                       — seed default tours
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status as http_status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from datetime import datetime, timezone, timedelta
from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.security import hash_password
from app.models.user import User
from app.models.masters import Company
from app.models.billing import CompanySubscription
from app.models.demo import DemoEnvironment, ProductTour, TourProgress, Nudge
from app.services.demo_service import DemoService, TourService, EngagementService, JourneyService, NudgeService
from app.services.customer_success_service import OnboardingProgressService
from app.services.command_center_service import CommandCenterService
from pydantic import BaseModel, EmailStr, Field

router = APIRouter()


# ── Request models ──────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=100)
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)


# ── Self-service registration ───────────────────────────────────────

@router.post("/auth/register", status_code=201)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Self-service demo signup — creates company + demo data."""
    existing = (await db.execute(
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    svc = DemoService(db)
    try:
        result = await svc.create_demo(
            company_name=body.company_name,
            email=body.email,
            password=body.password,
            full_name=body.full_name,
            source="self_service",
        )
        await db.commit()
        return {
            "message": "Demo account created. Check your email for login details.",
            "email": body.email,
            "company_id": result["company_id"],
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


# ── Demo management ─────────────────────────────────────────────────

@router.post("/demo/reset")
async def reset_demo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company_id = str(current_user.company_id or "")
    if not company_id:
        raise HTTPException(status_code=400, detail="No company context")
    svc = DemoService(db)
    ok = await svc.reset_demo(company_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Demo not found")
    await db.commit()
    return {"success": True}


# ── Product Tours ───────────────────────────────────────────────────

@router.get("/tours")
async def list_tours(
    db: AsyncSession = Depends(get_db),
    page: Optional[str] = Query(None),
):
    svc = TourService(db)
    tours = await svc.list_tours(page=page)
    return {"data": tours}


@router.get("/tours/{slug}")
async def get_tour(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = TourService(db)
    tour = await svc.get_tour(slug)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")

    progress = await svc.get_progress(str(current_user.id), tour.id)
    return {
        "tour": tour,
        "progress": progress,
    }


class TourProgressBody(BaseModel):
    action: str = Field(..., pattern="^(next|prev|skip)$")


@router.post("/tours/{slug}/progress")
async def update_tour_progress(
    slug: str,
    body: TourProgressBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = TourService(db)
    tour = await svc.get_tour(slug)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    prog = await svc.update_progress(str(current_user.id), tour.id, body.action)
    await db.commit()
    return {
        "current_step": prog.current_step,
        "completed": prog.completed,
        "skipped": prog.skipped,
    }


@router.post("/admin/tours/seed")
async def seed_tours(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = current_user.role_rel.code if current_user.role_rel else ""
    if role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permission")
    svc = TourService(db)
    n = await svc.seed_default_tours()
    await db.commit()
    return {"seeded": n}


# ── Engagement & Health ─────────────────────────────────────────────

@router.get("/customer/engagement")
async def get_engagement(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company_id = str(current_user.company_id or "")
    if not company_id:
        return {"score": 0, "components": {}, "classification": "unknown"}
    svc = EngagementService(db)
    return await svc.get_engagement_score(company_id)


@router.get("/customer/trial")
async def get_trial_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company_id = str(current_user.company_id or "")
    if not company_id:
        return {"is_trial": False}
    svc = EngagementService(db)
    return await svc.get_trial_summary(company_id)


# ── Customer Journey ────────────────────────────────────────────────

@router.get("/customer/journey")
async def get_journey(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company_id = str(current_user.company_id or "")
    if not company_id:
        return {"timeline": [], "progress": {"completed": 0, "total": 0, "percent": 0}}
    svc = JourneyService(db)
    return await svc.get_journey(company_id)


# ── Nudges ──────────────────────────────────────────────────────────

@router.get("/nudges")
async def get_nudges(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company_id = str(current_user.company_id or "")
    if not company_id:
        return []
    svc = NudgeService(db)
    return await svc.get_active_nudges(company_id)


@router.post("/nudges/{nudge_id}/dismiss")
async def dismiss_nudge(
    nudge_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return {"dismissed": nudge_id}


@router.post("/admin/nudges/seed")
async def seed_nudges(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = current_user.role_rel.code if current_user.role_rel else ""
    if role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permission")
    svc = NudgeService(db)
    n = await svc.seed_default_nudges()
    await db.commit()
    return {"seeded": n}


# ── Sales Command Center (SUPER_ADMIN) ──────────────────────────────

@router.get("/admin/sales/overview")
async def sales_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = current_user.role_rel.code if current_user.role_rel else ""
    if role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permission")

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    # Trial counts
    trial_total = (await db.execute(
        select(func.count(CompanySubscription.id)).where(CompanySubscription.status == "trial")
    )).scalar() or 0
    trial_active_30d = (await db.execute(
        select(func.count(CompanySubscription.id)).where(
            CompanySubscription.status == "trial",
            CompanySubscription.started_at >= thirty_days_ago,
        )
    )).scalar() or 0
    trial_expired = (await db.execute(
        select(func.count(CompanySubscription.id)).where(
            CompanySubscription.status == "trial",
            CompanySubscription.trial_ends_at < now,
        )
    )).scalar() or 0

    # Conversion
    total_companies = (await db.execute(select(func.count(Company.id)))).scalar() or 0
    active_subs = (await db.execute(
        select(func.count(CompanySubscription.id)).where(CompanySubscription.status == "active")
    )).scalar() or 0

    # Command center KPI for MRR/ARR
    cc = CommandCenterService(db)
    kpi = await cc.kpi()

    # Health distribution
    health_svc = EngagementService(db)
    health_counts = {"healthy": 0, "warning": 0, "at_risk": 0, "critical": 0}
    companies = (await db.execute(select(Company.id).where(Company.status == "active"))).scalars().all()
    for c in companies:
        try:
            eng = await health_svc.get_engagement_score(str(c))
            cls = eng.get("classification", "unknown")
            if cls in health_counts:
                health_counts[cls] += 1
        except Exception:
            health_counts["critical"] += 1

    return {
        "trials": {
            "total": trial_total,
            "started_30d": trial_active_30d,
            "expired": trial_expired,
            "active": trial_total - trial_expired,
        },
        "conversion": {
            "total_companies": total_companies,
            "active_subscriptions": active_subs,
            "conversion_rate": round(active_subs / max(total_companies, 1) * 100, 1),
            "mrr": kpi.get("mrr", 0),
            "arr": kpi.get("arr", 0),
        },
        "health": health_counts,
    }


@router.get("/admin/sales/funnel")
async def sales_funnel(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = current_user.role_rel.code if current_user.role_rel else ""
    if role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permission")
    svc = JourneyService(db)
    return await svc.get_funnel()
