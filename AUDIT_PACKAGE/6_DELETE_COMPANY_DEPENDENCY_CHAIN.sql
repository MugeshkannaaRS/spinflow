-- ====================================================================
-- SPINFLOW ERP — DELETE COMPANY COMPLETE DEPENDENCY CHAIN
-- ====================================================================
-- This script generates the EXACT deletion order for a company.
-- Use this when DELETE /admin/companies/{id} returns 500.
-- ====================================================================

-- ====================================================================
-- STEP 0: Analyze Dependency Graph
-- ====================================================================
-- Run this FIRST to understand what will be deleted

-- Replace 'REPLACE_WITH_COMPANY_ID' with actual UUID
\set COMPANY_ID '''REPLACE_WITH_COMPANY_ID'''

-- Foreign key graph for companies.id:
SELECT 
  'users' as table_name,
  COUNT(*) as record_count,
  'company_id' as fk_column
FROM users WHERE company_id = :COMPANY_ID
UNION ALL
SELECT 'mills', COUNT(*), 'company_id' FROM mills WHERE company_id = :COMPANY_ID
UNION ALL
SELECT 'company_subscriptions', COUNT(*), 'company_id' FROM company_subscriptions WHERE company_id = :COMPANY_ID
UNION ALL
SELECT 'audit_logs', COUNT(*), 'company_id' FROM audit_logs WHERE company_id = :COMPANY_ID
UNION ALL
SELECT 'deletion_logs', COUNT(*), 'company_id' FROM deletion_logs WHERE company_id = :COMPANY_ID;

-- Nested dependency: mills → hr_employees
SELECT 
  COUNT(*) as hr_employees_to_delete
FROM hr_employees 
WHERE mill_id IN (SELECT id FROM mills WHERE company_id = :COMPANY_ID);

-- Nested dependency: company_subscriptions → billing_invoices → billing_payments
SELECT 
  'billing_invoices' as table_name,
  COUNT(*) as record_count,
  'subscription_id' as fk_column
FROM billing_invoices 
WHERE subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID)
UNION ALL
SELECT 'billing_payments', COUNT(*), 'subscription_id' FROM billing_payments 
WHERE subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID)
UNION ALL
SELECT 'overdue_management', COUNT(*), 'subscription_id' FROM overdue_management 
WHERE subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID)
UNION ALL
SELECT 'subscription_change_requests', COUNT(*), 'subscription_id' FROM subscription_change_requests 
WHERE subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID);

-- ====================================================================
-- STEP 1: PRINT DELETION ORDER (for verification)
-- ====================================================================

WITH deletion_order AS (
  VALUES 
    (1, 'billing_payments', 'subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = %L)'),
    (2, 'billing_invoices', 'subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = %L)'),
    (3, 'subscription_change_requests', 'subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = %L)'),
    (4, 'overdue_management', 'subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = %L)'),
    (5, 'company_subscriptions', 'company_id = %L'),
    (6, 'hr_employees', 'mill_id IN (SELECT id FROM mills WHERE company_id = %L)'),
    (7, 'mills', 'company_id = %L'),
    (8, 'users', 'company_id = %L'),
    (9, 'deletion_logs', 'company_id = %L'),
    (10, 'audit_logs', 'company_id = %L'),
    (11, 'companies', 'id = %L')
)
SELECT 
  step,
  table_name,
  format(where_clause, :COMPANY_ID) as deletion_query
FROM deletion_order
ORDER BY step;

-- ====================================================================
-- STEP 2: EXECUTE DELETION (TRANSACTIONAL SAFETY)
-- ====================================================================

BEGIN TRANSACTION;

-- PHASE 1: Billing records (level 1, deepest)
DELETE FROM billing_payments 
WHERE subscription_id IN (
  SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID
);

DELETE FROM billing_invoices 
WHERE subscription_id IN (
  SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID
);

DELETE FROM subscription_change_requests 
WHERE subscription_id IN (
  SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID
);

DELETE FROM overdue_management 
WHERE subscription_id IN (
  SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID
);

-- PHASE 2: Subscriptions (level 2)
DELETE FROM company_subscriptions 
WHERE company_id = :COMPANY_ID;

-- PHASE 3: Mill-related records (level 2)
DELETE FROM hr_employees 
WHERE mill_id IN (
  SELECT id FROM mills WHERE company_id = :COMPANY_ID
);

DELETE FROM mills 
WHERE company_id = :COMPANY_ID;

-- PHASE 4: User-related records (level 2)
DELETE FROM users 
WHERE company_id = :COMPANY_ID;

-- PHASE 5: Audit & logging (level 2, safe to delete)
DELETE FROM deletion_logs 
WHERE company_id = :COMPANY_ID;

DELETE FROM audit_logs 
WHERE company_id = :COMPANY_ID;

-- PHASE 6: Company (level 0, root)
DELETE FROM companies 
WHERE id = :COMPANY_ID;

-- ====================================================================
-- STEP 3: VERIFY DELETION
-- ====================================================================

SELECT COUNT(*) as remaining_records 
FROM users WHERE company_id = :COMPANY_ID;

SELECT COUNT(*) as remaining_records 
FROM mills WHERE company_id = :COMPANY_ID;

SELECT COUNT(*) as remaining_records 
FROM hr_employees 
WHERE mill_id IN (SELECT id FROM mills WHERE company_id = :COMPANY_ID);

SELECT COUNT(*) as remaining_records 
FROM company_subscriptions WHERE company_id = :COMPANY_ID;

SELECT COUNT(*) as remaining_records 
FROM billing_invoices 
WHERE subscription_id IN (SELECT id FROM company_subscriptions WHERE company_id = :COMPANY_ID);

SELECT COUNT(*) as remaining_records 
FROM companies WHERE id = :COMPANY_ID;

-- If all counts = 0, deletion successful!

COMMIT;

-- ====================================================================
-- TROUBLESHOOTING: If deletion fails
-- ====================================================================

-- Check for FK constraint violations:
SELECT constraint_name, table_name, column_name 
FROM information_schema.key_column_usage 
WHERE referenced_table_name = 'companies' 
  AND referenced_column_name = 'id';

-- If you see unexpected FKs, list them:
SELECT 
  constraint_name,
  table_name,
  column_name,
  referenced_table_name,
  referenced_column_name
FROM information_schema.referential_constraints
WHERE referenced_table_schema = 'public'
  AND referenced_table_name = 'companies';

-- To temporarily disable FK checks (DANGEROUS, use only if you understand):
-- SET CONSTRAINTS ALL DEFERRED;

-- ====================================================================
-- HELPER: Generate deletion script for multiple companies
-- ====================================================================

-- If you want to batch-delete multiple test companies:

-- 1. Find all test companies
SELECT id, name, code FROM companies 
WHERE name ~* 'test|demo|lr-|pspl-' OR code ~* 'test|demo|lr-|pspl-'
ORDER BY created_at DESC;

-- 2. Generate DELETE script for each:
SELECT 
  'DELETE FROM companies WHERE id = ''' || id || ''';' as delete_stmt
FROM companies 
WHERE name ~* 'test|demo|lr-|pspl-' OR code ~* 'test|demo|lr-|pspl-'
ORDER BY created_at DESC;

-- 3. Manually prepend the nested deletions for each company ID

-- ====================================================================
-- EXPECTED OUTCOME
-- ====================================================================
/*
When successfully deleted:

- All users for company → removed
- All mills for company → removed
- All employees in those mills → removed
- All subscriptions for company → removed
- All invoices for subscriptions → removed
- All payments for subscriptions → removed
- All audit logs for company → removed
- Company record → removed

Status: COMPLETELY CLEANED UP
Orphan records: 0
Data integrity: ✓ PASS
*/

-- ====================================================================
-- RECOVERY: If deletion partially failed
-- ====================================================================

-- Query to find orphaned records after incomplete delete:
SELECT 'orphan_users' as orphan_type, COUNT(*) as count
FROM users WHERE company_id NOT IN (SELECT id FROM companies)
UNION ALL
SELECT 'orphan_mills', COUNT(*) FROM mills 
WHERE company_id NOT IN (SELECT id FROM companies)
UNION ALL
SELECT 'orphan_employees', COUNT(*) FROM hr_employees 
WHERE mill_id NOT IN (SELECT id FROM mills)
UNION ALL
SELECT 'orphan_subscriptions', COUNT(*) FROM company_subscriptions 
WHERE company_id NOT IN (SELECT id FROM companies)
UNION ALL
SELECT 'orphan_invoices', COUNT(*) FROM billing_invoices 
WHERE subscription_id NOT IN (SELECT id FROM company_subscriptions);

-- If any > 0, run the cleanup queries in AUDIT_PACKAGE/5_DATABASE_INTEGRITY_AUDIT.sql

-- ====================================================================
-- END OF DELETION CHAIN SCRIPT
-- ====================================================================
