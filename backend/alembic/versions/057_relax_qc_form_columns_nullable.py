"""drop NOT NULL on QC form-entry columns (lot_no/machine_no/shift_code/line_no)

Makes quality-form saves resilient: operators frequently record a sample
before a lot/machine/shift is assigned.  These columns become nullable so an
insert never hard-fails with a not-null constraint violation.  Structural
columns (date, foreign keys, financial fields) are intentionally left alone.

Revision ID: 057
Revises: 056
Create Date: 2026-06-28
"""
from alembic import op
from sqlalchemy import text

revision = "057"
down_revision = "056"
branch_labels = None
depends_on = None


# (table_name, [columns to make nullable])
COLUMNS = [
    ("qm_back_process_allocation", ['lot_no', 'line_no', 'machine_no']),
    ("qm_carding_waste_study", ['lot_no', 'machine_no']),
    ("qm_carding_cv_record", ['lot_no', 'machine_no', 'shift_code']),
    ("qm_carding_wrapping", ['lot_no', 'machine_no', 'shift_code', 'line_no']),
    ("qm_carding_dfk_pressure", ['machine_no', 'shift_code', 'line_no']),
    ("qm_carding_cfd_check", ['machine_no', 'shift_code', 'lot_no']),
    ("qm_carding_speed_record", ['lot_no', 'machine_no']),
    ("qm_carding_flats_cleaning", ['machine_no']),
    ("qm_daily_wastage", ['line_no']),
    ("qm_drawing_check", ['lot_no', 'machine_no', 'shift_code']),
    ("qm_cot_roller_change", ['machine_no', 'shift_code']),
    ("qm_sliver_wrapping", ['lot_no', 'machine_no', 'shift_code']),
    ("qm_drawing_cv_record", ['lot_no', 'machine_no', 'shift_code']),
    ("qm_a_pct_check", ['lot_no', 'machine_no']),
    ("qm_draw_monitor_check", ['machine_no', 'shift_code']),
    ("qm_drawing_stop_occurrences", ['machine_no', 'shift_code']),
    ("qm_drawing_speed_check", ['shift_code', 'machine_no', 'lot_no']),
    ("qm_can_randomisation_check", ['shift_code']),
    ("qm_simplex_check", ['lot_no', 'machine_no', 'shift_code']),
    ("qm_simplex_hank_test", ['lot_no', 'machine_no', 'shift_code']),
    ("qm_simplex_bobbin_weight", ['machine_no', 'lot_no']),
    ("qm_simplex_breakage_study", ['lot_no', 'machine_no']),
    ("qm_simplex_stretch_pct", ['machine_no', 'shift_code']),
    ("qm_simplex_speed_check", ['machine_no', 'lot_no', 'shift_code']),
    ("qm_simplex_nozzle_check", ['machine_no', 'lot_no', 'shift_code']),
    ("qm_rf_snap_study", ['machine_no', 'shift_code', 'lot_no']),
    ("qm_rf_traverse_check", ['machine_no']),
    ("qm_rf_qc_checklist", ['machine_no', 'shift_code']),
    ("qm_rf_cleaning_check", ['machine_no', 'shift_code']),
    ("qm_rf_knee_break_check", ['machine_no', 'shift_code']),
    ("qm_rf_monitor_settings", ['machine_no', 'lot_no', 'shift_code']),
    ("qm_rf_csp_report", ['machine_no', 'lot_no']),
    ("qm_rf_breakage_study", ['lot_no']),
    ("qm_rf_doff_breakage", ['machine_no', 'lot_no']),
    ("qm_rf_restart_breakage", ['machine_no']),
    ("qm_rf_count_test", ['machine_no', 'lot_no']),
    ("qm_rf_spindle_slippage", ['machine_no', 'shift_code', 'lot_no']),
    ("qm_rf_traveller_loading", ['machine_no', 'lot_no']),
    ("qm_rf_spacer_check", ['machine_no', 'shift_code']),
    ("qm_yarn_faults_uster", ['machine_no', 'lot_no', 'shift_code']),
    ("qm_classimat_results", ['machine_no', 'lot_no']),
    ("qm_bag_faults", ['shift_code', 'lot_no']),
    ("qm_daily_reject_cone", ['machine_no', 'shift_code', 'lot_no']),
    ("qm_shade_cone", ['shift_code']),
    ("qm_j_mark_cones", ['shift_code', 'machine_no', 'lot_no']),
    ("qm_wax_pickup", ['machine_no', 'lot_no', 'shift_code']),
    ("qm_splice_strength", ['machine_no', 'lot_no', 'shift_code']),
    ("qm_splice_appearance", ['machine_no', 'lot_no', 'shift_code']),
    ("qm_tail_end_check", ['machine_no', 'shift_code']),
    ("qm_wax_rotating_check", ['machine_no']),
    ("qm_lot_runout", ['lot_no']),
    ("qm_finishing_breaks_study", ['machine_no', 'lot_no', 'shift_code']),
    ("qm_uv_light_audit", ['shift_code']),
    ("qm_pwse_check", ['shift_code']),
    ("qm_blend_test", ['lot_no', 'machine_no', 'line_no']),
    ("qm_bag_weight_check", ['shift_code', 'lot_no']),
]


def _set_nullable(nullable: bool):
    conn = op.get_bind()
    verb = "DROP NOT NULL" if nullable else "SET NOT NULL"
    for table, cols in COLUMNS:
        # Skip tables that don't exist in this database
        exists = conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_name = :t"
        ), {"t": table}).scalar()
        if not exists:
            continue
        for col in cols:
            col_exists = conn.execute(text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ), {"t": table, "c": col}).scalar()
            if not col_exists:
                continue
            conn.execute(text(
                f'ALTER TABLE "{table}" ALTER COLUMN "{col}" {verb}'
            ))


def upgrade():
    _set_nullable(True)


def downgrade():
    # Best-effort restore. Rows created with NULLs would block this, so we
    # backfill empty strings first to keep the downgrade safe.
    conn = op.get_bind()
    for table, cols in COLUMNS:
        exists = conn.execute(text(
            "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
        ), {"t": table}).scalar()
        if not exists:
            continue
        for col in cols:
            col_exists = conn.execute(text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ), {"t": table, "c": col}).scalar()
            if not col_exists:
                continue
            conn.execute(text(
                f'UPDATE "{table}" SET "{col}" = \'\' WHERE "{col}" IS NULL'
            ))
            conn.execute(text(
                f'ALTER TABLE "{table}" ALTER COLUMN "{col}" SET NOT NULL'
            ))
