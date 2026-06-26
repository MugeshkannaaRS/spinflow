"""expand quality shift_code columns from VARCHAR(5) to VARCHAR(20)

Revision ID: 056
Revises: 055
Create Date: 2026-06-26
"""
from alembic import op
from sqlalchemy import text

revision = "056"
down_revision = "055"
branch_labels = None
depends_on = None


TABLES = [
    "qm_carding_cv",
    "qm_drawing_cv",
    "qm_a_pct_check",
    "qm_drawing_sliver_wrapping",
    "qm_autoconer_cv",
    "qm_simplex_hank_test",
    "qm_simplex_wrapping",
    "qm_ring_frame_cv",
    "qm_ring_frame_csp",
    "qm_autoconer_splice",
    "qm_yarn_faults_uster",
    "qm_yarn_count_strength",
    "qm_yarn_evenness",
    "qm_carding_wrapping",
    "qm_blow_room_cv",
    "qm_comber_cv",
    "qm_comber_wrapping",
    "qm_ring_frame_traveller",
    "qm_ring_frame_end_breakage",
    "qm_ring_frame_waste",
    "qm_simplex_cv",
    "qm_bag_weight_check",
    "qm_classimat_results",
    "qm_drawing_waste_study",
    "qm_blow_room_waste",
    "qm_carding_waste_study",
    "qm_simplex_breakage",
    "qm_ring_frame_breakage",
    "qm_autoconer_efficiency",
    "qm_autoconer_waste",
    "qm_ring_frame_production",
    "qm_simplex_production",
    "qm_carding_production",
    "qm_drawing_production",
    "qm_blow_room_production",
    "qm_comber_production",
]


def upgrade() -> None:
    conn = op.get_bind()
    for table in TABLES:
        # Check table exists first, then alter — each in autocommit to avoid txn abort
        exists = conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = 'shift_code'"
            ),
            {"t": table},
        ).fetchone()
        if exists:
            conn.execute(
                text(f"ALTER TABLE {table} ALTER COLUMN shift_code TYPE VARCHAR(20)")
            )


def downgrade() -> None:
    conn = op.get_bind()
    for table in TABLES:
        exists = conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = 'shift_code'"
            ),
            {"t": table},
        ).fetchone()
        if exists:
            conn.execute(
                text(f"ALTER TABLE {table} ALTER COLUMN shift_code TYPE VARCHAR(5)")
            )
