-- Migration: Add subscription/billing tables
-- Run this for fresh Supabase deploys after alembic upgrade head

-- Subscription plans (configurable)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    monthly_price DECIMAL(12,2) DEFAULT 0,
    yearly_price DECIMAL(12,2) DEFAULT 0,
    included_mills INTEGER DEFAULT 1,
    included_users INTEGER DEFAULT 25,
    additional_mill_cost DECIMAL(12,2) DEFAULT 0,
    additional_user_cost DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Module pricing per plan
CREATE TABLE IF NOT EXISTS module_pricing (
    id VARCHAR(36) PRIMARY KEY,
    plan_id VARCHAR(36) REFERENCES subscription_plans(id) ON DELETE CASCADE NOT NULL,
    module_name VARCHAR(100) NOT NULL,
    monthly_price DECIMAL(12,2) DEFAULT 0,
    yearly_price DECIMAL(12,2) DEFAULT 0,
    is_included BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_module_pricing_plan ON module_pricing(plan_id);

-- Company-level subscription tracking
CREATE TABLE IF NOT EXISTS company_subscriptions (
    id VARCHAR(36) PRIMARY KEY,
    company_id VARCHAR(36) REFERENCES companies(id) ON DELETE CASCADE UNIQUE NOT NULL,
    plan_id VARCHAR(36) REFERENCES subscription_plans(id) NOT NULL,
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    status VARCHAR(20) DEFAULT 'active',
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    addon_modules JSONB DEFAULT '{}',
    extra_mills INTEGER DEFAULT 0,
    extra_users INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company ON company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_plan ON company_subscriptions(plan_id);
