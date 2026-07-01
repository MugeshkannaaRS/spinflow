"""maintenance dept manpower override

Per-department manpower override for the PM Manpower Plan (persons, machines,
shift hours, leader, notes). Overrides win over schedule-derived values.

Revision ID: 065_maintenance_dept_manpower
Revises: 064_maintenance_holiday_calendar
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa


revision = "065_maintenance_dept_manpower"
down_revision = "064_maintenance_holiday_calendar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "maintenance_dept_manpower" in inspector.get_table_names():
        return
    op.create_table(
        "maintenance_dept_manpower",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("mill_id", sa.String(length=36), nullable=True),
        sa.Column("department", sa.String(length=100), nullable=False),
        sa.Column("persons", sa.Integer(), nullable=True),
        sa.Column("machines", sa.Integer(), nullable=True),
        sa.Column("shift_hours", sa.Float(), nullable=True),
        sa.Column("leader", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.String(length=300), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mdm_mill_id", "maintenance_dept_manpower", ["mill_id"])
    op.create_index("ix_mdm_department", "maintenance_dept_manpower", ["department"])


def downgrade() -> None:
    op.drop_table("maintenance_dept_manpower")
