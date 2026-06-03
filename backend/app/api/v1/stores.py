import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Any, Dict
from datetime import datetime
from pydantic import BaseModel

from app.db.session import get_db

logger = logging.getLogger(__name__)
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
MAX_BATCH = 500


@router.get("/stores/spares")
async def get_spares(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    stmt = select(Spare)
    if effective_mill_id:
        stmt = stmt.where(Spare.mill_id == effective_mill_id)
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Spare.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    try:
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
    except Exception as e:
        logger.error(f"stores.spares list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/stores/spares", response_model=SpareItemOut)
async def create_spare(
    req: SpareItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope["mill_id"] or current_user.mill_id
    if not mill_id and scope["company_id"]:
        raise HTTPException(status_code=400, detail="Cannot determine mill_id for MILL_OWNER")
    spare = Spare(
        code=req.item_code,
        name=req.name,
        category=req.category,
        unit=req.unit,
        stock=req.current_stock,
        min_stock=req.reorder_level,
        location=req.location,
        mill_id=mill_id,
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
    if len(req.items) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    scope = await get_mill_scope(current_user, db)
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
            existing = await db.execute(select(Spare).where(Spare.code == code, Spare.mill_id == mill_id))
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
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    stmt = select(SpareIssue).order_by(SpareIssue.created_at.desc())
    if effective_mill_id:
        stmt = stmt.where(SpareIssue.mill_id == effective_mill_id)
    elif scope["company_id"]:
        stmt = stmt.join(Mill, SpareIssue.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    try:
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
    except Exception as e:
        logger.error(f"stores.issues list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/stores/issues", response_model=SpareIssueOut)
async def create_issue(
    req: SpareIssueCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    mill_id = scope["mill_id"] or current_user.mill_id
    if not mill_id and scope["company_id"]:
        raise HTTPException(status_code=400, detail="Cannot determine mill_id for MILL_OWNER")
    issue = SpareIssue(
        date=datetime.now().strftime("%Y-%m-%d"),
        spare_id=req.item_id,
        quantity=req.quantity,
        purpose=req.purpose,
        issued_by=current_user.name,
        mill_id=mill_id,
    )
    db.add(issue)
    stmt = select(Spare).where(Spare.id == req.item_id)
    if scope["mill_id"]:
        stmt = stmt.where(Spare.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Spare.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    spare_result = await db.execute(stmt)
    spare = spare_result.scalar_one_or_none()
    if not spare:
        raise HTTPException(status_code=404, detail="Spare not found")
    if spare.stock < req.quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {spare.stock}, Requested: {req.quantity}")
    spare.stock -= req.quantity
    await db.flush()
    return issue


@router.put("/stores/spares/{spare_id}", response_model=SpareItemOut)
async def update_spare(
    spare_id: str,
    req: SpareItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Spare).where(Spare.id == spare_id)
    if scope["mill_id"]:
        stmt = stmt.where(Spare.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Spare.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    spare = result.scalar_one_or_none()
    if not spare:
        raise HTTPException(status_code=404, detail="Spare not found")
    if req.name is not None:
        spare.name = req.name
    if req.category is not None:
        spare.category = req.category
    if req.unit is not None:
        spare.unit = req.unit
    if req.current_stock is not None:
        spare.stock = req.current_stock
    if req.reorder_level is not None:
        spare.min_stock = req.reorder_level
    if req.location is not None:
        spare.location = req.location
    if req.unit_price is not None:
        spare.unit_price = req.unit_price
    await db.flush()
    return spare


@router.post("/stores/spares/{spare_id}/receive", response_model=SpareItemOut)
async def receive_spare_stock(
    spare_id: str,
    req: SpareInward,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    stmt = select(Spare).where(Spare.id == spare_id)
    if scope["mill_id"]:
        stmt = stmt.where(Spare.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Spare.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    spare = result.scalar_one_or_none()
    if not spare:
        raise HTTPException(status_code=404, detail="Spare not found")
    spare.stock = (spare.stock or 0) + req.quantity
    if req.unit_price is not None:
        spare.unit_price = req.unit_price
    await db.flush()
    return spare


@router.get("/stores/page-init")
async def stores_page_init(
    mill_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("stores")),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")
    effective_mill_id = scope.get("mill_id")

    if mill_id:
        if role_code == "SUPER_ADMIN":
            effective_mill_id = mill_id
        elif role_code == "MILL_OWNER":
            mill_check = await db.execute(
                select(Mill).where(
                    Mill.id == mill_id,
                    Mill.company_id == current_user.company_id,
                )
            )
            if mill_check.scalar_one_or_none():
                effective_mill_id = mill_id

    result: Dict[str, Any] = {}
    try:
        q = select(Spare.category, func.count().label("count"))
        if effective_mill_id:
            q = q.where(Spare.mill_id == effective_mill_id)
        elif scope["company_id"]:
            q = q.join(Mill, Spare.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
        q = q.where(Spare.category != None, Spare.category != "").group_by(Spare.category).order_by(Spare.category)
        rows = await db.execute(q)
        result["categories"] = [{"name": r.category, "count": r.count} for r in rows]
    except Exception as e:
        logger.error(f"stores.page-init error: {e}")
        result["categories"] = []
    return result
