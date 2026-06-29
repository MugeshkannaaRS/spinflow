"""058_pm_schedule_enrichment

Add department, lubricant, manpower, machine_count, sl_no to maintenance_schedule

Revision ID: 058_pm_schedule_enrichment
Revises: 057_relax_qc_form_columns_nullable
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "058_pm_schedule_enrichment"
down_revision = "057_relax_qc_form_columns_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("maintenance_schedule") as batch_op:
        batch_op.add_column(sa.Column("department", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("lubricant_name", sa.String(200), nullable=True))
        batch_op.add_column(sa.Column("lubricant_quantity", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("manpower_count", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("machine_count", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("sl_no", sa.Integer(), nullable=True))

    # Index on department for calendar filtering
    op.create_index(
        "ix_maintenance_schedule_department",
        "maintenance_schedule",
        ["department"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_maintenance_schedule_department", table_name="maintenance_schedule")
    with op.batch_alter_table("maintenance_schedule") as batch_op:
        batch_op.drop_column("sl_no")
        batch_op.drop_column("machine_count")
        batch_op.drop_column("manpower_count")
        batch_op.drop_column("lubricant_quantity")
        batch_op.drop_column("lubricant_name")
        batch_op.drop_column("department")
