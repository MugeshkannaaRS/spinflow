"""Customer Success API — Wave 5.3

Endpoints:
  GET    /customer/onboarding/progress         — auto-detected setup progress
  POST   /customer/onboarding/refresh          — force recompute progress
  GET    /customer/recommendations             — system recommendations
  GET    /customer/help/categories             — help categories
  GET    /customer/help/articles               — help articles (searchable)
  GET    /customer/help/articles/{slug}        — single article
  GET    /customer/help/context/{page}         — context-aware articles for a page
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services.customer_success_service import (
    OnboardingProgressService,
    RecommendationService,
    seed_help_content,
)
from app.models.customer_success import HelpCategory, HelpArticle
from sqlalchemy import select, func

router = APIRouter()


# ── Onboarding Progress ─────────────────────────────────────────────

@router.get("/customer/onboarding/progress")
async def get_onboarding_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company_id = str(current_user.company_id or "")
    if not company_id:
        return {"steps": {}, "completed": 0, "total": 9, "percent": 0}
    svc = OnboardingProgressService(db)
    data = await svc.get_or_create_progress(company_id)
    return data


@router.post("/customer/onboarding/refresh")
async def refresh_onboarding_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company_id = str(current_user.company_id or "")
    if not company_id:
        raise HTTPException(status_code=400, detail="No company context")
    svc = OnboardingProgressService(db)
    data = await svc.refresh_progress(company_id)
    await db.commit()
    return data


# ── Recommendations ─────────────────────────────────────────────────

@router.get("/customer/recommendations")
async def get_recommendations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    mill_id: Optional[str] = Query(None),
):
    company_id = str(current_user.company_id or "")
    if not company_id:
        return []
    svc = RecommendationService(db)
    return await svc.get_recommendations(company_id, mill_id=mill_id)


# ── Help Center ─────────────────────────────────────────────────────

@router.get("/customer/help/categories")
async def list_help_categories(
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(HelpCategory).where(HelpCategory.is_active == True).order_by(HelpCategory.sort_order)
    )).scalars().all()
    return {"data": rows}


@router.get("/customer/help/articles")
async def list_help_articles(
    db: AsyncSession = Depends(get_db),
    category_slug: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    q = select(HelpArticle).where(HelpArticle.is_active == True)

    if category_slug:
        cat = (await db.execute(
            select(HelpCategory).where(HelpCategory.slug == category_slug)
        )).scalar_one_or_none()
        if cat:
            q = q.where(HelpArticle.category_id == cat.id)

    if search:
        like = f"%{search}%"
        q = q.where(
            HelpArticle.title.ilike(like) |
            HelpArticle.summary.ilike(like) |
            HelpArticle.tags.astext.ilike(like)
        )

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    q = q.order_by(HelpArticle.sort_order, HelpArticle.title)
    rows = (await db.execute(q.offset((page - 1) * page_size).limit(page_size))).scalars().all()

    return {"total": total, "page": page, "page_size": page_size, "data": rows}


@router.get("/customer/help/articles/{slug}")
async def get_help_article(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(HelpArticle).where(HelpArticle.slug == slug, HelpArticle.is_active == True)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    return row


@router.get("/customer/help/context/{page}")
async def get_context_help(
    page: str,
    db: AsyncSession = Depends(get_db),
):
    """Return articles relevant to a specific page context."""
    rows = (await db.execute(
        select(HelpArticle).where(
            HelpArticle.context_page == page,
            HelpArticle.is_active == True,
        ).order_by(HelpArticle.sort_order)
    )).scalars().all()
    return {"data": rows}


# ── Admin: seed help content ────────────────────────────────────────

@router.post("/admin/help/seed")
async def seed_help(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permission")
    n = await seed_help_content(db)
    await db.commit()
    return {"seeded": n}
