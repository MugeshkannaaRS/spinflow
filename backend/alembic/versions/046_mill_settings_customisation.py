"""046 - Mill settings customisation: dept names, shift names, quality spec limits

Revision ID: 046
Revises: 045
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "046"
down_revision = "045"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "mill_settings",
        sa.Column("dept_names", JSONB, nullable=True, comment="Ordered list of department names for this mill"),
    )
    op.add_column(
        "mill_settings",
        sa.Column("shift_names", JSONB, nullable=True, comment="Ordered list of shift names, e.g. ['A','B','C']"),
    )
    op.add_column(
        "mill_settings",
        sa.Column("quality_cv_limit", sa.Float, nullable=True, comment="CV% threshold — values above this are flagged"),
    )
    op.add_column(
        "mill_settings",
        sa.Column("quality_csp_min", sa.Integer, nullable=True, comment="Minimum CSP count; below this is flagged"),
    )


def downgrade():
    op.drop_column("mill_settings", "quality_csp_min")
    op.drop_column("mill_settings", "quality_cv_limit")
    op.drop_column("mill_settings", "shift_names")
    op.drop_column("mill_settings", "dept_names")
