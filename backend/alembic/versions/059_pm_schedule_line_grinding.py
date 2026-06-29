"""059_pm_schedule_line_grinding

Add machine_line_code, opening_dia_mm, current_dia_mm, grinding_freq_days,
last_grinding_date to maintenance_schedule for cot grinding & line tracking.

Revision ID: 059_pm_schedule_line_grinding
Revises: 058_pm_schedule_enrichment
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "059_pm_schedule_line_grinding"
down_revision = "058_pm_schedule_enrichment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("maintenance_schedule") as batch_op:
        batch_op.add_column(sa.Column("machine_line_code", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("opening_dia_mm", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("current_dia_mm", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("grinding_freq_days", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("last_grinding_date", sa.String(10), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("maintenance_schedule") as batch_op:
        batch_op.drop_column("last_grinding_date")
        batch_op.drop_column("grinding_freq_days")
        batch_op.drop_column("current_dia_mm")
        batch_op.drop_column("opening_dia_mm")
        batch_op.drop_column("machine_line_code")
