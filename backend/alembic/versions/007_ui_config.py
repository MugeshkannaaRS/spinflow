"""Add column_configs table

Revision ID: 007
Revises: 006
Create Date: 2026-05-22 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "column_configs" not in inspector.get_table_names():
        op.create_table(
            "column_configs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), nullable=False, index=True),
            sa.Column("module", sa.String(50), nullable=False),
            sa.Column("table_key", sa.String(50), nullable=False),
            sa.Column("columns", sa.Text, nullable=False),
            sa.Column("updated_by", sa.String(200), nullable=True),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("mill_id", "module", "table_key", name="uq_column_config"),
        )


def downgrade() -> None:
    op.drop_table("column_configs")
