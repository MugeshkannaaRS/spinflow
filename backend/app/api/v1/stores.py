from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Any, Dict
from datetime import datetime
from pydantic import BaseModel

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.stores import Spare, SpareIssue
from app.models.masters import Mill
from app.schemas.stores import (
    SpareItemCreate, SpareItemOut, SpareItemUpdate, SpareInward,
    SpareIssueCreate, SpareIssueOut,
)


class SpareBulkRequest(BaseModel):
    items: List[Dict[str, Any]]

router = APIRouter()


@router.get("/stores/spares")
async def get_spares(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(Spare)
    if scope["mill_id"]:
        stmt = stmt.where(Spare.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Spare.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
        "data": [SpareItemOut.model_validate(item).model_dump() for item in items],
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


@router.post("/stores/spares/bulk")
async def bulk_create_spares(
    req: SpareBulkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores", write=True)),
):
    scope = await get_mill_scope(current_user)
    mill_id = scope.get("mill_id") or current_user.mill_id
    created = 0
    skipped = 0
    errors: List[str] = []
    for i, row in enumerate(req.items):
        try:
            code = str(row.get("item_code") or "").strip()
            name = str(row.get("name") or "").strip()
            if not code or not name:
                skipped += 1
                errors.append(f"Row {i + 1}: missing item_code or name")
                continue
            existing = await db.execute(select(Spare).where(Spare.code == code))
            if existing.scalar_one_or_none():
                skipped += 1
                continue
            spare = Spare(
                code=code,
                name=name,
                category=str(row.get("category") or "General").strip(),
                unit=str(row.get("unit") or "Nos").strip(),
                stock=float(row.get("current_stock") or 0),
                min_stock=float(row.get("reorder_level") or 0),
                mill_id=mill_id,
            )
            db.add(spare)
            created += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Row {i + 1}: {str(e)}")
    await db.flush()
    return {"created": created, "skipped": skipped, "errors": errors}


@router.get("/stores/issues")
async def get_issues(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores")),
):
    scope = await get_mill_scope(current_user)
    stmt = select(SpareIssue).order_by(SpareIssue.created_at.desc())
    if scope["mill_id"]:
        stmt = stmt.where(SpareIssue.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, SpareIssue.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
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
        "data": [SpareIssueOut.model_validate(item).model_dump() for item in items],
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
