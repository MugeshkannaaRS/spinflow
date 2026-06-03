"""Create billing tables: subscription_plans, module_pricing, company_subscriptions,
billing_invoices, subscription_change_requests.

Revision ID: 015
Revises: 014
Create Date: 2026-06-03 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id          VARCHAR(36)     NOT NULL PRIMARY KEY,
            code        VARCHAR(50)     NOT NULL UNIQUE,
            name        VARCHAR(200)    NOT NULL,
            description TEXT,
            monthly_price   NUMERIC(12,2)   NOT NULL DEFAULT 0,
            yearly_price    NUMERIC(12,2)   NOT NULL DEFAULT 0,
            included_mills  INTEGER         NOT NULL DEFAULT 1,
            included_users  INTEGER         NOT NULL DEFAULT 25,
            additional_mill_cost    NUMERIC(12,2)   NOT NULL DEFAULT 0,
            additional_user_cost    NUMERIC(12,2)   NOT NULL DEFAULT 0,
            is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
            sort_order  INTEGER         NOT NULL DEFAULT 0,
            created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscription_plans_code ON subscription_plans (code)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS module_pricing (
            id          VARCHAR(36)     NOT NULL PRIMARY KEY,
            plan_id     VARCHAR(36)     NOT NULL REFERENCES subscription_plans (id) ON DELETE CASCADE,
            module_name VARCHAR(100)    NOT NULL,
            monthly_price   NUMERIC(12,2)   NOT NULL DEFAULT 0,
            yearly_price    NUMERIC(12,2)   NOT NULL DEFAULT 0,
            is_included BOOLEAN         NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_module_pricing_plan_id ON module_pricing (plan_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS company_subscriptions (
            id          VARCHAR(36)     NOT NULL PRIMARY KEY,
            company_id  VARCHAR(36)     NOT NULL UNIQUE REFERENCES companies (id) ON DELETE CASCADE,
            plan_id     VARCHAR(36)     NOT NULL REFERENCES subscription_plans (id),
            billing_cycle   VARCHAR(20) NOT NULL DEFAULT 'monthly',
            status      VARCHAR(20)     NOT NULL DEFAULT 'active',
            started_at  TIMESTAMP WITH TIME ZONE,
            expires_at  TIMESTAMP WITH TIME ZONE,
            cancelled_at TIMESTAMP WITH TIME ZONE,
            addon_modules   JSONB,
            extra_mills INTEGER         NOT NULL DEFAULT 0,
            extra_users INTEGER         NOT NULL DEFAULT 0,
            created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_company_subscriptions_company_id ON company_subscriptions (company_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS billing_invoices (
            id              VARCHAR(36)     NOT NULL PRIMARY KEY,
            company_id      VARCHAR(36)     NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
            company_subscription_id VARCHAR(36) REFERENCES company_subscriptions (id),
            invoice_number  VARCHAR(50)     NOT NULL UNIQUE,
            amount          NUMERIC(12,2)   NOT NULL,
            currency        VARCHAR(10)     NOT NULL DEFAULT 'INR',
            status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
            billing_period_start    TIMESTAMP WITH TIME ZONE,
            billing_period_end      TIMESTAMP WITH TIME ZONE,
            paid_at         TIMESTAMP WITH TIME ZONE,
            transaction_id  VARCHAR(100),
            gateway         VARCHAR(50),
            pdf_content     TEXT,
            line_items      JSONB,
            metadata        JSONB,
            created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_billing_invoices_company_id ON billing_invoices (company_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_billing_invoices_invoice_number ON billing_invoices (invoice_number)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS subscription_change_requests (
            id                  VARCHAR(36)     NOT NULL PRIMARY KEY,
            company_id          VARCHAR(36)     NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
            requested_by        VARCHAR(36)     NOT NULL REFERENCES users (id),
            current_plan_id     VARCHAR(36)     NOT NULL REFERENCES subscription_plans (id),
            requested_plan_id   VARCHAR(36)     NOT NULL REFERENCES subscription_plans (id),
            change_type         VARCHAR(30)     NOT NULL,
            reason              TEXT,
            status              VARCHAR(20)     NOT NULL DEFAULT 'pending',
            reviewed_by         VARCHAR(36)     REFERENCES users (id),
            reviewed_at         TIMESTAMP WITH TIME ZONE,
            review_notes        TEXT,
            metadata            JSONB,
            created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscription_change_requests_company_id ON subscription_change_requests (company_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS subscription_change_requests CASCADE")
    op.execute("DROP TABLE IF EXISTS billing_invoices CASCADE")
    op.execute("DROP TABLE IF EXISTS company_subscriptions CASCADE")
    op.execute("DROP TABLE IF EXISTS module_pricing CASCADE")
    op.execute("DROP TABLE IF EXISTS subscription_plans CASCADE")
