"""045 - Employee code generation config on mill_settings

Revision ID: 045
Revises: 044
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa

revision = "045"
down_revision = "044"
branch_labels = None
depends_on = None


def upgrade():
    # Add employee code generation config to mill_settings
    with op.batch_alter_table("mill_settings") as batch_op:
        batch_op.add_column(sa.Column(
            "emp_code_prefix",
            sa.String(20),
            nullable=False,
            server_default="EMP",
        ))
        batch_op.add_column(sa.Column(
            "emp_code_last_seq",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ))
        batch_op.add_column(sa.Column(
            "emp_code_digits",
            sa.Integer(),
            nullable=False,
            server_default="4",
        ))


def downgrade():
    with op.batch_alter_table("mill_settings") as batch_op:
        batch_op.drop_column("emp_code_digits")
        batch_op.drop_column("emp_code_last_seq")
        batch_op.drop_column("emp_code_prefix")
