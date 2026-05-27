"""Enhance column_configs with full field metadata + column_dropdown_options

Revision ID: 011
Revises: 010
Create Date: 2026-05-27 08:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("column_configs", sa.Column("placeholder_text", sa.String(200), nullable=True))
    op.add_column("column_configs", sa.Column("help_text", sa.String(500), nullable=True))
    op.add_column("column_configs", sa.Column("validation_regex", sa.String(200), nullable=True))
    op.add_column("column_configs", sa.Column("min_value", sa.Numeric(), nullable=True))
    op.add_column("column_configs", sa.Column("max_value", sa.Numeric(), nullable=True))
    op.add_column("column_configs", sa.Column("default_value", sa.Text(), nullable=True))
    op.add_column("column_configs", sa.Column("group_name", sa.String(100), nullable=True))
    op.add_column("column_configs", sa.Column("is_searchable", sa.Boolean(), server_default=sa.text("true"), nullable=True))
    op.add_column("column_configs", sa.Column("is_sortable", sa.Boolean(), server_default=sa.text("true"), nullable=True))
    op.add_column("column_configs", sa.Column("is_exportable", sa.Boolean(), server_default=sa.text("true"), nullable=True))
    op.add_column("column_configs", sa.Column("is_importable", sa.Boolean(), server_default=sa.text("true"), nullable=True))

    op.create_table(
        "column_dropdown_options",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), nullable=False),
        sa.Column("column_key", sa.String(100), nullable=False),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("option_value", sa.String(200), nullable=False),
        sa.Column("option_label", sa.String(200), nullable=False),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0"), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.UniqueConstraint("mill_id", "column_key", "table_name", "option_value", name="uq_dropdown_option"),
    )


def downgrade() -> None:
    op.drop_table("column_dropdown_options")
    op.drop_column("column_configs", "is_importable")
    op.drop_column("column_configs", "is_exportable")
    op.drop_column("column_configs", "is_sortable")
    op.drop_column("column_configs", "is_searchable")
    op.drop_column("column_configs", "group_name")
    op.drop_column("column_configs", "default_value")
    op.drop_column("column_configs", "max_value")
    op.drop_column("column_configs", "min_value")
    op.drop_column("column_configs", "validation_regex")
    op.drop_column("column_configs", "help_text")
    op.drop_column("column_configs", "placeholder_text")
