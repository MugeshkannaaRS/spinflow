"""061_pm_activity_config

Editable per-section PM activity configuration table.

Revision ID: 061_pm_activity_config
Revises: 060_pm_entry_log
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "061_pm_activity_config"
down_revision = "060_pm_entry_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pm_activity_config",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("section", sa.String(100), nullable=False, unique=True),
        sa.Column("entry_type", sa.String(50), nullable=False, server_default="activity"),
        sa.Column("activities", JSONB, nullable=True),
        sa.Column("ac_units", JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_pm_activity_config_section", "pm_activity_config", ["section"])


def downgrade() -> None:
    op.drop_table("pm_activity_config")
