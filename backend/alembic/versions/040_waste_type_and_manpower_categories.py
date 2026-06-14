"""040 — Add waste_type to waste_entries; create manpower_categories master table

Revision ID: 040
Revises: 039
Create Date: 2026-06-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "040"
down_revision: Union[str, None] = "039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add waste_type column to waste_entries
    op.add_column(
        "waste_entries",
        sa.Column("waste_type", sa.String(100), nullable=True),
    )
    op.create_index("ix_waste_entries_type", "waste_entries", ["mill_id", "waste_type"])

    # 2. Create manpower_categories master table
    op.create_table(
        "manpower_categories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False),
        sa.Column("department", sa.String(50), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),   # display name
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_manpower_cat_mill_dept",
        "manpower_categories",
        ["mill_id", "department"],
    )
    op.create_unique_constraint(
        "uq_manpower_cat_mill_dept_cat",
        "manpower_categories",
        ["mill_id", "department", "category"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_manpower_cat_mill_dept_cat", "manpower_categories", type_="unique")
    op.drop_index("ix_manpower_cat_mill_dept", "manpower_categories")
    op.drop_table("manpower_categories")
    op.drop_index("ix_waste_entries_type", "waste_entries")
    op.drop_column("waste_entries", "waste_type")
