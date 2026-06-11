"""Add company_role_config and role_module_access tables

Enables SUPER_ADMIN to configure per-company:
  1. Which of the 14 roles are available (with optional monthly fee)
  2. Per-role module access overrides (grant or revoke modules beyond the default)

These are purely additive tables — no existing data is modified.
Default behaviour (no rows) = all roles enabled, all using system defaults.

Revision ID: 027
Revises: 026
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "027"
down_revision: Union[str, None] = "026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # ── 1. company_role_config ──────────────────────────────────────────
    # Tracks which roles are enabled per company and their optional monthly fee
    if "company_role_config" not in existing_tables:
        op.create_table(
            "company_role_config",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("role_code", sa.String(50), nullable=False),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
            sa.Column("monthly_fee", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
            sa.Column("enabled_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
            sa.UniqueConstraint("company_id", "role_code", name="uq_company_role_config"),
        )

    # ── 2. role_module_access ───────────────────────────────────────────
    # Per-company overrides for which modules a role can access.
    # A missing row means "use system default for this role+module".
    if "role_module_access" not in existing_tables:
        op.create_table(
            "role_module_access",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("role_code", sa.String(50), nullable=False),
            sa.Column("module_name", sa.String(100), nullable=False),
            sa.Column("is_allowed", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
            sa.Column("set_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("company_id", "role_code", "module_name", name="uq_role_module_access"),
        )


def downgrade() -> None:
    op.drop_table("role_module_access")
    op.drop_table("company_role_config")
