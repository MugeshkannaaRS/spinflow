"""
Quality Module v2 — Full form CRUD + Sequential Approval Engine
Routes are prefixed /quality/v2/ to avoid collision with existing /quality/* routes.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.core.deps import get_current_user, get_mill_scope, require_module
from app.db.session import get_db
from app.models.quality_forms import (
    QmCountSpec, QmApprovalTemplate, QmFormApproval,
    # Carding
    QmBackProcessAllocation, QmCardingWasteStudy, QmCardingCvRecord,
    QmCardingWrapping, QmCardingDfkPressure, QmCardingCfdCheck,
    QmCardingSpeedRecord, QmCardingFlatsCleaning, QmDailyWastage,
    # Drawing
    QmDrawingCheck, QmCotRollerChange, QmSliverWrapping, QmDrawingCvRecord,
    QmAPctCheck, QmDrawMonitorCheck, QmDrawingStopOccurrences,
    QmDrawingSpeedCheck, QmCanRandomisationCheck,
    # Simplex
    QmSimplexCheck, QmSimplexHankTest, QmSimplexBobbinWeight,
    QmSimplexBreakageStudy, QmSimplexStretchPct, QmSimplexSpeedCheck,
    QmSimplexNozzleCheck,
    # Ring Frame
    QmRfSnapStudy, QmRfTraverseCheck, QmRfQcChecklist, QmRfCleaningCheck,
    QmRfKneeBreakCheck, QmRfMonitorSettings, QmRfCspReport, QmRfBreakageStudy,
    QmRfDoffBreakage, QmRfRestartBreakage, QmRfCountTest, QmRfSpindleSlippage,
    QmRfTravellerLoading, QmRfSpacerCheck,
    # Auto Coner
    QmYarnFaultsUster, QmClassimatResults, QmBagFaults, QmDailyRejectCone,
    QmConeRejectionReport, QmShadeCone, QmJMarkCones, QmWaxPickup,
    QmSpliceStrength, QmSpliceAppearance, QmTailEndCheck,
    QmDrumBreakCradleLifting, QmWaxRotatingCheck, QmDrumAdapterCleaning,
    QmUsterClearerCheck, QmLotRunout, QmFinishingBreaksStudy, QmUvLightAudit,
    # Packing
    QmPwseCheck, QmBlendTest,
)
from app.db.base import generate_uuid

router = APIRouter(
    prefix="/quality/v2",
    tags=["Quality Module v2"],
    dependencies=[Depends(require_module("quality"))],
)

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _model_to_dict(obj) -> Dict[str, Any]:
    """Convert SQLAlchemy model to dict, skipping internal SA state."""
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


async def _paginate(
    stmt,
    db: AsyncSession,
    page: int,
    page_size: int,
    model,
) -> Dict[str, Any]:
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    items = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {
        "data": [_model_to_dict(i) for i in items],
        "total": total,
        "page": page,
        "per_page": page_size,
    }


def _apply_mill_scope(stmt, model, scope: tuple):
    mill_id, company_id = scope
    if mill_id:
        stmt = stmt.where(model.mill_id == mill_id)
    return stmt


def _set_mill_id(payload: dict, scope: tuple) -> dict:
    mill_id, _ = scope
    payload["mill_id"] = mill_id
    return payload


# ---------------------------------------------------------------------------
# Generic CRUD factory — avoids 60× copy-pasted endpoint blocks
# ---------------------------------------------------------------------------

def _make_crud_routes(
    router: APIRouter,
    path: str,
    model,
    *,
    extra_filters: Optional[List] = None,
):
    """
    Registers GET (list), GET /{id}, POST, PATCH /{id} for `model`.
    All endpoints are scoped by mill_id from get_mill_scope.
    """
    tag = model.__tablename__

    @router.get(path, summary=f"List {tag}")
    async def list_records(
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        date: Optional[str] = Query(None),
        lot_no: Optional[str] = Query(None),
        machine_no: Optional[str] = Query(None),
        shift_code: Optional[str] = Query(None),
        status_filter: Optional[str] = Query(None, alias="status"),
        scope: tuple = Depends(get_mill_scope),
        db: AsyncSession = Depends(get_db),
    ):
        stmt = select(model)
        stmt = _apply_mill_scope(stmt, model, scope)
        if date and hasattr(model, "date"):
            stmt = stmt.where(model.date == date)
        if lot_no and hasattr(model, "lot_no"):
            stmt = stmt.where(model.lot_no.ilike(f"%{lot_no}%"))
        if machine_no and hasattr(model, "machine_no"):
            stmt = stmt.where(model.machine_no == machine_no)
        if shift_code and hasattr(model, "shift_code"):
            stmt = stmt.where(model.shift_code == shift_code)
        if status_filter and hasattr(model, "status"):
            stmt = stmt.where(model.status == status_filter)
        if hasattr(model, "date"):
            stmt = stmt.order_by(model.date.desc())
        return await _paginate(stmt, db, page, page_size, model)

    @router.get(f"{path}/{{record_id}}", summary=f"Get {tag}")
    async def get_record(
        record_id: str,
        scope: tuple = Depends(get_mill_scope),
        db: AsyncSession = Depends(get_db),
    ):
        obj = await db.get(model, record_id)
        if not obj:
            raise HTTPException(status_code=404, detail=f"{tag} not found")
        mill_id, _ = scope
        if mill_id and getattr(obj, "mill_id", None) != mill_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        return _model_to_dict(obj)

    @router.post(path, status_code=201, summary=f"Create {tag}")
    async def create_record(
        payload: Dict[str, Any],
        scope: tuple = Depends(get_mill_scope),
        db: AsyncSession = Depends(get_db),
    ):
        payload = _set_mill_id(payload, scope)
        payload["id"] = generate_uuid()
        obj = model(**{k: v for k, v in payload.items() if hasattr(model, k)})
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return _model_to_dict(obj)

    @router.patch(f"{path}/{{record_id}}", summary=f"Update {tag}")
    async def update_record(
        record_id: str,
        payload: Dict[str, Any],
        scope: tuple = Depends(get_mill_scope),
        db: AsyncSession = Depends(get_db),
    ):
        obj = await db.get(model, record_id)
        if not obj:
            raise HTTPException(status_code=404, detail=f"{tag} not found")
        mill_id, _ = scope
        if mill_id and getattr(obj, "mill_id", None) != mill_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        for k, v in payload.items():
            if k not in ("id", "mill_id", "created_at") and hasattr(obj, k):
                setattr(obj, k, v)
        await db.commit()
        await db.refresh(obj)
        return _model_to_dict(obj)

    return list_records, get_record, create_record, update_record


# Register all form CRUD routes
_ROUTES = [
    # Masters
    ("/count-specs",               QmCountSpec),
    ("/approval-templates",        QmApprovalTemplate),
    # Carding
    ("/carding/back-process",      QmBackProcessAllocation),
    ("/carding/waste-study",       QmCardingWasteStudy),
    ("/carding/cv-record",         QmCardingCvRecord),
    ("/carding/wrapping",          QmCardingWrapping),
    ("/carding/dfk-pressure",      QmCardingDfkPressure),
    ("/carding/cfd-check",         QmCardingCfdCheck),
    ("/carding/speed-record",      QmCardingSpeedRecord),
    ("/carding/flats-cleaning",    QmCardingFlatsCleaning),
    ("/carding/daily-wastage",     QmDailyWastage),
    # Drawing
    ("/drawing/check",             QmDrawingCheck),
    ("/drawing/cot-roller",        QmCotRollerChange),
    ("/drawing/sliver-wrapping",   QmSliverWrapping),
    ("/drawing/cv-record",         QmDrawingCvRecord),
    ("/drawing/a-pct",             QmAPctCheck),
    ("/drawing/monitor-check",     QmDrawMonitorCheck),
    ("/drawing/stop-occurrences",  QmDrawingStopOccurrences),
    ("/drawing/speed-check",       QmDrawingSpeedCheck),
    ("/drawing/can-randomisation", QmCanRandomisationCheck),
    # Simplex
    ("/simplex/check",             QmSimplexCheck),
    ("/simplex/hank-test",         QmSimplexHankTest),
    ("/simplex/bobbin-weight",     QmSimplexBobbinWeight),
    ("/simplex/breakage-study",    QmSimplexBreakageStudy),
    ("/simplex/stretch-pct",       QmSimplexStretchPct),
    ("/simplex/speed-check",       QmSimplexSpeedCheck),
    ("/simplex/nozzle-check",      QmSimplexNozzleCheck),
    # Ring Frame
    ("/ring-frame/snap-study",         QmRfSnapStudy),
    ("/ring-frame/traverse-check",     QmRfTraverseCheck),
    ("/ring-frame/qc-checklist",       QmRfQcChecklist),
    ("/ring-frame/cleaning-check",     QmRfCleaningCheck),
    ("/ring-frame/knee-break",         QmRfKneeBreakCheck),
    ("/ring-frame/monitor-settings",   QmRfMonitorSettings),
    ("/ring-frame/csp-report",         QmRfCspReport),
    ("/ring-frame/breakage-study",     QmRfBreakageStudy),
    ("/ring-frame/doff-breakage",      QmRfDoffBreakage),
    ("/ring-frame/restart-breakage",   QmRfRestartBreakage),
    ("/ring-frame/count-test",         QmRfCountTest),
    ("/ring-frame/spindle-slippage",   QmRfSpindleSlippage),
    ("/ring-frame/traveller-loading",  QmRfTravellerLoading),
    ("/ring-frame/spacer-check",       QmRfSpacerCheck),
    # Auto Coner
    ("/auto-coner/yarn-faults",         QmYarnFaultsUster),
    ("/auto-coner/classimat",           QmClassimatResults),
    ("/auto-coner/bag-faults",          QmBagFaults),
    ("/auto-coner/daily-reject-cone",   QmDailyRejectCone),
    ("/auto-coner/cone-rejection",      QmConeRejectionReport),
    ("/auto-coner/shade-cone",          QmShadeCone),
    ("/auto-coner/j-mark-cones",        QmJMarkCones),
    ("/auto-coner/wax-pickup",          QmWaxPickup),
    ("/auto-coner/splice-strength",     QmSpliceStrength),
    ("/auto-coner/splice-appearance",   QmSpliceAppearance),
    ("/auto-coner/tail-end-check",      QmTailEndCheck),
    ("/auto-coner/drum-break",          QmDrumBreakCradleLifting),
    ("/auto-coner/wax-rotating",        QmWaxRotatingCheck),
    ("/auto-coner/drum-adapter",        QmDrumAdapterCleaning),
    ("/auto-coner/uster-clearer",       QmUsterClearerCheck),
    ("/auto-coner/lot-runout",          QmLotRunout),
    ("/auto-coner/finishing-breaks",    QmFinishingBreaksStudy),
    ("/auto-coner/uv-audit",            QmUvLightAudit),
    # Packing
    ("/packing/pwse-check",    QmPwseCheck),
    ("/packing/blend-test",    QmBlendTest),
]

for _path, _model in _ROUTES:
    _make_crud_routes(router, _path, _model)


# ---------------------------------------------------------------------------
# Approval Engine
# ---------------------------------------------------------------------------

class ApprovalAction(BaseModel):
    form_type: str
    record_id: str
    action: str = Field(..., pattern="^(approve|reject|reopen)$")
    rejection_note: Optional[str] = None


@router.get("/approvals/{form_type}/{record_id}", summary="List approvals for a record")
async def list_approvals(
    form_type: str,
    record_id: str,
    scope: tuple = Depends(get_mill_scope),
    db: AsyncSession = Depends(get_db),
):
    mill_id, _ = scope
    stmt = (
        select(QmFormApproval)
        .where(
            QmFormApproval.mill_id == mill_id,
            QmFormApproval.form_type == form_type,
            QmFormApproval.record_id == record_id,
        )
        .order_by(QmFormApproval.approval_level)
    )
    approvals = (await db.execute(stmt)).scalars().all()
    return [_model_to_dict(a) for a in approvals]


@router.post("/approvals/action", summary="Approve / reject / re-open a record")
async def approval_action(
    body: ApprovalAction,
    scope: tuple = Depends(get_mill_scope),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    mill_id, _ = scope

    # Fetch template to know required levels + role sequence
    template = (
        await db.execute(
            select(QmApprovalTemplate).where(
                QmApprovalTemplate.mill_id == mill_id,
                QmApprovalTemplate.form_type == body.form_type,
            )
        )
    ).scalar_one_or_none()

    if not template:
        # Fallback: single-level approval if no template configured
        required_roles = [getattr(current_user, "role", "QCO")]
    else:
        required_roles = template.required_roles_json  # list of role codes in order

    # Existing approvals for this record
    existing_stmt = (
        select(QmFormApproval)
        .where(
            QmFormApproval.mill_id == mill_id,
            QmFormApproval.form_type == body.form_type,
            QmFormApproval.record_id == body.record_id,
        )
        .order_by(QmFormApproval.approval_level)
    )
    existing = (await db.execute(existing_stmt)).scalars().all()
    approved_levels = {a.approval_level for a in existing if a.status == "approved"}
    rejected_levels = {a.approval_level for a in existing if a.status == "rejected"}
    existing_map = {a.approval_level: a for a in existing}

    if body.action == "reopen":
        # Clear ALL approvals — forces restart from level 1
        for a in existing:
            a.status = "pending"
            a.approved_at = None
            a.rejection_note = None
        await db.commit()
        return {"message": "Record reopened — all approvals cleared"}

    # Determine this user's level based on role
    user_role = getattr(current_user, "role", None)
    try:
        user_level = required_roles.index(user_role) + 1  # 1-based
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role '{user_role}' is not in the approval chain for {body.form_type}",
        )

    # Sequential check: all lower levels must be approved first
    for lvl in range(1, user_level):
        if lvl not in approved_levels:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Level {lvl} approval must be completed before level {user_level}",
            )

    if body.action == "approve":
        if user_level in rejected_levels:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot approve a rejected level — re-open the record first",
            )
        if user_level in existing_map:
            rec = existing_map[user_level]
            rec.status = "approved"
            rec.approved_at = datetime.now(timezone.utc)
            rec.employee_id = str(current_user.id) if hasattr(current_user, "id") else None
            rec.employee_name = getattr(current_user, "full_name", None) or getattr(current_user, "email", None)
        else:
            db.add(QmFormApproval(
                id=generate_uuid(),
                mill_id=mill_id,
                form_type=body.form_type,
                record_id=body.record_id,
                approval_level=user_level,
                role_code=user_role,
                employee_id=str(current_user.id) if hasattr(current_user, "id") else None,
                employee_name=getattr(current_user, "full_name", None) or getattr(current_user, "email", None),
                status="approved",
                approved_at=datetime.now(timezone.utc),
            ))

        # Update the record's status field if all levels approved
        all_approved = all((lvl in approved_levels or lvl == user_level) for lvl in range(1, len(required_roles) + 1))
        if all_approved:
            await _set_form_status(body.form_type, body.record_id, "approved", db)

    elif body.action == "reject":
        db.add(QmFormApproval(
            id=generate_uuid(),
            mill_id=mill_id,
            form_type=body.form_type,
            record_id=body.record_id,
            approval_level=user_level,
            role_code=user_role,
            employee_id=str(current_user.id) if hasattr(current_user, "id") else None,
            employee_name=getattr(current_user, "full_name", None) or getattr(current_user, "email", None),
            status="rejected",
            rejection_note=body.rejection_note,
        ))
        await _set_form_status(body.form_type, body.record_id, "rejected", db)

    await db.commit()
    return {"message": f"Record {body.action}d at level {user_level}"}


async def _set_form_status(form_type: str, record_id: str, new_status: str, db: AsyncSession):
    """Update the status column on the underlying form table."""
    # Map form_type slug → model class
    _SLUG_MAP: Dict[str, Any] = {
        "back_process_allocation": QmBackProcessAllocation,
        "carding_waste_study": QmCardingWasteStudy,
        "carding_cv_record": QmCardingCvRecord,
        "carding_wrapping": QmCardingWrapping,
        "carding_dfk_pressure": QmCardingDfkPressure,
        "carding_cfd_check": QmCardingCfdCheck,
        "carding_speed_record": QmCardingSpeedRecord,
        "carding_flats_cleaning": QmCardingFlatsCleaning,
        "daily_wastage": QmDailyWastage,
        "drawing_check": QmDrawingCheck,
        "cot_roller_change": QmCotRollerChange,
        "sliver_wrapping": QmSliverWrapping,
        "drawing_cv_record": QmDrawingCvRecord,
        "a_pct_check": QmAPctCheck,
        "draw_monitor_check": QmDrawMonitorCheck,
        "drawing_stop_occurrences": QmDrawingStopOccurrences,
        "drawing_speed_check": QmDrawingSpeedCheck,
        "can_randomisation_check": QmCanRandomisationCheck,
        "simplex_check": QmSimplexCheck,
        "simplex_hank_test": QmSimplexHankTest,
        "simplex_bobbin_weight": QmSimplexBobbinWeight,
        "simplex_breakage_study": QmSimplexBreakageStudy,
        "simplex_stretch_pct": QmSimplexStretchPct,
        "simplex_speed_check": QmSimplexSpeedCheck,
        "simplex_nozzle_check": QmSimplexNozzleCheck,
        "rf_snap_study": QmRfSnapStudy,
        "rf_traverse_check": QmRfTraverseCheck,
        "rf_qc_checklist": QmRfQcChecklist,
        "rf_cleaning_check": QmRfCleaningCheck,
        "rf_knee_break_check": QmRfKneeBreakCheck,
        "rf_monitor_settings": QmRfMonitorSettings,
        "rf_csp_report": QmRfCspReport,
        "rf_breakage_study": QmRfBreakageStudy,
        "rf_doff_breakage": QmRfDoffBreakage,
        "rf_restart_breakage": QmRfRestartBreakage,
        "rf_count_test": QmRfCountTest,
        "rf_spindle_slippage": QmRfSpindleSlippage,
        "rf_traveller_loading": QmRfTravellerLoading,
        "rf_spacer_check": QmRfSpacerCheck,
        "yarn_faults_uster": QmYarnFaultsUster,
        "classimat_results": QmClassimatResults,
        "bag_faults": QmBagFaults,
        "daily_reject_cone": QmDailyRejectCone,
        "cone_rejection_report": QmConeRejectionReport,
        "shade_cone": QmShadeCone,
        "j_mark_cones": QmJMarkCones,
        "wax_pickup": QmWaxPickup,
        "splice_strength": QmSpliceStrength,
        "splice_appearance": QmSpliceAppearance,
        "tail_end_check": QmTailEndCheck,
        "drum_break_cradle_lifting": QmDrumBreakCradleLifting,
        "wax_rotating_check": QmWaxRotatingCheck,
        "drum_adapter_cleaning": QmDrumAdapterCleaning,
        "uster_clearer_check": QmUsterClearerCheck,
        "lot_runout": QmLotRunout,
        "finishing_breaks_study": QmFinishingBreaksStudy,
        "uv_light_audit": QmUvLightAudit,
        "pwse_check": QmPwseCheck,
        "blend_test": QmBlendTest,
    }
    model = _SLUG_MAP.get(form_type)
    if model and hasattr(model, "status"):
        await db.execute(
            sa_update(model).where(model.id == record_id).values(status=new_status)
        )


# ---------------------------------------------------------------------------
# Quality Dashboard — summary per department
# ---------------------------------------------------------------------------

@router.get("/dashboard/summary", summary="Quality forms summary by department")
async def quality_dashboard_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    scope: tuple = Depends(get_mill_scope),
    db: AsyncSession = Depends(get_db),
):
    mill_id, _ = scope

    async def _count(model, date_col="date"):
        stmt = select(func.count()).select_from(model).where(model.mill_id == mill_id)
        if date_from and hasattr(model, date_col):
            stmt = stmt.where(getattr(model, date_col) >= date_from)
        if date_to and hasattr(model, date_col):
            stmt = stmt.where(getattr(model, date_col) <= date_to)
        return (await db.execute(stmt)).scalar() or 0

    async def _count_by_status(model, s):
        stmt = (
            select(func.count()).select_from(model)
            .where(model.mill_id == mill_id, model.status == s)
        )
        if date_from and hasattr(model, "date"):
            stmt = stmt.where(model.date >= date_from)
        if date_to and hasattr(model, "date"):
            stmt = stmt.where(model.date <= date_to)
        return (await db.execute(stmt)).scalar() or 0

    carding_models = [
        QmCardingWasteStudy, QmCardingCvRecord, QmCardingWrapping,
        QmCardingDfkPressure, QmCardingCfdCheck, QmCardingSpeedRecord,
        QmCardingFlatsCleaning, QmDailyWastage,
    ]
    drawing_models = [
        QmDrawingCheck, QmSliverWrapping, QmDrawingCvRecord, QmAPctCheck,
        QmDrawMonitorCheck, QmDrawingStopOccurrences, QmDrawingSpeedCheck,
    ]
    simplex_models = [
        QmSimplexCheck, QmSimplexHankTest, QmSimplexBobbinWeight,
        QmSimplexBreakageStudy, QmSimplexStretchPct,
    ]
    rf_models = [
        QmRfSnapStudy, QmRfCspReport, QmRfBreakageStudy,
        QmRfCountTest, QmRfMonitorSettings,
    ]
    ac_models = [
        QmYarnFaultsUster, QmClassimatResults, QmBagFaults,
        QmDailyRejectCone, QmWaxPickup, QmSpliceStrength,
        QmFinishingBreaksStudy,
    ]
    packing_models = [QmBlendTest, QmPwseCheck]

    async def _dept_stats(models):
        total = sum([await _count(m) for m in models])
        approved = sum([await _count_by_status(m, "approved") for m in models])
        pending = sum([await _count_by_status(m, "draft") for m in models])
        return {"total": total, "approved": approved, "pending": pending}

    return {
        "carding": await _dept_stats(carding_models),
        "drawing": await _dept_stats(drawing_models),
        "simplex": await _dept_stats(simplex_models),
        "ring_frame": await _dept_stats(rf_models),
        "auto_coner": await _dept_stats(ac_models),
        "packing": await _dept_stats(packing_models),
    }


# ---------------------------------------------------------------------------
# CSP Trend (ring frame)
# ---------------------------------------------------------------------------

@router.get("/ring-frame/csp-trend", summary="CSP trend for date range")
async def csp_trend(
    days: int = Query(30, ge=7, le=90),
    lot_no: Optional[str] = Query(None),
    scope: tuple = Depends(get_mill_scope),
    db: AsyncSession = Depends(get_db),
):
    mill_id, _ = scope
    from datetime import timedelta, date as _date
    cutoff = (_date.today() - timedelta(days=days)).isoformat()
    stmt = (
        select(QmRfCspReport)
        .where(
            QmRfCspReport.mill_id == mill_id,
            QmRfCspReport.date >= cutoff,
        )
        .order_by(QmRfCspReport.date)
    )
    if lot_no:
        stmt = stmt.where(QmRfCspReport.lot_no == lot_no)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "date": r.date,
            "machine_no": r.machine_no,
            "lot_no": r.lot_no,
            "count_ne": r.count_ne,
            "avg_csp": r.avg_csp,
            "cv_pct": r.cv_pct,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Lot-level quality summary (all departments for one lot)
# ---------------------------------------------------------------------------

@router.get("/lot/{lot_no}/summary", summary="All quality records for a lot")
async def lot_quality_summary(
    lot_no: str,
    scope: tuple = Depends(get_mill_scope),
    db: AsyncSession = Depends(get_db),
):
    mill_id, _ = scope

    async def _fetch(model):
        if not hasattr(model, "lot_no"):
            return []
        rows = (
            await db.execute(
                select(model)
                .where(model.mill_id == mill_id, model.lot_no == lot_no)
                .order_by(model.date.desc() if hasattr(model, "date") else model.id.desc())
                .limit(100)
            )
        ).scalars().all()
        return [_model_to_dict(r) for r in rows]

    return {
        "lot_no": lot_no,
        "carding": {
            "cv_records": await _fetch(QmCardingCvRecord),
            "waste_study": await _fetch(QmCardingWasteStudy),
            "wrapping": await _fetch(QmCardingWrapping),
        },
        "drawing": {
            "cv_records": await _fetch(QmDrawingCvRecord),
            "sliver_wrapping": await _fetch(QmSliverWrapping),
            "a_pct": await _fetch(QmAPctCheck),
        },
        "simplex": {
            "hank_test": await _fetch(QmSimplexHankTest),
            "bobbin_weight": await _fetch(QmSimplexBobbinWeight),
            "breakage_study": await _fetch(QmSimplexBreakageStudy),
        },
        "ring_frame": {
            "csp_report": await _fetch(QmRfCspReport),
            "count_test": await _fetch(QmRfCountTest),
            "breakage_study": await _fetch(QmRfBreakageStudy),
        },
        "auto_coner": {
            "yarn_faults": await _fetch(QmYarnFaultsUster),
            "classimat": await _fetch(QmClassimatResults),
            "bag_faults": await _fetch(QmBagFaults),
            "wax_pickup": await _fetch(QmWaxPickup),
            "splice_strength": await _fetch(QmSpliceStrength),
        },
        "packing": {
            "blend_test": await _fetch(QmBlendTest),
        },
    }
