"""048 - Per-user module access overrides

Creates the user_module_access table, the actual mechanism for
"every user's access can differ" — replacing the assumption that
role alone determines module access.

Revision ID: 048
Revises: 047
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa

revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_module_access",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("module", sa.String(50), nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False),
        sa.Column("set_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "module", name="uq_user_module_access"),
    )


def downgrade():
    op.drop_table("user_module_access")
