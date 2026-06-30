"""drop import_mappings table (single-mill refactor)

The saved per-mill column-mapping system has been removed. Imports now match
columns directly on the client, so the import_mappings table is no longer
written or read. Drop it.

Revision ID: 063_drop_import_mappings
Revises: 062_maintenance_schedule_mill_id
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa


revision = "063_drop_import_mappings"
down_revision = "062_maintenance_schedule_mill_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "import_mappings" in inspector.get_table_names():
        op.drop_table("import_mappings")


def downgrade() -> None:
    op.create_table(
        "import_mappings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("mill_id", sa.String(length=36), nullable=False),
        sa.Column("table_name", sa.String(length=100), nullable=False),
        sa.Column("excel_header", sa.String(length=200), nullable=False),
        sa.Column("spinflow_field", sa.String(length=100), nullable=True),
        sa.Column("is_custom_field", sa.Boolean(), server_default="false", nullable=True),
        sa.Column("confidence", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mill_id", "table_name", "excel_header", name="uq_import_mapping"),
    )
