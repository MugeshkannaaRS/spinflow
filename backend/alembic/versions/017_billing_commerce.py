"""Add billing commerce tables: payments, overage_pricing, additional columns

Revision ID: 017
Revises: 016
Create Date: 2026-06-06 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add additional_employee_cost to subscription_plans
    op.execute("""
    ALTER TABLE subscription_plans
        ADD COLUMN IF NOT EXISTS additional_employee_cost DECIMAL(12,2) DEFAULT 0
    """)

    # Add new columns to company_subscriptions
    op.execute("""
    ALTER TABLE company_subscriptions
        ADD COLUMN IF NOT EXISTS extra_employees INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS overdue_day INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS next_billing_at TIMESTAMPTZ
    """)

    # Add new columns to billing_invoices
    op.execute("""
    ALTER TABLE billing_invoices
        ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) DEFAULT 'subscription'
    """)

    # Billing payments table
    op.execute("""
    CREATE TABLE IF NOT EXISTS billing_payments (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
        invoice_id VARCHAR(36) REFERENCES billing_invoices(id),
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        method VARCHAR(50) DEFAULT 'bank_transfer',
        reference_number VARCHAR(200),
        gateway VARCHAR(50),
        gateway_response JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'completed',
        paid_at TIMESTAMPTZ,
        notes TEXT,
        entered_by VARCHAR(36) REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_billing_payments_company ON billing_payments(company_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_billing_payments_invoice ON billing_payments(invoice_id)")

    # Overage pricing table
    op.execute("""
    CREATE TABLE IF NOT EXISTS overage_pricing (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        unit_label VARCHAR(100) NOT NULL,
        min_quantity INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_overage_pricing_company ON overage_pricing(company_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS overage_pricing CASCADE")
    op.execute("DROP TABLE IF EXISTS billing_payments CASCADE")
    op.execute("""
    ALTER TABLE billing_invoices
        DROP COLUMN IF EXISTS due_date,
        DROP COLUMN IF EXISTS tax_amount,
        DROP COLUMN IF EXISTS subtotal,
        DROP COLUMN IF EXISTS notes,
        DROP COLUMN IF EXISTS is_auto_generated,
        DROP COLUMN IF EXISTS invoice_type
    """)
    op.execute("""
    ALTER TABLE company_subscriptions
        DROP COLUMN IF EXISTS extra_employees,
        DROP COLUMN IF EXISTS overdue_day,
        DROP COLUMN IF EXISTS trial_ends_at,
        DROP COLUMN IF EXISTS next_billing_at
    """)
    op.execute("ALTER TABLE subscription_plans DROP COLUMN IF EXISTS additional_employee_cost")
