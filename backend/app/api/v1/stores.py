from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.stores import Spare, SpareIssue
from app.models.masters import Mill
from app.schemas.stores import (
    SpareItemCreate, SpareItemOut, SpareItemUpdate, SpareInward,
    SpareIssueCreate, SpareIssueOut,
)

router = APIRouter()


@router.get("/stores/spares")
async def get_spares(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores")),
):
    stmt = select(Spare)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": items,
    }


@router.post("/stores/spares", response_model=SpareItemOut)
async def create_spare(
    req: SpareItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores", write=True)),
):
    spare = Spare(
        code=req.item_code,
        name=req.name,
        category=req.category,
        unit=req.unit,
        stock=req.current_stock,
        min_stock=req.reorder_level,
        location=req.location,
    )
    db.add(spare)
    await db.flush()
    return spare


@router.get("/stores/issues")
async def get_issues(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores")),
):
    stmt = select(SpareIssue).order_by(SpareIssue.created_at.desc())
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": items,
    }


@router.post("/stores/issues", response_model=SpareIssueOut)
async def create_issue(
    req: SpareIssueCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores", write=True)),
):
    issue = SpareIssue(
        date=datetime.now().strftime("%Y-%m-%d"),
        spare_id=req.item_id,
        quantity=req.quantity,
        purpose=req.purpose,
        issued_by=current_user.name,
    )
    db.add(issue)
    spare_result = await db.execute(select(Spare).where(Spare.id == req.item_id))
    spare = spare_result.scalar_one_or_none()
    if spare:
        spare.stock -= req.quantity
    await db.flush()
    return issue
