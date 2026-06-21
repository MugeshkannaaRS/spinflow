"""049 - UserModuleAccess: enabled (bool) → access_level (none/read/write)

Upgrades per-user module overrides from binary on/off to three-state
(none/read/write) so Super Admin can grant or restrict EXACT access
per module per user — including full write to a module the role doesn't
normally have.

- Adds access_level VARCHAR(10) with CHECK constraint
- Backfills from existing enabled column:
    enabled=True  → access_level='read'   (preserves old capped behavior)
    enabled=False → access_level='none'
- Drops the old enabled column (pre-production — zero real rows expected)

Revision ID: 049
Revises: 048
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa

revision = "049"
down_revision = "048"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add access_level column (nullable initially for backfill)
    op.add_column(
        "user_module_access",
        sa.Column("access_level", sa.String(10), nullable=True),
    )

    # 2. Backfill from enabled
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE user_module_access SET access_level = "
            "CASE WHEN enabled = TRUE THEN 'read' ELSE 'none' END"
        )
    )

    # 3. Make NOT NULL after backfill
    op.alter_column("user_module_access", "access_level", nullable=False)

    # 4. Add CHECK constraint
    op.create_check_constraint(
        "ck_uma_access_level",
        "user_module_access",
        sa.text("access_level IN ('none', 'read', 'write')"),
    )

    # 5. Drop the old enabled column
    op.drop_column("user_module_access", "enabled")


def downgrade():
    # 1. Add enabled column back
    op.add_column(
        "user_module_access",
        sa.Column("enabled", sa.Boolean, nullable=True),
    )

    # 2. Backfill: 'write' and 'read' both map to True, 'none' maps to False
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE user_module_access SET enabled = "
            "CASE WHEN access_level = 'none' THEN FALSE ELSE TRUE END"
        )
    )

    # 3. Make NOT NULL
    op.alter_column("user_module_access", "enabled", nullable=False)

    # 4. Drop CHECK constraint
    op.drop_constraint("ck_uma_access_level", "user_module_access")

    # 5. Drop access_level
    op.drop_column("user_module_access", "access_level")
