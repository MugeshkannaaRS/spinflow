-- ====================================================================
-- SPINFLOW ERP — DATABASE INTEGRITY AUDIT SQL PACK
-- ====================================================================
-- Purpose: Detect orphans, duplicates, test data, and verify counters
-- Usage: Run in psql against production database
-- Output: Save results for audit report
-- ====================================================================

-- ====================================================================
-- PART 1: TEST & DEMO DATA DETECTION
-- ====================================================================

-- Find all companies matching demo/test patterns
SELECT 
  id, name, code, status, created_at,
  CASE 
    WHEN name ~* 'test|demo|lr-|pspl-|staging|sandbox' THEN 'TEST/DEMO'
    WHEN code ~* 'test|demo|lr-|pspl-' THEN 'TEST/DEMO'
    ELSE 'PRODUCTION'
  END as data_category,
  COUNT(*) OVER () as total_records
FROM companies
WHERE 
  name ~* 'test|demo|lr-|pspl-|staging|sandbox'
  OR code ~* 'test|demo|lr-|pspl-'
ORDER BY created_at DESC;

-- Count by category
SELECT 
  CASE 
    WHEN name ~* 'test|demo|lr-|pspl-|staging|sandbox' THEN 'TEST/DEMO'
    WHEN code ~* 'test|demo|lr-|pspl-' THEN 'TEST/DEMO'
    ELSE 'PRODUCTION'
  END as category,
  COUNT(*) as count
FROM companies
GROUP BY category;

-- ====================================================================
-- PART 2: ORPHAN DETECTION
-- ====================================================================

-- Orphan users (no valid company_id)
SELECT 
  u.id, u.email, u.company_id, u.created_at,
  'ORPHAN: No company' as issue
FROM users u
WHERE u.company_id IS NULL
UNION ALL
SELECT 
  u.id, u.email, u.company_id, u.created_at,
  'ORPHAN: Company deleted' as issue
FROM users u
LEFT JOIN companies c ON u.company_id = c.id
WHERE u.company_id IS NOT NULL AND c.id IS NULL;

-- Orphan mills (no valid company_id)
SELECT 
  m.id, m.name, m.company_id, m.created_at,
  'ORPHAN: Company missing' as issue
FROM mills m
LEFT JOIN companies c ON m.company_id = c.id
WHERE c.id IS NULL;

-- Orphan employees (no valid mill_id)
SELECT 
  e.id, e.employee_id, e.mill_id, e.created_at,
  'ORPHAN: Mill missing' as issue
FROM hr_employees e
LEFT JOIN mills m ON e.mill_id = m.id
WHERE e.mill_id IS NOT NULL AND m.id IS NULL;

-- Orphan subscriptions (company deleted but subscription active)
SELECT 
  s.id, s.company_id, s.plan_type, s.status, s.created_at,
  'ORPHAN: Company deleted' as issue
FROM company_subscriptions s
LEFT JOIN companies c ON s.company_id = c.id
WHERE c.id IS NULL;

-- Orphan invoices (subscription deleted but invoices exist)
SELECT 
  bi.id, bi.subscription_id, bi.invoice_number, bi.created_at,
  'ORPHAN: Subscription missing' as issue
FROM billing_invoices bi
LEFT JOIN company_subscriptions cs ON bi.subscription_id = cs.id
WHERE cs.id IS NULL;

-- ====================================================================
-- PART 3: DUPLICATE DETECTION
-- ====================================================================

-- Duplicate company codes (should be unique)
SELECT code, COUNT(*) as count
FROM companies
WHERE status != 'archived'
GROUP BY code
HAVING COUNT(*) > 1;

-- Duplicate company emails (should be unique per company at least)
SELECT email, company_id, COUNT(*) as count
FROM users
WHERE is_active = true
GROUP BY email, company_id
HAVING COUNT(*) > 1;

-- Duplicate mill names per company
SELECT company_id, name, COUNT(*) as count
FROM mills
WHERE deleted_at IS NULL
GROUP BY company_id, name
HAVING COUNT(*) > 1;

-- Duplicate employee IDs per mill
SELECT mill_id, employee_id, COUNT(*) as count
FROM hr_employees
WHERE deleted_at IS NULL
GROUP BY mill_id, employee_id
HAVING COUNT(*) > 1;

-- ====================================================================
-- PART 4: INACTIVE COMPANIES WITH ACTIVE ENTITIES
-- ====================================================================

-- Suspended companies with active users
SELECT 
  c.id, c.name, c.status,
  COUNT(u.id) as active_users
FROM companies c
LEFT JOIN users u ON c.id = u.company_id AND u.is_active = true
WHERE c.status = 'suspended'
GROUP BY c.id, c.name, c.status
HAVING COUNT(u.id) > 0;

-- Suspended companies with active mills
SELECT 
  c.id, c.name, c.status,
  COUNT(m.id) as active_mills
FROM companies c
LEFT JOIN mills m ON c.id = m.company_id AND m.deleted_at IS NULL
WHERE c.status = 'suspended'
GROUP BY c.id, c.name, c.status
HAVING COUNT(m.id) > 0;

-- Archived companies with active subscriptions
SELECT 
  c.id, c.name, c.status,
  COUNT(s.id) as active_subscriptions
FROM companies c
LEFT JOIN company_subscriptions s ON c.id = s.company_id 
  AND s.status IN ('active', 'past_due', 'trialing')
WHERE c.status = 'archived'
GROUP BY c.id, c.name, c.status
HAVING COUNT(s.id) > 0;

-- ====================================================================
-- PART 5: INTEGRITY CONSTRAINTS
-- ====================================================================

-- Users with invalid roles
SELECT id, email, role
FROM users
WHERE role NOT IN (
  'SUPER_ADMIN', 'MILL_OWNER', 'MILL_ADMIN', 'SUPERVISOR',
  'SECURITY_GATE', 'AUDITOR', 'OPERATOR', 'HR_MANAGER',
  'HR_ADMIN', 'PAYROLL_ADMIN', 'PAYROLL_USER', 'MACHINE_OPERATOR',
  'DISPATCH_ADMIN', 'DISPATCH_USER'
);

-- Users with invalid status
SELECT id, email, is_active
FROM users
WHERE is_active IS NULL;

-- Companies with invalid status
SELECT id, name, status
FROM companies
WHERE status NOT IN ('active', 'suspended', 'archived');

-- Invoices with invalid status
SELECT id, invoice_number, status
FROM billing_invoices
WHERE status NOT IN ('draft', 'issued', 'paid', 'partial', 'overdue', 'canceled');

-- ====================================================================
-- PART 6: COUNTER VERIFICATION (Single Source of Truth)
-- ====================================================================

-- COUNTER 1: Total Companies by Status
SELECT 
  status,
  COUNT(*) as actual_count,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
  COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_count,
  COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_count
FROM companies
GROUP BY status;

-- Canonical query: Total companies (SINGLE SOURCE OF TRUTH)
SELECT COUNT(*) as total_companies FROM companies;
SELECT COUNT(*) as active_companies FROM companies WHERE status = 'active';
SELECT COUNT(*) as suspended_companies FROM companies WHERE status = 'suspended';
SELECT COUNT(*) as archived_companies FROM companies WHERE status = 'archived';

-- COUNTER 2: Mills per Company
SELECT 
  c.id, c.name,
  COUNT(m.id) as actual_mills_count,
  c.mills_count as reported_mills_count,
  COUNT(m.id) - c.mills_count as discrepancy
FROM companies c
LEFT JOIN mills m ON c.id = m.company_id AND m.deleted_at IS NULL
GROUP BY c.id, c.name, c.mills_count
HAVING COUNT(m.id) != c.mills_count;

-- Canonical query: Mills count (SINGLE SOURCE OF TRUTH)
SELECT COUNT(DISTINCT mill_id) as total_mills FROM mills WHERE deleted_at IS NULL;
SELECT company_id, COUNT(*) as mill_count 
FROM mills 
WHERE deleted_at IS NULL 
GROUP BY company_id;

-- COUNTER 3: Users per Company
SELECT 
  c.id, c.name,
  COUNT(u.id) as actual_users_count,
  COUNT(CASE WHEN u.is_active = true THEN 1 END) as active_users,
  COUNT(CASE WHEN u.is_active = false THEN 1 END) as inactive_users
FROM companies c
LEFT JOIN users u ON c.id = u.company_id
GROUP BY c.id, c.name;

-- Canonical query: Users count (SINGLE SOURCE OF TRUTH)
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as active_users FROM users WHERE is_active = true;
SELECT company_id, COUNT(*) as user_count 
FROM users 
GROUP BY company_id;

-- COUNTER 4: Employees per Mill
SELECT 
  m.id, m.name,
  COUNT(e.id) as actual_employees_count
FROM mills m
LEFT JOIN hr_employees e ON m.id = e.mill_id AND e.deleted_at IS NULL
GROUP BY m.id, m.name
ORDER BY actual_employees_count DESC;

-- Canonical query: Employees count (SINGLE SOURCE OF TRUTH)
SELECT COUNT(DISTINCT id) as total_employees 
FROM hr_employees 
WHERE deleted_at IS NULL;
SELECT mill_id, COUNT(*) as employee_count 
FROM hr_employees 
WHERE deleted_at IS NULL
GROUP BY mill_id;

-- ====================================================================
-- PART 7: BILLING RECONCILIATION
-- ====================================================================

-- Invoices per subscription (should match billing cycles)
SELECT 
  s.id, s.company_id, s.plan_type,
  COUNT(i.id) as invoice_count,
  COUNT(CASE WHEN i.status = 'paid' THEN 1 END) as paid_count,
  COUNT(CASE WHEN i.status IN ('overdue', 'past_due') THEN 1 END) as overdue_count
FROM company_subscriptions s
LEFT JOIN billing_invoices i ON s.id = i.subscription_id
GROUP BY s.id, s.company_id, s.plan_type
ORDER BY invoice_count DESC;

-- Subscriptions with no invoices (should have at least one)
SELECT s.id, s.company_id, s.plan_type, s.created_at
FROM company_subscriptions s
LEFT JOIN billing_invoices i ON s.id = i.subscription_id
WHERE i.id IS NULL;

-- Payments with no invoice
SELECT 
  bp.id, bp.subscription_id, bp.amount, bp.created_at
FROM billing_payments bp
LEFT JOIN billing_invoices bi ON bp.invoice_id = bi.id
WHERE bp.invoice_id IS NOT NULL AND bi.id IS NULL;

-- ====================================================================
-- PART 8: AUDIT LOG VERIFICATION
-- ====================================================================

-- Audit events with missing users (user_id is NULL or points to deleted user)
SELECT 
  al.id, al.action, al.entity_type, al.user_id, al.created_at
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
WHERE al.user_id IS NOT NULL AND u.id IS NULL;

-- Audit events per company (should show activity)
SELECT 
  c.id, c.name,
  COUNT(al.id) as audit_count
FROM companies c
LEFT JOIN audit_logs al ON al.company_id = c.id
GROUP BY c.id, c.name
ORDER BY audit_count ASC;

-- ====================================================================
-- PART 9: SUMMARY REPORT
-- ====================================================================

-- Comprehensive data quality score
WITH quality_checks AS (
  SELECT 'Orphan Users' as check_name, COUNT(*) as issue_count 
  FROM users WHERE company_id IS NULL
  UNION ALL
  SELECT 'Orphan Mills', COUNT(*) FROM mills 
  WHERE company_id IS NOT NULL AND company_id NOT IN (SELECT id FROM companies)
  UNION ALL
  SELECT 'Orphan Employees', COUNT(*) FROM hr_employees 
  WHERE mill_id IS NOT NULL AND mill_id NOT IN (SELECT id FROM mills)
  UNION ALL
  SELECT 'Orphan Subscriptions', COUNT(*) FROM company_subscriptions 
  WHERE company_id NOT IN (SELECT id FROM companies)
  UNION ALL
  SELECT 'Invalid Roles', COUNT(*) FROM users 
  WHERE role NOT IN ('SUPER_ADMIN', 'MILL_OWNER', 'MILL_ADMIN', 'SUPERVISOR', 
                     'SECURITY_GATE', 'AUDITOR', 'OPERATOR', 'HR_MANAGER',
                     'HR_ADMIN', 'PAYROLL_ADMIN', 'PAYROLL_USER', 'MACHINE_OPERATOR',
                     'DISPATCH_ADMIN', 'DISPATCH_USER')
  UNION ALL
  SELECT 'Test/Demo Companies', COUNT(*) FROM companies 
  WHERE name ~* 'test|demo|lr-|pspl-|staging|sandbox' 
    OR code ~* 'test|demo|lr-|pspl-'
)
SELECT 
  check_name, 
  issue_count,
  CASE WHEN issue_count = 0 THEN '✓ PASS' ELSE '✗ FAIL' END as status
FROM quality_checks
ORDER BY issue_count DESC;

-- ====================================================================
-- PART 10: DELETE COMPANY DEPENDENCY CHAIN
-- ====================================================================

-- Run this to see EXACT deletion order for a company
-- Replace 'COMPANY_ID_HERE' with the actual company UUID

/*
BEGIN;

-- STEP 1: Find all related records
SELECT COUNT(*) as users_to_delete FROM users WHERE company_id = 'COMPANY_ID_HERE';
SELECT COUNT(*) as mills_to_delete FROM mills WHERE company_id = 'COMPANY_ID_HERE';
SELECT COUNT(*) as subscriptions_to_delete FROM company_subscriptions WHERE company_id = 'COMPANY_ID_HERE';
SELECT COUNT(*) as audits_to_delete FROM audit_logs WHERE company_id = 'COMPANY_ID_HERE';

-- STEP 2: Delete in dependency order
-- 2a. Collect mill IDs
WITH company_mills AS (
  SELECT id FROM mills WHERE company_id = 'COMPANY_ID_HERE'
)
-- 2b. Delete employees from those mills
DELETE FROM hr_employees 
WHERE mill_id IN (SELECT id FROM company_mills);

-- 2c. Delete billing records
WITH company_subs AS (
  SELECT id FROM company_subscriptions WHERE company_id = 'COMPANY_ID_HERE'
)
DELETE FROM billing_payments WHERE subscription_id IN (SELECT id FROM company_subs);
DELETE FROM billing_invoices WHERE subscription_id IN (SELECT id FROM company_subs);
DELETE FROM company_subscriptions WHERE company_id = 'COMPANY_ID_HERE';

-- 2d. Delete mills
DELETE FROM mills WHERE company_id = 'COMPANY_ID_HERE';

-- 2e. Delete users
DELETE FROM users WHERE company_id = 'COMPANY_ID_HERE';

-- 2f. Delete audit logs
DELETE FROM audit_logs WHERE company_id = 'COMPANY_ID_HERE';

-- 2g. Delete company
DELETE FROM companies WHERE id = 'COMPANY_ID_HERE';

COMMIT;
*/

-- ====================================================================
-- END OF AUDIT PACK
-- ====================================================================
