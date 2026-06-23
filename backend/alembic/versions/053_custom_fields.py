"""Add custom_field_definitions table and custom_fields JSONB column to all entry tables

Revision ID: 053
Revises: 052
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "053"
down_revision = "052"
branch_labels = None
depends_on = None

# All tables that get a custom_fields JSONB column
ENTRY_TABLES = [
    # production
    "production_entries",
    "waste_entries",
    "rf_manpower_plan",
    "packing_shift_entries",
    "downtime_logs",
    # maintenance / stores
    "maintenance_logs",
    "spare_issues",
    # quality
    "quality_tests",
    # qm_* tables
    "qm_carding_waste_study",
    "qm_carding_cv_record",
    "qm_carding_wrapping",
    "qm_carding_dfk_pressure",
    "qm_carding_cfd_check",
    "qm_carding_speed_record",
    "qm_carding_flats_cleaning",
    "qm_daily_wastage",
    "qm_drawing_check",
    "qm_cot_roller_change",
    "qm_sliver_wrapping",
    "qm_drawing_cv_record",
    "qm_a_pct_check",
    "qm_draw_monitor_check",
    "qm_drawing_stop_occurrences",
    "qm_drawing_speed_check",
    "qm_can_randomisation_check",
    "qm_simplex_check",
    "qm_simplex_hank_test",
    "qm_simplex_bobbin_weight",
    "qm_simplex_breakage_study",
    "qm_simplex_stretch_pct",
    "qm_simplex_speed_check",
    "qm_simplex_nozzle_check",
    "qm_rf_snap_study",
    "qm_rf_traverse_check",
    "qm_rf_qc_checklist",
    "qm_rf_cleaning_check",
    "qm_rf_knee_break_check",
    "qm_rf_monitor_settings",
    "qm_rf_csp_report",
    "qm_rf_breakage_study",
    "qm_rf_doff_breakage",
    "qm_rf_restart_breakage",
    "qm_rf_count_test",
    "qm_rf_spindle_slippage",
    "qm_rf_traveller_loading",
    "qm_rf_spacer_check",
    "qm_yarn_faults_uster",
    "qm_classimat_results",
    "qm_bag_faults",
    "qm_daily_reject_cone",
    "qm_cone_rejection_report",
    "qm_shade_cone",
    "qm_j_mark_cones",
    "qm_wax_pickup",
    "qm_splice_strength",
    "qm_splice_appearance",
    "qm_tail_end_check",
    "qm_drum_break_cradle_lifting",
    "qm_wax_rotating_check",
    "qm_drum_adapter_cleaning",
    "qm_uster_clearer_check",
    "qm_lot_runout",
    "qm_finishing_breaks_study",
    "qm_uv_light_audit",
    "qm_pwse_check",
    "qm_blend_test",
    "qm_bag_weight_check",
    "qm_paper_cone_check",
    # purchase
    "cotton_purchases",
    "grn_entries",
    # hr
    "attendance",
    "monthly_payroll",
]


def upgrade() -> None:
    # 1. Create the custom_field_definitions table
    op.create_table(
        "custom_field_definitions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False),
        sa.Column("module", sa.String(50), nullable=False),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("field_key", sa.String(100), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False),
        sa.Column("options", postgresql.JSONB, nullable=True),
        sa.Column("is_required", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("mill_id", "table_name", "field_key", name="uq_custom_field_mill_table_key"),
    )
    op.create_index("ix_custom_field_mill_id", "custom_field_definitions", ["mill_id"])
    op.create_index("ix_custom_field_mill_table", "custom_field_definitions", ["mill_id", "table_name"])

    # 2. Add custom_fields JSONB column to all entry tables (idempotent)
    for table in ENTRY_TABLES:
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{{}}'"
        )


def downgrade() -> None:
    for table in ENTRY_TABLES:
        op.execute(
            f"ALTER TABLE {table} DROP COLUMN IF EXISTS custom_fields"
        )
    op.drop_index("ix_custom_field_mill_table", table_name="custom_field_definitions")
    op.drop_index("ix_custom_field_mill_id", table_name="custom_field_definitions")
    op.drop_table("custom_field_definitions")
