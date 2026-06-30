"""maintenance holiday calendar

Mill-customizable calendar of holidays / half-days / leave counts used by the
PM Day Plan to adjust available manpower capacity.

Revision ID: 064_maintenance_holiday_calendar
Revises: 063_drop_import_mappings
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa


revision = "064_maintenance_holiday_calendar"
down_revision = "063_drop_import_mappings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "maintenance_holiday_calendar" in inspector.get_table_names():
        return
    op.create_table(
        "maintenance_holiday_calendar",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("mill_id", sa.String(length=36), nullable=True),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("day_type", sa.String(length=20), nullable=False, server_default="holiday"),
        sa.Column("persons_on_leave", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mhc_mill_id", "maintenance_holiday_calendar", ["mill_id"])
    op.create_index("ix_mhc_date", "maintenance_holiday_calendar", ["date"])


def downgrade() -> None:
    op.drop_table("maintenance_holiday_calendar")
