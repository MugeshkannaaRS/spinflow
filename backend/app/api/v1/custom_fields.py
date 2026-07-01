"""
Custom Fields API — per-mill field definitions and table catalogue.
"""
from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.db.session import get_db
from app.core.deps import require_module, get_mill_scope
from app.models.user import User
from app.models.custom_fields import CustomFieldDefinition
from app.schemas.custom_fields import (
    CustomFieldDefinitionCreate,
    CustomFieldDefinitionUpdate,
    CustomFieldDefinitionOut,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Catalogue of all customisable tables, grouped by module ────────────────

CUSTOMISABLE_TABLES = {
    "production": [
        {"table_name": "production_entries", "label": "Shift Entry"},
        {"table_name": "waste_entries",      "label": "Waste Entry"},
        {"table_name": "rf_manpower_plan",   "label": "Ring Frame Manpower"},
        {"table_name": "packing_shift_entries", "label": "Packing Shift"},
        {"table_name": "downtime_logs",      "label": "Downtime Log"},
    ],
    "maintenance": [
        {"table_name": "maintenance_logs",   "label": "Maintenance Log"},
        {"table_name": "spare_issues",       "label": "Spare Issues"},
    ],
    "quality": [
        {"table_name": "quality_tests",                    "label": "Quality Tests"},
        {"table_name": "qm_carding_waste_study",           "label": "Carding Waste Study"},
        {"table_name": "qm_carding_cv_record",             "label": "Carding CV Record"},
        {"table_name": "qm_carding_wrapping",              "label": "Carding Wrapping"},
        {"table_name": "qm_carding_dfk_pressure",          "label": "Carding DFK Pressure"},
        {"table_name": "qm_carding_cfd_check",             "label": "Carding CFD Check"},
        {"table_name": "qm_carding_speed_record",          "label": "Carding Speed Record"},
        {"table_name": "qm_carding_flats_cleaning",        "label": "Carding Flats Cleaning"},
        {"table_name": "qm_daily_wastage",                 "label": "Daily Wastage"},
        {"table_name": "qm_drawing_check",                 "label": "Drawing Check"},
        {"table_name": "qm_cot_roller_change",             "label": "Cot Roller Change"},
        {"table_name": "qm_sliver_wrapping",               "label": "Sliver Wrapping"},
        {"table_name": "qm_drawing_cv_record",             "label": "Drawing CV Record"},
        {"table_name": "qm_a_pct_check",                   "label": "A% Check"},
        {"table_name": "qm_draw_monitor_check",            "label": "Draw Monitor Check"},
        {"table_name": "qm_drawing_stop_occurrences",      "label": "Drawing Stop Occurrences"},
        {"table_name": "qm_drawing_speed_check",           "label": "Drawing Speed Check"},
        {"table_name": "qm_can_randomisation_check",       "label": "Can Randomisation Check"},
        {"table_name": "qm_simplex_check",                 "label": "Simplex Check"},
        {"table_name": "qm_simplex_hank_test",             "label": "Simplex Hank Test"},
        {"table_name": "qm_simplex_bobbin_weight",         "label": "Simplex Bobbin Weight"},
        {"table_name": "qm_simplex_breakage_study",        "label": "Simplex Breakage Study"},
        {"table_name": "qm_simplex_stretch_pct",           "label": "Simplex Stretch %"},
        {"table_name": "qm_simplex_speed_check",           "label": "Simplex Speed Check"},
        {"table_name": "qm_simplex_nozzle_check",          "label": "Simplex Nozzle Check"},
        {"table_name": "qm_rf_snap_study",                 "label": "RF Snap Study"},
        {"table_name": "qm_rf_traverse_check",             "label": "RF Traverse Check"},
        {"table_name": "qm_rf_qc_checklist",               "label": "RF QC Checklist"},
        {"table_name": "qm_rf_cleaning_check",             "label": "RF Cleaning Check"},
        {"table_name": "qm_rf_knee_break_check",           "label": "RF Knee Break Check"},
        {"table_name": "qm_rf_monitor_settings",           "label": "RF Monitor Settings"},
        {"table_name": "qm_rf_csp_report",                 "label": "RF CSP Report"},
        {"table_name": "qm_rf_breakage_study",             "label": "RF Breakage Study"},
        {"table_name": "qm_rf_doff_breakage",              "label": "RF Doff Breakage"},
        {"table_name": "qm_rf_restart_breakage",           "label": "RF Restart Breakage"},
        {"table_name": "qm_rf_count_test",                 "label": "RF Count Test"},
        {"table_name": "qm_rf_spindle_slippage",           "label": "RF Spindle Slippage"},
        {"table_name": "qm_rf_traveller_loading",          "label": "RF Traveller Loading"},
        {"table_name": "qm_rf_spacer_check",               "label": "RF Spacer Check"},
        {"table_name": "qm_yarn_faults_uster",             "label": "Yarn Faults (Uster)"},
        {"table_name": "qm_classimat_results",             "label": "Classimat Results"},
        {"table_name": "qm_bag_faults",                    "label": "Bag Faults"},
        {"table_name": "qm_daily_reject_cone",             "label": "Daily Reject Cone"},
        {"table_name": "qm_cone_rejection_report",         "label": "Cone Rejection Report"},
        {"table_name": "qm_shade_cone",                    "label": "Shade Cone"},
        {"table_name": "qm_j_mark_cones",                  "label": "J-Mark Cones"},
        {"table_name": "qm_wax_pickup",                    "label": "Wax Pickup"},
        {"table_name": "qm_splice_strength",               "label": "Splice Strength"},
        {"table_name": "qm_splice_appearance",             "label": "Splice Appearance"},
        {"table_name": "qm_tail_end_check",                "label": "Tail End Check"},
        {"table_name": "qm_drum_break_cradle_lifting",     "label": "Drum Break Cradle Lifting"},
        {"table_name": "qm_wax_rotating_check",            "label": "Wax Rotating Check"},
        {"table_name": "qm_drum_adapter_cleaning",         "label": "Drum Adapter Cleaning"},
        {"table_name": "qm_uster_clearer_check",           "label": "Uster Clearer Check"},
        {"table_name": "qm_lot_runout",                    "label": "Lot Runout"},
        {"table_name": "qm_finishing_breaks_study",        "label": "Finishing Breaks Study"},
        {"table_name": "qm_uv_light_audit",                "label": "UV Light Audit"},
        {"table_name": "qm_pwse_check",                    "label": "PWSE Check"},
        {"table_name": "qm_blend_test",                    "label": "Blend Test"},
        {"table_name": "qm_bag_weight_check",              "label": "Bag Weight Check"},
        {"table_name": "qm_paper_cone_check",              "label": "Paper Cone Check"},
    ],
    "purchase": [
        {"table_name": "cotton_purchases", "label": "Cotton Purchases"},
        {"table_name": "grn_entries",      "label": "GRN Entries"},
    ],
    "hr": [
        {"table_name": "attendance",      "label": "Attendance"},
        {"table_name": "monthly_payroll", "label": "Monthly Payroll"},
    ],
}


def _get_mill_id_for_write(scope: dict, current_user: User) -> str:
    """Resolve effective mill_id for write operations. Raises 403 if unresolvable."""
    mill_id = scope.get("mill_id")
    if not mill_id:
        # MILL_OWNER has no fixed mill_id in scope; use their user.mill_id or require param
        mill_id = str(current_user.mill_id) if current_user.mill_id else None
    if not mill_id:
        raise HTTPException(status_code=400, detail="mill_id required — use ?mill_id= param or assign a default mill")
    return mill_id


# ── GET /custom-fields/tables ───────────────────────────────────────────────

@router.get("/custom-fields/tables")
async def list_customisable_tables(
    current_user: User = Depends(require_module("masters")),
):
    """Return all customisable tables grouped by module."""
    return {"modules": CUSTOMISABLE_TABLES}


# ── GET /custom-fields/definitions ─────────────────────────────────────────

@router.get("/custom-fields/definitions", response_model=List[CustomFieldDefinitionOut])
async def list_definitions(
    module: Optional[str] = Query(None),
    table_name: Optional[str] = Query(None),
    mill_id: Optional[str] = Query(None),
    current_user: User = Depends(require_module("masters")),
    db: AsyncSession = Depends(get_db),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")

    # Resolve effective mill_id for the query
    if role_code == "SUPER_ADMIN" and mill_id:
        effective_mill_id = mill_id
    elif role_code == "SUPER_ADMIN":
        # Super admin listing without filter — return empty (they must specify mill)
        return []
    else:
        effective_mill_id = scope.get("mill_id") or (str(current_user.mill_id) if current_user.mill_id else None)

    if not effective_mill_id:
        return []

    stmt = select(CustomFieldDefinition).where(
        CustomFieldDefinition.mill_id == effective_mill_id,
        CustomFieldDefinition.is_active == True,
    )
    if module:
        stmt = stmt.where(CustomFieldDefinition.module == module)
    if table_name:
        stmt = stmt.where(CustomFieldDefinition.table_name == table_name)
    stmt = stmt.order_by(CustomFieldDefinition.sort_order, CustomFieldDefinition.created_at)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [CustomFieldDefinitionOut.model_validate(r) for r in rows]


# ── POST /custom-fields/definitions ────────────────────────────────────────

@router.post("/custom-fields/definitions", response_model=CustomFieldDefinitionOut)
async def create_definition(
    req: CustomFieldDefinitionCreate,
    mill_id: Optional[str] = Query(None),
    current_user: User = Depends(require_module("masters", write=True)),
    db: AsyncSession = Depends(get_db),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")

    # Only MILL_OWNER, GENERAL_MANAGER, SUPER_ADMIN can create
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER"):
        raise HTTPException(status_code=403, detail="Only Mill Owner or General Manager can create custom fields")

    if role_code == "SUPER_ADMIN":
        if not mill_id:
            raise HTTPException(status_code=400, detail="mill_id query param required for SUPER_ADMIN")
        effective_mill_id = mill_id
    else:
        effective_mill_id = _get_mill_id_for_write(scope, current_user)

    # Check uniqueness
    existing = await db.execute(
        select(CustomFieldDefinition).where(
            CustomFieldDefinition.mill_id == effective_mill_id,
            CustomFieldDefinition.table_name == req.table_name,
            CustomFieldDefinition.field_key == req.field_key,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"field_key '{req.field_key}' already exists on table '{req.table_name}'")

    defn = CustomFieldDefinition(
        mill_id=effective_mill_id,
        module=req.module,
        table_name=req.table_name,
        field_key=req.field_key,
        label=req.label,
        field_type=req.field_type,
        options=req.options,
        is_required=req.is_required,
        sort_order=req.sort_order,
        is_active=True,
    )
    db.add(defn)
    await db.commit()
    await db.refresh(defn)
    return CustomFieldDefinitionOut.model_validate(defn)


# ── PATCH /custom-fields/definitions/{id} ──────────────────────────────────

@router.patch("/custom-fields/definitions/{defn_id}", response_model=CustomFieldDefinitionOut)
async def update_definition(
    defn_id: str,
    req: CustomFieldDefinitionUpdate,
    current_user: User = Depends(require_module("masters", write=True)),
    db: AsyncSession = Depends(get_db),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")

    if role_code not in ("SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER"):
        raise HTTPException(status_code=403, detail="Only Mill Owner or General Manager can update custom fields")

    defn = await db.get(CustomFieldDefinition, defn_id)
    if not defn:
        raise HTTPException(status_code=404, detail="Custom field definition not found")

    # Tenant isolation
    if role_code != "SUPER_ADMIN":
        effective_mill_id = scope.get("mill_id") or (str(current_user.mill_id) if current_user.mill_id else None)
        if defn.mill_id != effective_mill_id:
            raise HTTPException(status_code=403, detail="Access denied")

    if req.label is not None:
        defn.label = req.label
    if req.options is not None:
        defn.options = req.options
    if req.is_required is not None:
        defn.is_required = req.is_required
    if req.sort_order is not None:
        defn.sort_order = req.sort_order
    if req.is_active is not None:
        defn.is_active = req.is_active

    await db.commit()
    await db.refresh(defn)
    return CustomFieldDefinitionOut.model_validate(defn)


# ── DELETE /custom-fields/definitions/{id} — soft delete ───────────────────

@router.delete("/custom-fields/definitions/{defn_id}")
async def delete_definition(
    defn_id: str,
    current_user: User = Depends(require_module("masters", write=True)),
    db: AsyncSession = Depends(get_db),
):
    scope = await get_mill_scope(current_user, db)
    role_code = scope.get("role", "")

    if role_code not in ("SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER"):
        raise HTTPException(status_code=403, detail="Only Mill Owner or General Manager can delete custom fields")

    defn = await db.get(CustomFieldDefinition, defn_id)
    if not defn:
        raise HTTPException(status_code=404, detail="Custom field definition not found")

    if role_code != "SUPER_ADMIN":
        effective_mill_id = scope.get("mill_id") or (str(current_user.mill_id) if current_user.mill_id else None)
        if defn.mill_id != effective_mill_id:
            raise HTTPException(status_code=403, detail="Access denied")

    defn.is_active = False
    await db.commit()
    return {"ok": True}
