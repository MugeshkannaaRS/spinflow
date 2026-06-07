-- ============================================================
-- SpinFlow ERP — Database Integrity Audit + Cleanup Script
-- Generated: 2026-06-07
-- Run on Supabase SQL editor. Review counts BEFORE running DELETEs.
-- ============================================================

-- ── 1. AUDIT: Orphan users (company_id references non-existent company) ──────
SELECT COUNT(*) AS orphan_users
FROM users u
WHERE u.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = u.company_id);

-- ── 2. AUDIT: Orphan employees (mill_id references non-existent mill) ────────
SELECT COUNT(*) AS orphan_employees
FROM employees e
WHERE NOT EXISTS (SELECT 1 FROM mills m WHERE m.id = e.mill_id);

-- ── 3. AUDIT: Orphan subscriptions (company deleted but subscription remains) -
SELECT COUNT(*) AS orphan_subscriptions
FROM company_subscriptions cs
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = cs.company_id);

-- ── 4. AUDIT: Orphan billing invoices ────────────────────────────────────────
SELECT COUNT(*) AS orphan_billing_invoices
FROM billing_invoices bi
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = bi.company_id);

-- ── 5. AUDIT: Orphan billing payments ────────────────────────────────────────
SELECT COUNT(*) AS orphan_billing_payments
FROM billing_payments bp
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = bp.company_id);

-- ── 6. AUDIT: Orphan company_modules ─────────────────────────────────────────
SELECT COUNT(*) AS orphan_company_modules
FROM company_modules cm
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = cm.company_id);

-- ── 7. AUDIT: Orphan audit_logs (user deleted without cleaning audit_logs) ───
SELECT COUNT(*) AS orphan_audit_logs
FROM audit_logs al
WHERE al.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = al.user_id);

-- ── 8. AUDIT: Test / demo companies ──────────────────────────────────────────
SELECT id, name, code, status, created_at
FROM companies
WHERE code ILIKE 'LR-%'
   OR code ILIKE 'PSPL-%'
   OR code ILIKE 'DEMO-%'
   OR code ILIKE 'TEST-%'
   OR name ILIKE '%test%'
   OR name ILIKE '%demo%'
ORDER BY created_at;

-- ── 9. AUDIT: Users with no company (not SUPER_ADMIN) ────────────────────────
SELECT u.id, u.name, u.email, r.code AS role
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE u.company_id IS NULL
  AND r.code != 'SUPER_ADMIN'
  AND u.deleted_at IS NULL;

-- ── 10. AUDIT: duplicate active users (same email) ───────────────────────────
SELECT email, COUNT(*) AS cnt
FROM users
WHERE deleted_at IS NULL AND is_active = true
GROUP BY email
HAVING COUNT(*) > 1;

-- ── CLEANUP SECTION ─── Review audit results above first ─────────────────────
-- Uncomment and run only after confirming the audit counts above.

-- Clean orphan audit_logs (safe — just logs)
-- DELETE FROM audit_logs WHERE user_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = audit_logs.user_id);

-- Clean orphan company_modules
-- DELETE FROM company_modules WHERE NOT EXISTS
--   (SELECT 1 FROM companies c WHERE c.id = company_modules.company_id);

-- Clean orphan subscriptions
-- DELETE FROM company_subscriptions WHERE NOT EXISTS
--   (SELECT 1 FROM companies c WHERE c.id = company_subscriptions.company_id);

-- Clean orphan billing invoices
-- DELETE FROM billing_invoices WHERE NOT EXISTS
--   (SELECT 1 FROM companies c WHERE c.id = billing_invoices.company_id);

-- Clean orphan billing payments
-- DELETE FROM billing_payments WHERE NOT EXISTS
--   (SELECT 1 FROM companies c WHERE c.id = billing_payments.company_id);
