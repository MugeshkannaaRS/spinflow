"""Add company_modules, mill_settings, company fields

Revision ID: 008
Revises: 007
Create Date: 2026-05-24
"""
from alembic import op

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""
        ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 50,
        ADD COLUMN IF NOT EXISTS max_mills INTEGER DEFAULT 5,
        ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'basic',
        ADD COLUMN IF NOT EXISTS enabled_modules TEXT DEFAULT 'dashboard,production,quality,stock,inventory,dispatch,stores,hr,accounts,maintenance,reports',
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS notes TEXT
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS company_modules (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            module_name VARCHAR(100) NOT NULL,
            is_enabled BOOLEAN DEFAULT true,
            enabled_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_company_modules
        ON company_modules (company_id, module_name)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS mill_settings (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            mill_id VARCHAR NOT NULL REFERENCES mills(id) ON DELETE CASCADE UNIQUE,
            working_hours_per_day INTEGER DEFAULT 24,
            shifts_per_day INTEGER DEFAULT 3,
            production_target_kg NUMERIC DEFAULT 0,
            currency VARCHAR(10) DEFAULT 'INR',
            timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS company_id VARCHAR,
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false
    """)

    op.execute("""
        INSERT INTO company_modules (id, company_id, module_name, is_enabled)
        SELECT gen_random_uuid()::text, c.id, m.module_name, true
        FROM companies c
        CROSS JOIN (
            VALUES
            ('dashboard'), ('production'), ('quality'), ('stock'),
            ('inventory'), ('dispatch'), ('purchase'), ('stores'),
            ('hr'), ('accounts'), ('maintenance'), ('payroll'),
            ('reports'), ('audit'), ('masters'), ('lotrac'), ('users')
        ) AS m(module_name)
        ON CONFLICT (company_id, module_name) DO NOTHING
    """)

def downgrade():
    op.execute("DROP TABLE IF EXISTS mill_settings")
    op.execute("DROP INDEX IF EXISTS uq_company_modules")
    op.execute("DROP TABLE IF EXISTS company_modules")
    op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS max_users")
    op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS max_mills")
    op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS subscription_plan")
    op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS enabled_modules")
    op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS is_active")
    op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS notes")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS company_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS must_change_password")
