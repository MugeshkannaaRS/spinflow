"""Add entry_type to waste_entries (machine vs department/section overhead)

Revision ID: 054
Revises: 053
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa

revision = "054"
down_revision = "053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE waste_entries
        ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) NOT NULL DEFAULT 'machine'
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE waste_entries DROP COLUMN IF EXISTS entry_type")
