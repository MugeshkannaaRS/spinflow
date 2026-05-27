"""Create import_mappings table

Revision ID: 012
Revises: 011
Create Date: 2026-05-27 09:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "import_mappings" not in existing_tables:
        op.create_table(
            "import_mappings",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), nullable=False),
            sa.Column("table_name", sa.String(100), nullable=False),
            sa.Column("excel_header", sa.String(200), nullable=False),
            sa.Column("spinflow_field", sa.String(100), nullable=True),
            sa.Column("is_custom_field", sa.Boolean(), server_default=sa.text("false"), nullable=True),
            sa.Column("confidence", sa.Numeric(5, 2), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.UniqueConstraint("mill_id", "table_name", "excel_header", name="uq_import_mapping"),
        )

def downgrade() -> None:
    op.drop_table("import_mappings")
