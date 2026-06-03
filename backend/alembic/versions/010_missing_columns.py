"""Add missing columns: spares.mill_id, spare_issues.mill_id, create machine_parameters

Revision ID: 010
Revises: 009
Create Date: 2026-05-25
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    existing_spares_cols = [c["name"] for c in inspector.get_columns("spares")]
    if "mill_id" not in existing_spares_cols:
        op.add_column("spares", sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=True))
        op.create_index("ix_spares_mill_id", "spares", ["mill_id"])

    existing_spare_issues_cols = [c["name"] for c in inspector.get_columns("spare_issues")]
    if "mill_id" not in existing_spare_issues_cols:
        op.add_column("spare_issues", sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=True))
        op.create_index("ix_spare_issues_mill_id", "spare_issues", ["mill_id"])

    if "machine_parameters" not in existing_tables:
        op.create_table(
            "machine_parameters",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("machine_code", sa.String(50), nullable=False, index=True),
            sa.Column("parameter_name", sa.String(200), nullable=False),
            sa.Column("standard_value", sa.String(100), nullable=True),
            sa.Column("min_value", sa.String(100), nullable=True),
            sa.Column("max_value", sa.String(100), nullable=True),
            sa.Column("unit", sa.String(50), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("machine_parameters")
    op.drop_index("ix_spare_issues_mill_id", "spare_issues")
    op.drop_column("spare_issues", "mill_id")
    op.drop_index("ix_spares_mill_id", "spares")
    op.drop_column("spares", "mill_id")
