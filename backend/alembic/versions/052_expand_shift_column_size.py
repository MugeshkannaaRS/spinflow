"""expand shift column from String(1) to String(20) across production tables

Revision ID: 052
Revises: 051
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa

revision = "052"
down_revision = "051"
branch_labels = None
depends_on = None


TABLES_NOT_NULL = [
    "waste_entries",
    "rf_manpower_plan",
    "production_entries",
    "shift_manpower_plan",
]

TABLES_NULLABLE = [
    "mixing_change_log",
    "laydown_records",
    "bale_consumption_log",
    "splice_quality_log",
]


def upgrade() -> None:
    for tbl in TABLES_NOT_NULL:
        op.alter_column(tbl, "shift", existing_type=sa.String(1), type_=sa.String(20), existing_nullable=False)
    for tbl in TABLES_NULLABLE:
        op.alter_column(tbl, "shift", existing_type=sa.String(1), type_=sa.String(20), existing_nullable=True)


def downgrade() -> None:
    for tbl in TABLES_NOT_NULL:
        op.alter_column(tbl, "shift", existing_type=sa.String(20), type_=sa.String(1), existing_nullable=False)
    for tbl in TABLES_NULLABLE:
        op.alter_column(tbl, "shift", existing_type=sa.String(20), type_=sa.String(1), existing_nullable=True)
