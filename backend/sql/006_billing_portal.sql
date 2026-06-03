-- Migration: Add billing portal tables (invoices, subscription change requests)
-- Run this for fresh Supabase deploys after alembic upgrade head

CREATE TABLE IF NOT EXISTS billing_invoices (
    id VARCHAR(36) PRIMARY KEY,
    company_id VARCHAR(36) REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    company_subscription_id VARCHAR(36) REFERENCES company_subscriptions(id),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(20) DEFAULT 'pending',
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    transaction_id VARCHAR(100),
    gateway VARCHAR(50),
    pdf_content TEXT,
    line_items JSONB DEFAULT '{}',
    invoice_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_company ON billing_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_number ON billing_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);

CREATE TABLE IF NOT EXISTS subscription_change_requests (
    id VARCHAR(36) PRIMARY KEY,
    company_id VARCHAR(36) REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    requested_by VARCHAR(36) REFERENCES users(id) NOT NULL,
    current_plan_id VARCHAR(36) REFERENCES subscription_plans(id) NOT NULL,
    requested_plan_id VARCHAR(36) REFERENCES subscription_plans(id) NOT NULL,
    change_type VARCHAR(30) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by VARCHAR(36) REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    request_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_requests_company ON subscription_change_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON subscription_change_requests(status);
