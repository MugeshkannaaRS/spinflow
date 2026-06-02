"""Create employee_custom_fields and employee_custom_values tables

Revision ID: 013
Revises: 012
Create Date: 2026-06-02 10:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "employee_custom_fields" not in existing_tables:
        op.create_table(
            "employee_custom_fields",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False, index=True),
            sa.Column("field_name", sa.String(100), nullable=False),
            sa.Column("field_type", sa.String(20), server_default="text"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True),
        )

    if "employee_custom_values" not in existing_tables:
        op.create_table(
            "employee_custom_values",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("employee_id", sa.String(36), sa.ForeignKey("employees.id"), nullable=False, index=True),
            sa.Column("field_id", sa.String(36), sa.ForeignKey("employee_custom_fields.id"), nullable=False),
            sa.Column("value", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True),
        )

def downgrade() -> None:
    op.drop_table("employee_custom_values")
    op.drop_table("employee_custom_fields")
