from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Any, Dict
from pydantic import BaseModel

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.quality import QualityApproval, LabReport, QualityTest
from app.models.inventory import Lot
from app.models.masters import Mill
from app.schemas.quality import (
    QualityTestResponse, QualityTestCreate,
    QualityApprovalResponse, QualityApprovalAction,
)
from app.schemas.inventory import LotOut
from app.services.quality_service import QualityService


class QualityTestBulkRequest(BaseModel):
    items: List[Dict[str, Any]]


MAX_BATCH = 500


# Performance indexes (run on database):
#   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quality_tests_lot_date_status
#     ON quality_tests (lot_id, date, status);
#   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quality_tests_status
#     ON quality_tests (status);
#   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lots_mill_id
#     ON lots (mill_id);

router = APIRouter()


@router.get("/quality/tests")
async def get_tests(
    date: Optional[str] = Query(None),
    lot_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
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

    query = select(QualityTest).join(Lot, QualityTest.lot_id == Lot.id)
    if effective_mill_id:
        query = query.where(Lot.mill_id == effective_mill_id)
    elif scope["company_id"]:
        query = query.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    if date:
        query = query.where(QualityTest.date == date)
    if lot_id:
        query = query.where(QualityTest.lot_id == lot_id)
    if status:
        query = query.where(QualityTest.status == status)
    query = query.order_by(QualityTest.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "data": [QualityTestResponse.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"quality.tests list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.post("/quality/tests", response_model=QualityTestResponse)
async def create_test(
    req: QualityTestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality", write=True)),
):
    svc = QualityService(db, current_user)
    return await svc.create_test(
        date=req.date,
        type=req.type,
        result=req.result,
        standard=req.standard,
        lot_id=req.lot_id,
        lot_no=req.lot_no,
        machine_code=req.machine_code,
        sample_ref=req.sample_ref,
        unit=req.unit,
        tested_by=req.tested_by,
    )


@router.post("/quality/tests/bulk")
async def bulk_create_tests(
    req: QualityTestBulkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality", write=True)),
):
    if len(req.items) > MAX_BATCH:
        raise HTTPException(400, detail=f"Maximum {MAX_BATCH} items per batch")
    scope = await get_mill_scope(current_user, db)
    created = 0
    skipped = 0
    errors: List[str] = []
    for i, row in enumerate(req.items):
        try:
            date = str(row.get("date") or "").strip()
            test_type = str(row.get("type") or row.get("test_type") or "").strip()
            result_val = row.get("result") or row.get("value")
            standard_val = row.get("standard") or row.get("standard_value")
            if not date or not test_type or result_val is None:
                skipped += 1
                errors.append(f"Row {i + 1}: missing date, type, or result")
                continue
            lot_no = str(row.get("lot_no") or "").strip() or None
            if lot_no:
                lot_result = await db.execute(
                    select(Lot).where(Lot.lot_no == lot_no)
                )
                lot = lot_result.scalar_one_or_none()
                if not lot:
                    skipped += 1
                    errors.append(f"Row {i + 1}: lot '{lot_no}' not found")
                    continue
                if scope["mill_id"] and lot.mill_id != scope["mill_id"]:
                    skipped += 1
                    errors.append(f"Row {i + 1}: lot '{lot_no}' not in your scope")
                    continue
                if scope["company_id"] and not scope["mill_id"]:
                    mill_result = await db.execute(
                        select(Mill).where(Mill.id == lot.mill_id, Mill.company_id == scope["company_id"])
                    )
                    if not mill_result.scalar_one_or_none():
                        skipped += 1
                        errors.append(f"Row {i + 1}: lot '{lot_no}' not in your company")
                        continue
            test = QualityTest(
                date=date,
                type=test_type,
                lot_no=lot_no,
                result=float(result_val),
                standard=float(standard_val) if standard_val is not None else 0.0,
                unit=str(row.get("unit") or "").strip() or None,
                machine_code=str(row.get("machine_code") or "").strip() or None,
                sample_ref=str(row.get("sample_ref") or "").strip() or None,
                tested_by=str(row.get("tested_by") or "").strip() or None,
                status="pending",
            )
            db.add(test)
            created += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Row {i + 1}: {str(e)}")
    await db.flush()
    return {"created": created, "skipped": skipped, "errors": errors}


@router.patch("/quality/tests/{test_id}/approve", response_model=QualityTestResponse)
async def approve_test(
    test_id: str,
    result: str = Query(..., pattern="^(approved|rejected)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality", write=True)),
):
    svc = QualityService(db, current_user)
    return await svc.approve_test(test_id, result)


@router.get("/quality/lots")
async def list_lots(
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
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

    query = select(Lot)
    if effective_mill_id:
        query = query.where(Lot.mill_id == effective_mill_id)
    elif scope["company_id"]:
        query = query.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    query = query.order_by(Lot.created_at.desc())
    try:
        count_stmt = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = result.scalars().all()
        pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "data": [LotOut.model_validate(item).model_dump() for item in items],
        }
    except Exception as e:
        logger.error(f"quality.lots list error: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "data": []}


@router.get("/quality/lots/{lot_id}/tests", response_model=List[QualityTestResponse])
async def get_lot_tests(
    lot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    try:
        svc = QualityService(db, current_user)
        return await svc.get_lot_tests(lot_id)
    except Exception as e:
        logger.error(f"quality.lot_tests error: {e}")
        return []


@router.get("/quality/summary")
async def quality_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    svc = QualityService(db, current_user)
    return await svc.quality_summary()


@router.get("/quality/csp-trend")
async def csp_trend(
    days: int = Query(7),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    svc = QualityService(db, current_user)
    return await svc.csp_trend(days)


@router.get("/quality/approvals")
async def list_approvals(
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
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

    base = select(QualityApproval).join(Lot, QualityApproval.lot_id == Lot.id)
    if effective_mill_id:
        base = base.where(Lot.mill_id == effective_mill_id)
    elif scope["company_id"]:
        base = base.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = base.order_by(QualityApproval.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    try:
        result = await db.execute(stmt)
        approvals = result.scalars().all()
    except Exception as e:
        logger.error(f"quality.approvals list error: {e}")
        return {"items": [], "total": 0, "page": page, "page_size": page_size}

    # Batch-fetch latest LabReport per lot_id
    lot_ids = list({a.lot_id for a in approvals if a.lot_id})
    reports_by_lot: dict[str, LabReport | None] = {}
    if lot_ids:
        from sqlalchemy import desc as sa_desc
        latest_sub = (
            select(LabReport.lot_id, func.max(LabReport.created_at).label("max_created"))
            .where(LabReport.lot_id.in_(lot_ids))
            .group_by(LabReport.lot_id)
        ).subquery()
        report_result = await db.execute(
            select(LabReport).join(
                latest_sub,
                (LabReport.lot_id == latest_sub.c.lot_id) & (LabReport.created_at == latest_sub.c.max_created),
            )
        )
        for r in report_result.scalars().all():
            reports_by_lot[r.lot_id] = r

    out = []
    for a in approvals:
        report = reports_by_lot.get(a.lot_id)
        out.append({
            "id": a.id,
            "lotNo": a.lot_no,
            "department": a.department,
            "producedKg": a.produced_kg,
            "sampleDate": a.sample_date,
            "cspResult": report.csp if report else 0,
            "countResult": report.count_ne if report else 0,
            "moistureResult": report.moisture if report else 0,
            "strengthResult": report.strength if report else 0,
            "status": a.status,
            "approvedBy": a.approved_by or "",
            "approvedAt": a.approved_at.isoformat() if a.approved_at else "",
        })
    return {"items": out, "total": total, "page": page, "page_size": page_size}


@router.post("/quality/approvals/action")
async def approve_or_reject_approval(
    req: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality", write=True)),
):
    from sqlalchemy import select

    approval_id = req.get("id") or req.get("lot_id")
    action = req.get("action") or req.get("status")
    approved_by = req.get("by") or req.get("approved_by")

    if not approval_id or not action or not approved_by:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Missing required fields: id, action, by")

    action_status = "approved" if action == "approve" else "rejected"

    scope = await get_mill_scope(current_user, db)
    stmt = select(QualityApproval).join(Lot, QualityApproval.lot_id == Lot.id).where(QualityApproval.id == approval_id)
    if scope["mill_id"]:
        stmt = stmt.where(Lot.mill_id == scope["mill_id"])
    elif scope["company_id"]:
        stmt = stmt.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
    result = await db.execute(stmt)
    approval = result.scalar_one_or_none()

    if not approval:
        from app.core.error_handler import SpinFlowException, ErrorCode
        raise SpinFlowException.not_found("Quality approval")

    from datetime import datetime, timezone

    approval.status = action_status
    approval.approved_by = approved_by
    approval.approved_at = datetime.now(timezone.utc)
    await db.flush()

    return {
        "id": approval.id,
        "status": approval.status,
        "approvedBy": approval.approved_by,
        "approvedAt": approval.approved_at.isoformat(),
    }


@router.get("/quality/rejections")
async def list_rejections(
    mill_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
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

    base = select(QualityTest).join(Lot, QualityTest.lot_id == Lot.id).where(QualityTest.status == "fail")
    if effective_mill_id:
        base = base.where(Lot.mill_id == effective_mill_id)
    elif scope["company_id"]:
        base = base.join(Mill, Lot.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = base.order_by(QualityTest.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    try:
        result = await db.execute(stmt)
        tests = result.scalars().all()
    except Exception as e:
        logger.error(f"quality.rejections list error: {e}")
        return {"items": [], "total": 0, "page": page, "page_size": page_size}

    out = []
    for t in tests:
        out.append({
            "id": t.id,
            "date": t.date,
            "lotId": t.lot_id or "",
            "category": t.type,
            "quantityKg": 0,
            "reason": f"{t.type} result {t.result} below standard {t.standard}",
            "disposition": "rework",
            "notedBy": t.tested_by or "",
        })
    return {"items": out, "total": total, "page": page, "page_size": page_size}
