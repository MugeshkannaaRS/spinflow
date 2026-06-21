"""Add quality form tables for bag weight check & paper cone check

Revision ID: 043
Revises: 042
Create Date: 2026-06-21
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = "043"
down_revision: Union[str, None] = "042"
branch_labels = None
depends_on = None


def _add_column_if_not_exists(table: str, column: str, col_def: str) -> None:
    op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_def}")


def _create_index_if_not_exists(index_name: str, table: str, columns: list[str]) -> None:
    cols = ", ".join(columns)
    op.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({cols})")


def upgrade() -> None:
    # ── QmBagWeightCheck ───────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS qm_bag_weight_check (
            id VARCHAR(36) PRIMARY KEY,
            mill_id VARCHAR(36) NOT NULL REFERENCES mills(id),
            company_id VARCHAR(36) REFERENCES companies(id),
            date VARCHAR(10) NOT NULL,
            shift_code VARCHAR(5) NOT NULL,
            count_ne FLOAT,
            lot_no VARCHAR(50) NOT NULL,
            cone_tip_type VARCHAR(30),
            inspector VARCHAR(200),
            samples_json JSONB,
            total_samples INTEGER,
            avg_net_weight FLOAT,
            min_net_weight FLOAT,
            max_net_weight FLOAT,
            std_deviation FLOAT,
            target_weight FLOAT,
            deviation_pct FLOAT,
            underweight_count INTEGER,
            overweight_count INTEGER,
            pass_count INTEGER,
            pass_pct FLOAT,
            status VARCHAR(20) DEFAULT 'draft',
            remarks TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        )
    """)
    _create_index_if_not_exists("ix_qm_bag_weight_date", "qm_bag_weight_check", ["mill_id", "lot_no", "date"])
    _create_index_if_not_exists("ix_qm_bag_weight_mill_id", "qm_bag_weight_check", ["mill_id"])
    _create_index_if_not_exists("ix_qm_bag_weight_company_id", "qm_bag_weight_check", ["company_id"])

    # ── QmPaperConeCheck ───────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS qm_paper_cone_check (
            id VARCHAR(36) PRIMARY KEY,
            mill_id VARCHAR(36) NOT NULL REFERENCES mills(id),
            company_id VARCHAR(36) REFERENCES companies(id),
            date VARCHAR(10) NOT NULL,
            supplier_id VARCHAR(36) REFERENCES suppliers(id),
            supplier_name VARCHAR(200),
            batch_no VARCHAR(50),
            inspector VARCHAR(200),
            samples_json JSONB,
            total_samples INTEGER,
            avg_cone_weight FLOAT,
            min_cone_weight FLOAT,
            max_cone_weight FLOAT,
            avg_diameter FLOAT,
            avg_length FLOAT,
            avg_hardness FLOAT,
            acceptance_pct FLOAT,
            rejection_pct FLOAT,
            status VARCHAR(20) DEFAULT 'draft',
            remarks TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        )
    """)
    _create_index_if_not_exists("ix_qm_paper_cone_date", "qm_paper_cone_check", ["mill_id", "supplier_id", "date"])
    _create_index_if_not_exists("ix_qm_paper_cone_mill_id", "qm_paper_cone_check", ["mill_id"])
    _create_index_if_not_exists("ix_qm_paper_cone_company_id", "qm_paper_cone_check", ["company_id"])


def downgrade() -> None:
    op.drop_table("qm_bag_weight_check")
    op.drop_table("qm_paper_cone_check")
