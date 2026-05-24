"""Add company_modules, mill_settings, company fields to companies and users

Revision ID: 008
Revises: 007
Create Date: 2026-05-24 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 50,
        ADD COLUMN IF NOT EXISTS max_mills INTEGER DEFAULT 5,
        ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'basic',
        ADD COLUMN IF NOT EXISTS enabled_modules TEXT DEFAULT 'dashboard,production,quality,stock,inventory,dispatch,stores,hr,accounts,maintenance,reports',
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS notes TEXT
    """)

    op.create_table(
        "company_modules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("module_name", sa.String(100), nullable=False),
        sa.Column("is_enabled", sa.Boolean, default=True),
        sa.Column("enabled_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("enabled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "module_name", name="uq_company_module"),
    )

    op.create_table(
        "mill_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("working_hours_per_day", sa.Integer, default=24),
        sa.Column("shifts_per_day", sa.Integer, default=3),
        sa.Column("production_target_kg", sa.Numeric, default=0),
        sa.Column("currency", sa.String(10), default="INR"),
        sa.Column("timezone", sa.String(50), default="Asia/Kolkata"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id),
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)
    """)


def downgrade() -> None:
    op.drop_table("mill_settings")
    op.drop_table("company_modules")
    op.execute("""
        ALTER TABLE companies
        DROP COLUMN IF EXISTS max_users,
        DROP COLUMN IF EXISTS max_mills,
        DROP COLUMN IF EXISTS subscription_plan,
        DROP COLUMN IF EXISTS enabled_modules,
        DROP COLUMN IF EXISTS is_active,
        DROP COLUMN IF EXISTS created_by,
        DROP COLUMN IF EXISTS notes
    """)
    op.execute("""
        ALTER TABLE users
        DROP COLUMN IF EXISTS company_id,
        DROP COLUMN IF EXISTS is_active,
        DROP COLUMN IF EXISTS must_change_password,
        DROP COLUMN IF EXISTS last_login,
        DROP COLUMN IF EXISTS created_by
    """)
