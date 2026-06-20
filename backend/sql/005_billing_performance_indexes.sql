-- 005_billing_performance_indexes.sql
-- Add performance indexes for billing, audit, and stock tables
-- All use CREATE INDEX IF NOT EXISTS with CONCURRENTLY for zero-downtime production application

-- billing_invoices
CREATE INDEX IF NOT EXISTS idx_billing_invoices_company_status
    ON billing_invoices (company_id, status) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status_paid_at
    ON billing_invoices (status, paid_at) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_billing_invoices_type_status
    ON billing_invoices (invoice_type, status) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_billing_invoices_company_paid_at
    ON billing_invoices (company_id, paid_at) CONCURRENTLY;

-- company_subscriptions
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_status
    ON company_subscriptions (status) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company_status
    ON company_subscriptions (company_id, status) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_expires_at
    ON company_subscriptions (expires_at) CONCURRENTLY;

-- billing_payments
CREATE INDEX IF NOT EXISTS idx_billing_payments_company_status
    ON billing_payments (company_id, status) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_billing_payments_invoice_id
    ON billing_payments (invoice_id) CONCURRENTLY;

-- subscription_change_requests
CREATE INDEX IF NOT EXISTS idx_sub_change_reqs_company_status
    ON subscription_change_requests (company_id, status) CONCURRENTLY;

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
    ON audit_logs (entity_id, created_at) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
    ON audit_logs (company_id, created_at) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_module_created
    ON audit_logs (module, created_at) CONCURRENTLY;

-- stock_balance / stock_ledger
CREATE INDEX IF NOT EXISTS idx_stock_balance_last_move_at
    ON stock_balance (last_move_at) CONCURRENTLY;
CREATE INDEX IF NOT EXISTS idx_stock_ledger_lot_created
    ON stock_ledger (lot_id, created_at) CONCURRENTLY;
