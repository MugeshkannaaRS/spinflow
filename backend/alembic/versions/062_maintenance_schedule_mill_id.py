"""062_maintenance_schedule_mill_id

Add mill_id to maintenance_schedule for direct tenant scoping
(avoids JOIN to machines table which breaks when machine codes are not yet registered).

Revision ID: 062_maintenance_schedule_mill_id
Revises: 061_pm_activity_config
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "062_maintenance_schedule_mill_id"
down_revision = "061_pm_activity_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "maintenance_schedule",
        sa.Column("mill_id", sa.String(36), nullable=True, index=True),
    )
    try:
        op.create_index(
            "ix_maintenance_schedule_mill_id",
            "maintenance_schedule",
            ["mill_id"],
            if_not_exists=True,
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index("ix_maintenance_schedule_mill_id", table_name="maintenance_schedule")
    except Exception:
        pass
    op.drop_column("maintenance_schedule", "mill_id")
