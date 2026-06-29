"""060_pm_entry_log

Create pm_entry_log table for section-specific maintenance records:
- Activity logs (Blowroom, Carding, DSC, Finishing)
- Cot grinding logs (Draw Frame, Simplex, Ring Frame)
- A/C Plant daily service logs

Revision ID: 060_pm_entry_log
Revises: 059_pm_schedule_line_grinding
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "060_pm_entry_log"
down_revision = "059_pm_schedule_line_grinding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pm_entry_log",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), nullable=True, index=True),
        sa.Column("entry_date", sa.String(10), nullable=False),
        sa.Column("section", sa.String(100), nullable=False),
        sa.Column("entry_type", sa.String(50), nullable=False),
        sa.Column("machine_code", sa.String(100), nullable=True),
        sa.Column("machine_line_code", sa.String(100), nullable=True),
        sa.Column("activity", sa.Text, nullable=True),
        sa.Column("done_by", sa.String(200), nullable=True),
        sa.Column("remarks", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="done"),
        sa.Column("data", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_pm_entry_log_entry_date", "pm_entry_log", ["entry_date"], if_not_exists=True)
    op.create_index("ix_pm_entry_log_section", "pm_entry_log", ["section"], if_not_exists=True)
    op.create_index("ix_pm_entry_log_mill_id", "pm_entry_log", ["mill_id"], if_not_exists=True)


def downgrade() -> None:
    op.drop_table("pm_entry_log")
