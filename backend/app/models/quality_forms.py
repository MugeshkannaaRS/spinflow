"""
SpinFlow Quality Module — Full form models.
Based on 86 physical quality forms (AAYML reference mill).
All tables share: mill_id, lot_id, machine_id, shift_code, date as the
composite key linking records across departments.
"""
from __future__ import annotations
from typing import Optional
from sqlalchemy import (
    String, Float, Integer, Boolean, DateTime, ForeignKey,
    Text, Index, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.db.base import Base, TimestampMixin, generate_uuid


# ---------------------------------------------------------------------------
# 1. Master / Reference tables
# ---------------------------------------------------------------------------

class QmCountSpec(TimestampMixin, Base):
    """Count / Yarn Specification Master — CSP targets, CV% limits per count."""
    __tablename__ = "qm_count_specs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    count_ne: Mapped[float] = mapped_column(Float, nullable=False)           # e.g. 30.0
    process_type: Mapped[str] = mapped_column(String(20), nullable=False)    # Carded/Combed/Open End
    tm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)        # Twist Multiplier
    tpi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)       # Twists per Inch
    feed_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_delivery_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nominal_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    csp_target: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_limits_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # {1m:x, 2m:x, ...}

    __table_args__ = (
        UniqueConstraint("mill_id", "count_ne", "process_type", name="uq_qm_count_spec"),
    )


class QmApprovalTemplate(TimestampMixin, Base):
    """Defines which roles must approve each form type, and SLA hours."""
    __tablename__ = "qm_approval_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    form_type: Mapped[str] = mapped_column(String(100), nullable=False)       # e.g. "carding_cv_record"
    department: Mapped[str] = mapped_column(String(10), nullable=False)       # BLW, CRD, BDR, ...
    required_roles_json: Mapped[dict] = mapped_column(JSONB, nullable=False)  # ["QCO","Sr.QCO","M(Q)"]
    sla_hours: Mapped[int] = mapped_column(Integer, default=24)

    __table_args__ = (
        UniqueConstraint("mill_id", "form_type", name="uq_qm_approval_template"),
    )


class QmFormApproval(TimestampMixin, Base):
    """
    Universal approval record for any quality form.
    Sequential: a higher level cannot approve until all lower levels have signed.
    """
    __tablename__ = "qm_form_approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    form_type: Mapped[str] = mapped_column(String(100), nullable=False)
    record_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    approval_level: Mapped[int] = mapped_column(Integer, nullable=False)      # 1–10
    role_code: Mapped[str] = mapped_column(String(20), nullable=False)        # QCO, Sr.QCO, ...
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    employee_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")        # pending/approved/rejected
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_qm_form_approvals_record", "record_id", "form_type"),
    )


# ---------------------------------------------------------------------------
# 2. Carding & Blowroom
# ---------------------------------------------------------------------------

class QmBackProcessAllocation(TimestampMixin, Base):
    """4.1 — Allocation of lot/cotton ratios across machines for blowroom/drawing."""
    __tablename__ = "qm_back_process_allocation"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("lots.id"), nullable=True, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    line_no: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)           # B1 / B2
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    total_machines: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ratio_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    delivery_band: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    __table_args__ = (Index("ix_qm_bpa_lot_date", "lot_no", "date"),)


class QmCardingWasteStudy(TimestampMixin, Base):
    """4.2 — Carding waste % study per machine."""
    __tablename__ = "qm_carding_waste_study"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    delivery_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    licker_in_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cylinder_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    flats_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    delivery_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wing_setting: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    empty_can_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sliver_can_gross_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_production_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    licker_in2_waste_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    licker_in2_waste_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # computed
    licker_in3_waste_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    licker_in3_waste_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # computed
    flat_strips_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    flat_strips_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)         # computed
    suction_hood_back_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    suction_hood_back_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # computed
    suction_hood_front_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    suction_hood_front_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    total_wastage_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)       # computed
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    __table_args__ = (Index("ix_qm_crd_waste_lot_mc_date", "mill_id", "lot_no", "machine_no", "date"),)


class QmCardingCvRecord(TimestampMixin, Base):
    """4.3 — Carding CV% at 1m/2m/5m/10m/20m/50m/100m per machine per shift."""
    __tablename__ = "qm_carding_cv_record"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    cotton_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)        # R/A R/B R/C
    process: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    delivery_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_1m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_2m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_5m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_10m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_20m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_50m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_100m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    within_spec: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    __table_args__ = (Index("ix_qm_crd_cv_lot_mc_date_shift", "mill_id", "lot_no", "machine_no", "date", "shift_code"),)


class QmCardingWrapping(TimestampMixin, Base):
    """4.4 — Daily Carding Wrapping Report — sliver weight uniformity."""
    __tablename__ = "qm_carding_wrapping"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    line_no: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    time_taken: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    std_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    readings_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)   # [r1, r2, r3, r4, r5]
    # Flat reading columns (grams per wrapping sample)
    r1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r5: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)    # computed
    cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)         # computed
    ok_input: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmCardingDfkPressure(TimestampMixin, Base):
    """4.5 — Carding DFK Pressure Record."""
    __tablename__ = "qm_carding_dfk_pressure"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    line_no: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dfk_width: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    draft: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    v4min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    v4max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_pa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    balancing_pa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pa_variation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    draft_deviation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    home_start: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    home_slow: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    home_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ccd_nominal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ccd_actual: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cfd_nominal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cfd_actual: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmCardingCfdCheck(TimestampMixin, Base):
    """4.6 — Carding CFD Check Report."""
    __tablename__ = "qm_carding_cfd_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)     # RS/LS
    carding_line: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    with_mat_rs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    with_mat_ls: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    without_mat_rs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    without_mat_ls: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    deviation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmCardingSpeedRecord(TimestampMixin, Base):
    """4.7 — Daily Card-wise Speed Record."""
    __tablename__ = "qm_carding_speed_record"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    card_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cylinder_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    licker1_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    licker2_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    licker3_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    flats_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dfk_beater_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmCardingFlatsCleaning(TimestampMixin, Base):
    """4.8 — Carding Flats Cleaning Cross-Check Report."""
    __tablename__ = "qm_carding_flats_cleaning"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    flats_tops_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    doffer_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    suction_hood_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    comb_box_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmDailyWastage(TimestampMixin, Base):
    """4.9 — Daily Wastage Report per blowroom line."""
    __tablename__ = "qm_daily_wastage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    line_no: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)           # B1 / B2
    process: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    production_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wastage_d1_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wastage_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    status: Mapped[str] = mapped_column(String(20), default="draft")


# ---------------------------------------------------------------------------
# 3. Drawing (Breaker & Finisher)
# ---------------------------------------------------------------------------

class QmDrawingCheck(TimestampMixin, Base):
    """5.1 — Drawing mechanical condition check."""
    __tablename__ = "qm_drawing_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    cotton_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)     # LHS/RHS
    top_roller_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bottom_roller_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    stripper_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    draft_zone_clean: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    cot_change_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    suction_duct_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmCotRollerChange(TimestampMixin, Base):
    """5.2 — Drawing Cot Roller Change Schedule Check."""
    __tablename__ = "qm_cot_roller_change"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)     # LHS/RHS
    time_slot: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    changed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSliverWrapping(TimestampMixin, Base):
    """5.3 / 5.4 — Daily Sliver Wrapping Report (Breaker & Finisher)."""
    __tablename__ = "qm_sliver_wrapping"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    process: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # BD / FD
    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    std_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    readings_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [r1..r5]
    # Flat reading columns (grams per wrapping sample)
    r1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r5: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # computed
    hank_cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # computed
    ok_input: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    __table_args__ = (Index("ix_qm_sliver_wrap_key", "mill_id", "lot_no", "machine_no", "date", "shift_code", "process"),)


class QmDrawingCvRecord(TimestampMixin, Base):
    """5.5 — Drawing CV Record (Uster multi-length)."""
    __tablename__ = "qm_drawing_cv_record"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    cotton_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    process: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # BD/FD
    delivery_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    a_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mcv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_5cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_10cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_25cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_50cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_1m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_3m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_5m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmAPctCheck(TimestampMixin, Base):
    """5.6 — A% Check Report (Auto-Leveller Performance)."""
    __tablename__ = "qm_a_pct_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    cotton_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    feed_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    process: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    doubling: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    delivery_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    readings_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # 10 readings N+1/N/N-1
    # Flat hank reading columns (10 samples per A% test)
    r1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r5: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r6: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r7: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r8: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r9: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r10: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    levelling_action_point: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    levelling_intensity: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    a_pct_n_plus: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    a_pct_n_minus: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    within_spec: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmDrawMonitorCheck(TimestampMixin, Base):
    """5.7 — Draw Frame Online Monitor Check Report."""
    __tablename__ = "qm_draw_monitor_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    parameters_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # 21 params
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmDrawingStopOccurrences(TimestampMixin, Base):
    """5.8 — Drawing Stop Occurrences & RQM Setting Checklist."""
    __tablename__ = "qm_drawing_stop_occurrences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    ends_down: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    levelling_stops: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lapping_stops: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    jam_web_funnel: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    jam_coiler_head: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    can_change: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    spare_can_missing: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    can_truck_missing: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    production_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    efficiency_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    a_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmDrawingSpeedCheck(TimestampMixin, Base):
    """5.9 — Drawing Speed Check Report."""
    __tablename__ = "qm_drawing_speed_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    actual_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    deviation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    recheck_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmCanRandomisationCheck(TimestampMixin, Base):
    """5.10 — Drawing Can Randomisation Check Report."""
    __tablename__ = "qm_can_randomisation_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    bd_group_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)   # time checkpoints
    fd_group_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


# ---------------------------------------------------------------------------
# 4. Simplex
# ---------------------------------------------------------------------------

class QmSimplexCheck(TimestampMixin, Base):
    """6.1 — Simplex Check Report (Mechanical)."""
    __tablename__ = "qm_simplex_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    cotton_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    top_roller_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bottom_roller_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    top_clearer_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bottom_clearer_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    flyer_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    draft_zone_clean: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSimplexHankTest(TimestampMixin, Base):
    """6.2 — Simplex Hank Test."""
    __tablename__ = "qm_simplex_hank_test"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    cotton_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    process: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    nominal_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    readings_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [{spl:1,wt:x,hank:y}]
    # Flat reading columns (grams per hank sample)
    r1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r5: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    within_spec: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSimplexBobbinWeight(TimestampMixin, Base):
    """6.3 — Simplex Bobbin Weight Check Report (145 spindles)."""
    __tablename__ = "qm_simplex_bobbin_weight"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    length: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cap_colour: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    avg_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    spindle_weights_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [{spl:1,wt:x,tare:y}]
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSimplexBreakageStudy(TimestampMixin, Base):
    """6.4 — Simplex Breakage Study (breaks per 100 spindle-hours)."""
    __tablename__ = "qm_simplex_breakage_study"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    cotton_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    process: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    spl_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    time_start: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    time_end: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    duration_hrs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    feed_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    delivery_hank: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tpi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    creel_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feed_sliver_exhaust: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    top_roller_lapping: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bottom_roller_lapping: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slub_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    front_roll_false_twister: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    flyer_finger_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    multiple_end_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    other_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    active_spindles: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    breaks_per_100spl_hrs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSimplexStretchPct(TimestampMixin, Base):
    """6.5 — Simplex Stretch % (top vs bottom bobbin position)."""
    __tablename__ = "qm_simplex_stretch_pct"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    top_readings_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)     # [{spl,r1-5,avg_hank}]
    bottom_readings_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [{spl,r1-5,avg_hank,stretch_pct}]
    avg_stretch_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    within_spec: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSimplexSpeedCheck(TimestampMixin, Base):
    """6.6 — Simplex Speed Check Report."""
    __tablename__ = "qm_simplex_speed_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    actual_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    deviation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    recheck_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSimplexNozzleCheck(TimestampMixin, Base):
    """6.7 — Simplex Overhead Nozzle Check Report."""
    __tablename__ = "qm_simplex_nozzle_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    nozzle_guide_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    nozzle_pipe_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    pipe_position_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    air_force_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    recheck_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


# ---------------------------------------------------------------------------
# 5. Ring Frame (14 forms)
# ---------------------------------------------------------------------------

class QmRfSnapStudy(TimestampMixin, Base):
    """7.1 — Ring Frame Snap Study & Idle Spindle Check."""
    __tablename__ = "qm_rf_snap_study"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rf_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    snap_rhs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    snap_lhs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    snap_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    roving_exhaust_rhs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    roving_exhaust_lhs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    idle_spindles_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ohtc_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    reasons: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    __table_args__ = (Index("ix_qm_rf_snap_key", "mill_id", "machine_no", "date", "shift_code"),)


class QmRfTraverseCheck(TimestampMixin, Base):
    """7.2 — Ring Frame Traverse Check Report."""
    __tablename__ = "qm_rf_traverse_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    rhs_gear_end: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rhs_middle: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rhs_off_end: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lhs_gear_end: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lhs_middle: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lhs_off_end: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfQcChecklist(TimestampMixin, Base):
    """7.3 — Quality Control Checklist (Ring Frame) — 13-point shift checklist."""
    __tablename__ = "qm_rf_qc_checklist"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    start_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    check_items_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # [{item, findings, remarks, responsible_person, action_taken}]
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfCleaningCheck(TimestampMixin, Base):
    """7.4 — Ring Cleaning Check Report."""
    __tablename__ = "qm_rf_cleaning_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lh_drafting_zone_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    lh_front_roller_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    lh_middle_roller_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    lh_back_roller_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    lh_brush_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    lh_cradle_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    lh_bottom_apron_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    rh_drafting_zone_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    rh_front_roller_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    rh_middle_roller_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    rh_back_roller_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    rh_brush_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    rh_cradle_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    rh_bottom_apron_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfKneeBreakCheck(TimestampMixin, Base):
    """7.5 — Ring Frame Knee Break & Spindle Tape Check."""
    __tablename__ = "qm_rf_knee_break_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    spindle_tape_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    knee_break_cond: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfMonitorSettings(TimestampMixin, Base):
    """7.6 — Ring Frame Monitor Setting Check Report."""
    __tablename__ = "qm_rf_monitor_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    model: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    nominal_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    yarn_pitch_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    yarn_weight_per_bobbin: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_tpm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_tpm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    twist_correction_factor: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_draft: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    break_draft: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfCspReport(TimestampMixin, Base):
    """7.7 — CSP Strength Report (Count Strength Product)."""
    __tablename__ = "qm_rf_csp_report"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    samples_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [{strength,weight,count_ne,csp}]
    # Flat sample columns (10 samples × 4 readings each — from physical CSP form)
    s1_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s1_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s1_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s1_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s2_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s2_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s2_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s2_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s3_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s3_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s3_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s3_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s4_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s4_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s4_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s4_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s5_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s5_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s5_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s5_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s6_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s6_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s6_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s6_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s7_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s7_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s7_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s7_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s8_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s8_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s8_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s8_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s9_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s9_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s9_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s9_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s10_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s10_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s10_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    s10_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tpi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    within_spec: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    __table_args__ = (Index("ix_qm_rf_csp_lot_mc_date", "mill_id", "lot_no", "machine_no", "date"),)


class QmRfBreakageStudy(TimestampMixin, Base):
    """7.8 — Spinning Breakage Study (RF × 510 spindle grid)."""
    __tablename__ = "qm_rf_breakage_study"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    tm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)        # relative humidity
    duration_hrs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rf_summary_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # [{rf_no, avg_spl_speed, production, total_breaks, breaks_per_1000spl_hr}]
    spindle_grid_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Stored as {rf_no: [break_count_per_spindle]} for large datasets
    total_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    breaks_per_1000spl_hr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    overall_breakage_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    repeated_2_6: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    above_6: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    traveller_fly: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfDoffBreakage(TimestampMixin, Base):
    """7.9 — Ring Frame Full Doff Breakage Study."""
    __tablename__ = "qm_rf_doff_breakage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    avg_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    breakage_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfRestartBreakage(TimestampMixin, Base):
    """7.10 — Ring Frame Re-Start Breakage Report (post-doff startup)."""
    __tablename__ = "qm_rf_restart_breakage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    before_doff_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    doff_time_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    after_startup_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    doff_time_mins: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    startup_breakage: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    before_doff_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    doff_time_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    after_startup_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfCountTest(TimestampMixin, Base):
    """7.11 — Ring Frame Changing M/C Count Test Report."""
    __tablename__ = "qm_rf_count_test"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    samples_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [{weight}] × 10
    avg_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    count_cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfSpindleSlippage(TimestampMixin, Base):
    """7.12 — Ring Frame Spindle Slippage Check."""
    __tablename__ = "qm_rf_spindle_slippage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    slip_100_rpm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slip_200_rpm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slip_300_plus_rpm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfTravellerLoading(TimestampMixin, Base):
    """7.13 — Ring Frame Traveller Loading Check."""
    __tablename__ = "qm_rf_traveller_loading"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    spindle_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    traveller_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    traveller_weight: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmRfSpacerCheck(TimestampMixin, Base):
    """7.14 — Ring Frame Spacer Check Report."""
    __tablename__ = "qm_rf_spacer_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    spacer_size: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    spacer_colour: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    missing_spindles_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [spindle_nos]
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


# ---------------------------------------------------------------------------
# 6. Auto Coner & Rewinding (18 forms)
# ---------------------------------------------------------------------------

class QmYarnFaultsUster(TimestampMixin, Base):
    """8.1 — Yarn Faults Report (Uster Quantum 4.0)."""
    __tablename__ = "qm_yarn_faults_uster"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    drum_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    kms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Fault counts
    yf: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    n_neps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    s_short_thick: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    l_long_thick: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    t_thin: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    x_extreme: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pf_periodic: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ccp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ccm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    dp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    dm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cdp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cdm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fd: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fl: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    jp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    jm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    __table_args__ = (Index("ix_qm_yf_uster_lot_mc_date", "mill_id", "lot_no", "machine_no", "date"),)


class QmClassimatResults(TimestampMixin, Base):
    """8.2 — Classimat Results — Uster (UQC-3)."""
    __tablename__ = "qm_classimat_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    group: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    length: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nsl_matrix_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)    # N/S/L thick places
    thin_t_matrix_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True) # T thin places
    count_deviation_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    periodic_faults_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    splice_channels_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    imperfections_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Yarn faults per 100km
    yf_per_100km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Imperfections per 1000m
    cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    thin_50_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    thick_50_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    neps_200_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_ipi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmBagFaults(TimestampMixin, Base):
    """8.3 — Bag Faults Checking Report (24 cones/bag, 18 fault types)."""
    __tablename__ = "qm_bag_faults"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cone_tip_colour: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    bag_gross_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cone_weights_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [{cone_no, weight}] × 24
    avg_cone_wt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_cone_wt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_cone_wt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # 18 fault flags
    fault_cut_yarn: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_out_yarn: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_stitch_yarn: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_without_sticker: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_hand_stain: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_shade_variation: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_tail_missing: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_tail_entanglement: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_no_qa_signature: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_ribboning: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_contamination: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_big_cone: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_small_cone: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_loose_cone: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_step_cone: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_paper_cone_damage: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_printing_missing: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fault_others: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmDailyRejectCone(TimestampMixin, Base):
    """8.4 — Daily Reject Cone Report."""
    __tablename__ = "qm_daily_reject_cone"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    drum_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    out_yarn: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    step_cone: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    shade_cone: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    big_cone: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    small_cone: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_rejected: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_produced: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rejection_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    stock_for_rewinding: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmConeRejectionReport(TimestampMixin, Base):
    """8.5 — Cone Rejection Report (by process type)."""
    __tablename__ = "qm_cone_rejection_report"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    process: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # Melange/PC/CVC/Cotton/KW
    shift_data_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # {R/A: {machine_no, drum_no, out_yarn, cut_yarn}, R/B:..., R/C:...}
    sub_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    grand_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmShadeCone(TimestampMixin, Base):
    """8.6 — Shade Cone Report."""
    __tablename__ = "qm_shade_cone"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    side: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)    # Melange/PC-CVC/Cotton/KW-VIS
    shade_cone_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stock_cone_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_shade_cone: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_stock_shade_cone: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmJMarkCones(TimestampMixin, Base):
    """8.7 — Rewinding (J) Mark Cone Report."""
    __tablename__ = "qm_j_mark_cones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    process: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cone_tip_colour: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    cone_qty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stock_cone: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmWaxPickup(TimestampMixin, Base):
    """8.8 — Wax Pickup Study."""
    __tablename__ = "qm_wax_pickup"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    machine_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    drum_wax_data_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # [{drum_no, wax_before, wax_after, wax_consumed, prod_before, prod_after, production, wax_pickup_pct}]
    total_wax_consumed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_production: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    overall_wax_pickup_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSpliceStrength(TimestampMixin, Base):
    """8.9 — Splice Strength Report."""
    __tablename__ = "qm_splice_strength"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    test_grid_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # 3 grids × 5 drums × 4 tests: {splice_strength, parent_yarn_strength}
    splice_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    within_spec: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)  # ≥ 85%
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmSpliceAppearance(TimestampMixin, Base):
    """8.10 — Auto Coner Splice Appearance Check Report."""
    __tablename__ = "qm_splice_appearance"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    drum_checks_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # [{drum_no, ln_lever_pos, appearance_ok, recheck}]
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmTailEndCheck(TimestampMixin, Base):
    """8.11 — Tail End Check Report."""
    __tablename__ = "qm_tail_end_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    tail_missing_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tail_end_ok_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmDrumBreakCradleLifting(TimestampMixin, Base):
    """8.12 — Drum Break & Cradle Lifting Check Report."""
    __tablename__ = "qm_drum_break_cradle_lifting"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    machine_data_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # [{machine_no, drum_break_count, cradle_lifting_count}] × 29 machines
    combined_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmWaxRotatingCheck(TimestampMixin, Base):
    """8.13 — Wax Rotating Check Report."""
    __tablename__ = "qm_wax_rotating_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    wax_roller_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    wax_washer_plate_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    wax_touching_yarn: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmDrumAdapterCleaning(TimestampMixin, Base):
    """8.14 — Drum Adapter Cleaning Check Report."""
    __tablename__ = "qm_drum_adapter_cleaning"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    machine_drum_data_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # [{machine_no, drum_no, remarks}]
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmUsterClearerCheck(TimestampMixin, Base):
    """8.15 — Uster Clearer Check Report."""
    __tablename__ = "qm_uster_clearer_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    machine_drum_data_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # [{machine_no, drum_no, sensor_ok, remarks}]
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmLotRunout(TimestampMixin, Base):
    """8.16 — Quality Finishing Cops/Cone Runout Report."""
    __tablename__ = "qm_lot_runout"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    process: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cops_colour: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    cone_tip_colour: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    running_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    cops_runout_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    packing_runout_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmFinishingBreaksStudy(TimestampMixin, Base):
    """8.17 — Finishing Cone Rewinding Breaks Study."""
    __tablename__ = "qm_finishing_breaks_study"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    process: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cotton_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cone_wt_gms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_cone_wt_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_length_mtr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    # 12 break categories
    entanglement: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slough_off: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cut_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    yarn_waste: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    splicing_fault: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    parallel_yarn: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ribboning: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slubs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    neps_kitties: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    thick_place: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    thin_place: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    other_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_breaks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    breaks_per_lac_mtr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # computed
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmUvLightAudit(TimestampMixin, Base):
    """8.18 — Ultra Light Glowing & Not Glowing Audit Report."""
    __tablename__ = "qm_uv_light_audit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    area: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    lights_available_std: Mapped[int] = mapped_column(Integer, default=24)
    lights_glowing: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lights_not_glowing: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    area_data_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # [{si_no, area, glowing, not_glowing}]
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")


# ---------------------------------------------------------------------------
# 7. Packing & Final
# ---------------------------------------------------------------------------

class QmPwseCheck(TimestampMixin, Base):
    """9.1 — PWSE Machine Check List (packaging/weighing machine)."""
    __tablename__ = "qm_pwse_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    machine_data_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # [{machine_no, target_weight, mean_weight, cv_pct}] × 4 PWSE machines
    status: Mapped[str] = mapped_column(String(20), default="draft")


class QmBlendTest(TimestampMixin, Base):
    """9.2 — Blend Test Report (cotton/polyester ratio via solubility test)."""
    __tablename__ = "qm_blend_test"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    machine_no: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    line_no: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    process: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    nominal_ratio: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # e.g. 52/48
    tested_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    result_1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    result_2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    result_3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cotton_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    polyester_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cotton_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # computed
    polyester_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True) # computed
    within_spec: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    __table_args__ = (Index("ix_qm_blend_test_lot_date", "mill_id", "lot_no", "date"),)


# ---------------------------------------------------------------------------
# 8. Bag Weight Check
# ---------------------------------------------------------------------------

class QmBagWeightCheck(TimestampMixin, Base):
    """Packed cone bag weight verification — gross/tare/net per sample."""
    __tablename__ = "qm_bag_weight_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id"), nullable=True, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    count_ne: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    cone_tip_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    inspector: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    samples_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    total_samples: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    avg_net_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_net_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_net_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_deviation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    deviation_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    underweight_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    overweight_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pass_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pass_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_qm_bag_weight_date", "mill_id", "lot_no", "date"),)


# ---------------------------------------------------------------------------
# 9. Paper Cone Check
# ---------------------------------------------------------------------------

class QmPaperConeCheck(TimestampMixin, Base):
    """Paper cone / packing material quality inspection with supplier tracking."""
    __tablename__ = "qm_paper_cone_check"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id"), nullable=True, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    supplier_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("suppliers.id"), nullable=True, index=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    batch_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    inspector: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    samples_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    total_samples: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    avg_cone_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_cone_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_cone_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_diameter: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_length: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_hardness: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    acceptance_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rejection_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_qm_paper_cone_date", "mill_id", "supplier_id", "date"),)
