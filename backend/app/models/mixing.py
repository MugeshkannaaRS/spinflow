"""
Mixing, laydown, JCP clearance, utility breakdown, waste stock, and splice quality models.
All tables added in migration 019_production_module_v2.
"""
from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, generate_uuid


# ------------------------------------------------------------------ #
# Mixing Recipe + Layers                                               #
# ------------------------------------------------------------------ #

class MixingRecipe(Base):
    """Master recipe: defines fibre percentages for a count/lot."""
    __tablename__ = "mixing_recipes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    recipe_code: Mapped[str] = mapped_column(String(50), nullable=False)
    recipe_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    yarn_count_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("yarn_counts.id"), nullable=True)
    lot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # e.g. [{"fiber": "cotton_cnc", "pct": 60}, {"fiber": "polyester", "pct": 40}]
    fiber_composition: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("mill_id", "recipe_code", name="uq_mixing_recipe_mill_code"),
    )


class MixingLayer(Base):
    """Individual layer row within a recipe (physical laydown arrangement)."""
    __tablename__ = "mixing_layers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    recipe_id: Mapped[str] = mapped_column(String(36), ForeignKey("mixing_recipes.id", ondelete="CASCADE"), nullable=False, index=True)
    layer_no: Mapped[int] = mapped_column(Integer, nullable=False)
    fiber_type: Mapped[str] = mapped_column(String(50), nullable=False)
    percentage: Mapped[float] = mapped_column(Float, nullable=False)
    kg_per_layer: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bale_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MixingChangeLog(Base):
    """Mixing Change Intimation Slip — raised when recipe changes mid-lot."""
    __tablename__ = "mixing_change_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    change_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    intimation_slip_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    old_recipe_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mixing_recipes.id"), nullable=True)
    new_recipe_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mixing_recipes.id"), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ------------------------------------------------------------------ #
# Laydown + Bale Consumption                                           #
# ------------------------------------------------------------------ #

class LaydownRecord(Base):
    """Physical laydown event in Blow Room."""
    __tablename__ = "laydown_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    machine_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    recipe_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mixing_recipes.id"), nullable=True)
    bale_count: Mapped[int] = mapped_column(Integer, default=0)
    total_kg: Mapped[float] = mapped_column(Float, default=0)
    operator: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    supervisor: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BaleConsumptionLog(Base):
    """Individual bale consumed per laydown/shift."""
    __tablename__ = "bale_consumption_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    lot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    bale_ref: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    fiber_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    machine_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    laydown_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("laydown_records.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ------------------------------------------------------------------ #
# JCP Clearance                                                        #
# ------------------------------------------------------------------ #

class JCPClearance(Base):
    """Job Completion Permission — Quality JCP + Commercial JCP before dispatch."""
    __tablename__ = "jcp_clearances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # clearance_type: "quality" | "commercial"
    clearance_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    quality_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    commercial_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ------------------------------------------------------------------ #
# Utility Breakdown                                                    #
# ------------------------------------------------------------------ #

class UtilityBreakdown(Base):
    """One log entry for compressor/power failure; loss auto-distributed to affected machines."""
    __tablename__ = "utility_breakdowns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    # utility_type: "compressor" | "power" | "water" | "air_pressure"
    utility_type: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=0)
    # JSON list of dept codes affected e.g. ["autocone", "ring_frame"]
    affected_departments: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    total_loss_kg: Mapped[float] = mapped_column(Float, default=0)
    reported_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ------------------------------------------------------------------ #
# Waste Stock + Transfers                                              #
# ------------------------------------------------------------------ #

class WasteStock(Base):
    """Bale-level waste inventory (8 categories: flat, card, drawer, comber, ring, cone, mixing, sweep)."""
    __tablename__ = "waste_stock"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    waste_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    bale_ref: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    date_collected: Mapped[str] = mapped_column(String(10), nullable=False)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    machine_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # status: "in_stock" | "sold" | "transferred"
    status: Mapped[str] = mapped_column(String(20), default="in_stock")
    sold_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sold_to: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sale_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sale_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WasteTransfer(Base):
    """Inter-department/warehouse waste movement register."""
    __tablename__ = "waste_transfers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    transfer_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    waste_type: Mapped[str] = mapped_column(String(50), nullable=False)
    from_department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    to_location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    bale_count: Mapped[int] = mapped_column(Integer, default=0)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    transferred_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ------------------------------------------------------------------ #
# Splice Quality Log                                                   #
# ------------------------------------------------------------------ #

class SpliceQualityLog(Base):
    """Autocone splice KPI: total splices, rejected splices, rejection % per shift/machine."""
    __tablename__ = "splice_quality_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    machine_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    lot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    total_splices: Mapped[int] = mapped_column(Integer, default=0)
    rejected_splices: Mapped[int] = mapped_column(Integer, default=0)
    rejection_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    operator: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("mill_id", "date", "shift", "machine_code", name="uq_splice_mill_date_shift_machine"),
    )


# ------------------------------------------------------------------ #
# Shift Manpower Plan                                                  #
# ------------------------------------------------------------------ #

class ShiftManpowerPlan(Base):
    """Planned vs actual headcount per department per shift."""
    __tablename__ = "shift_manpower_plan"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[str] = mapped_column(String(1), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    planned_count: Mapped[int] = mapped_column(Integer, default=0)
    actual_count: Mapped[int] = mapped_column(Integer, default=0)
    supervisor: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("mill_id", "date", "shift", "department", name="uq_manpower_mill_date_shift_dept"),
    )
