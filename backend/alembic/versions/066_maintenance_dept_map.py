"""maintenance dept map (schedule dept -> machine dept)

Mill-editable mapping so the Day Plan resolves real machine numbers when the
PM schedules and Machines master use different department names.

Revision ID: 066_maintenance_dept_map
Revises: 065_maintenance_dept_manpower
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa


revision = "066_maintenance_dept_map"
down_revision = "065_maintenance_dept_manpower"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "maintenance_dept_map" in inspector.get_table_names():
        return
    op.create_table(
        "maintenance_dept_map",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("mill_id", sa.String(length=36), nullable=True),
        sa.Column("schedule_dept", sa.String(length=100), nullable=False),
        sa.Column("machine_dept", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mdmap_mill_id", "maintenance_dept_map", ["mill_id"])
    op.create_index("ix_mdmap_sched", "maintenance_dept_map", ["schedule_dept"])


def downgrade() -> None:
    op.drop_table("maintenance_dept_map")
