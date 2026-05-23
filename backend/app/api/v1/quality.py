from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.session import get_db
from app.core.deps import get_current_user, require_module
from app.models.user import User
from app.models.quality import QualityApproval, LabReport
from app.schemas.quality import (
    QualityTestResponse, QualityTestCreate,
    QualityApprovalResponse, QualityApprovalAction,
)
from app.services.quality_service import QualityService

router = APIRouter()


@router.get("/quality/tests")
async def get_tests(
    date: Optional[str] = Query(None),
    lot_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    svc = QualityService(db, current_user)
    return await svc.list_tests(date=date, lot_id=lot_id, status=status, page=page, page_size=page_size)


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


@router.patch("/quality/tests/{test_id}/approve", response_model=QualityTestResponse)
async def approve_test(
    test_id: str,
    result: str = Query(..., regex="^(approved|rejected)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality", write=True)),
):
    svc = QualityService(db, current_user)
    return await svc.approve_test(test_id, result)


@router.get("/quality/lots")
async def list_lots(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    svc = QualityService(db, current_user)
    return await svc.list_lots(page=page, page_size=page_size)


@router.get("/quality/lots/{lot_id}/tests", response_model=List[QualityTestResponse])
async def get_lot_tests(
    lot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    svc = QualityService(db, current_user)
    return await svc.get_lot_tests(lot_id)


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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    from sqlalchemy import select

    stmt = select(QualityApproval).order_by(QualityApproval.created_at.desc())
    result = await db.execute(stmt)
    approvals = result.scalars().all()

    out = []
    for a in approvals:
        report_result = await db.execute(
            select(LabReport).where(LabReport.lot_id == a.lot_id).order_by(LabReport.created_at.desc()).limit(1)
        )
        report = report_result.scalar_one_or_none()

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
    return out


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

    stmt = select(QualityApproval).where(QualityApproval.id == approval_id)
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("quality")),
):
    from app.models.quality import QualityTest
    from sqlalchemy import select

    stmt = select(QualityTest).where(QualityTest.status == "fail").order_by(QualityTest.created_at.desc())
    result = await db.execute(stmt)
    tests = result.scalars().all()

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
    return out
