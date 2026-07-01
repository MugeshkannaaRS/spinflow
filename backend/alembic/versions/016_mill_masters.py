"""Create mill_masters, mill_custom_fields, mill_record_values tables
and enhance company_subscriptions with user limits + currency.

Revision ID: 016
Revises: 015
Create Date: 2026-06-05 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── mill_masters ────────────────────────────────────────────────────
    op.execute("""
    CREATE TABLE IF NOT EXISTS mill_masters (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mill_id     UUID NOT NULL REFERENCES mills(id) ON DELETE CASCADE,
        company_id  VARCHAR(36) NOT NULL,
        category    VARCHAR(50) NOT NULL,
        value       VARCHAR(200) NOT NULL,
        code        VARCHAR(50),
        metadata    JSONB DEFAULT '{}',
        is_active   BOOLEAN DEFAULT TRUE,
        source      VARCHAR(20) DEFAULT 'import',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_mill_masters_mill_cat_val UNIQUE(mill_id, category, value)
    )
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_mill_masters_mill_category
        ON mill_masters(mill_id, category)
        WHERE is_active = TRUE
    """)

    # ── mill_custom_fields ──────────────────────────────────────────────
    op.execute("""
    CREATE TABLE IF NOT EXISTS mill_custom_fields (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mill_id         UUID NOT NULL REFERENCES mills(id) ON DELETE CASCADE,
        company_id      VARCHAR(36) NOT NULL,
        module          VARCHAR(50) NOT NULL,
        field_key       VARCHAR(100) NOT NULL,
        field_label     VARCHAR(200) NOT NULL,
        field_type      VARCHAR(30) DEFAULT 'text',
        dropdown_values JSONB DEFAULT '[]',
        is_required     BOOLEAN DEFAULT FALSE,
        sequence        INTEGER DEFAULT 0,
        source          VARCHAR(20) DEFAULT 'import',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_mill_custom_fields UNIQUE(mill_id, module, field_key)
    )
    """)

    # ── mill_record_values ──────────────────────────────────────────────
    op.execute("""
    CREATE TABLE IF NOT EXISTS mill_record_values (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mill_id      UUID NOT NULL,
        module       VARCHAR(50) NOT NULL,
        record_id    VARCHAR(36) NOT NULL,
        field_key    VARCHAR(100) NOT NULL,
        value_text   TEXT,
        value_number NUMERIC,
        value_date   DATE,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_mill_record_values UNIQUE(mill_id, module, record_id, field_key)
    )
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_mrv_record
        ON mill_record_values(record_id, module)
    """)

    # ── Enhance company_subscriptions ──────────────────────────────────
    op.execute("""
    ALTER TABLE company_subscriptions
        ADD COLUMN IF NOT EXISTS max_users       INTEGER DEFAULT 10,
        ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(10) DEFAULT '₹',
        ADD COLUMN IF NOT EXISTS currency_code   VARCHAR(5)  DEFAULT 'INR'
    """)

    # ── View: live user counts per company ─────────────────────────────
    op.execute("""
    CREATE OR REPLACE VIEW company_user_counts AS
    SELECT
        company_id,
        COUNT(*) FILTER (WHERE is_active = TRUE AND deleted_at IS NULL) AS active_users,
        COUNT(*) AS total_users
    FROM users
    GROUP BY company_id
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS company_user_counts")
    op.execute("DROP TABLE IF EXISTS mill_record_values CASCADE")
    op.execute("DROP TABLE IF EXISTS mill_custom_fields CASCADE")
    op.execute("DROP TABLE IF EXISTS mill_masters CASCADE")
    op.execute("""
    ALTER TABLE company_subscriptions
        DROP COLUMN IF EXISTS max_users,
        DROP COLUMN IF EXISTS currency_symbol,
        DROP COLUMN IF EXISTS currency_code
    """)
