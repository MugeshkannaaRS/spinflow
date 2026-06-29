-- ====================================================================
-- SPINFLOW ERP — COUNTER RECONCILIATION
-- ====================================================================
-- Single source of truth for all KPI counters.
-- These queries are the ONLY authoritative source for dashboard numbers.
-- ====================================================================

-- ====================================================================
-- SECTION A: COMPANY COUNTERS (Single Source of Truth)
-- ====================================================================

-- CANONICAL: Total companies across all states
SELECT COUNT(*) as total_companies FROM companies;

-- CANONICAL: Companies by status
SELECT 
  status,
  COUNT(*) as count
FROM companies
GROUP BY status
ORDER BY status;

-- CANONICAL: Companies by plan type
SELECT 
  plan_type,
  COUNT(*) as count
FROM company_subscriptions cs
JOIN companies c ON cs.company_id = c.id
WHERE cs.status IN ('active', 'trialing')
GROUP BY plan_type
ORDER BY plan_type;

-- CANONICAL: Active companies (for dashboard)
SELECT COUNT(*) as active_companies 
FROM companies 
WHERE status = 'active';

-- CANONICAL: Suspended companies (overdue/billing issue)
SELECT COUNT(*) as suspended_companies 
FROM companies 
WHERE status = 'suspended';

-- CANONICAL: Archived companies (not in use)
SELECT COUNT(*) as archived_companies 
FROM companies 
WHERE status = 'archived';

-- ====================================================================
-- SECTION B: MILL COUNTERS (Single Source of Truth)
-- ====================================================================

-- CANONICAL: Total mills (active only)
SELECT COUNT(*) as total_mills 
FROM mills 
WHERE deleted_at IS NULL;

-- CANONICAL: Mills by status
SELECT 
  CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END as status,
  COUNT(*) as count
FROM mills
GROUP BY CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END;

-- CANONICAL: Mills per company (for reconciliation)
SELECT 
  c.id, c.name,
  COUNT(m.id) as mill_count
FROM companies c
LEFT JOIN mills m ON c.id = m.company_id AND m.deleted_at IS NULL
GROUP BY c.id, c.name
ORDER BY mill_count DESC;

-- ====================================================================
-- SECTION C: USER COUNTERS (Single Source of Truth)
-- ====================================================================

-- CANONICAL: Total users across all companies
SELECT COUNT(*) as total_users 
FROM users;

-- CANONICAL: Active users only
SELECT COUNT(*) as active_users 
FROM users 
WHERE is_active = true;

-- CANONICAL: Inactive/disabled users
SELECT COUNT(*) as inactive_users 
FROM users 
WHERE is_active = false;

-- CANONICAL: Users by role (distribution)
SELECT 
  role,
  COUNT(*) as count
FROM users
WHERE is_active = true
GROUP BY role
ORDER BY count DESC;

-- CANONICAL: Users per company
SELECT 
  c.id, c.name,
  COUNT(u.id) as user_count,
  COUNT(CASE WHEN u.is_active = true THEN 1 END) as active_user_count
FROM companies c
LEFT JOIN users u ON c.id = u.company_id
GROUP BY c.id, c.name
ORDER BY user_count DESC;

-- CANONICAL: Super admins (should be very few)
SELECT COUNT(*) as super_admin_count 
FROM users 
WHERE role = 'SUPER_ADMIN' AND is_active = true;

-- ====================================================================
-- SECTION D: EMPLOYEE COUNTERS (Single Source of Truth)
-- ====================================================================

-- CANONICAL: Total employees (active only)
SELECT COUNT(*) as total_employees 
FROM hr_employees 
WHERE deleted_at IS NULL;

-- CANONICAL: Employees per mill
SELECT 
  m.id, m.name,
  COUNT(e.id) as employee_count
FROM mills m
LEFT JOIN hr_employees e ON m.id = e.mill_id AND e.deleted_at IS NULL
GROUP BY m.id, m.name
ORDER BY employee_count DESC;

-- CANONICAL: Employees per company (aggregate)
SELECT 
  c.id, c.name,
  COUNT(e.id) as total_employees
FROM companies c
LEFT JOIN mills m ON c.id = m.company_id AND m.deleted_at IS NULL
LEFT JOIN hr_employees e ON m.id = e.mill_id AND e.deleted_at IS NULL
GROUP BY c.id, c.name
ORDER BY total_employees DESC;

-- ====================================================================
-- SECTION E: SUBSCRIPTION COUNTERS (Single Source of Truth)
-- ====================================================================

-- CANONICAL: Total subscriptions by status
SELECT 
  status,
  COUNT(*) as count
FROM company_subscriptions
GROUP BY status
ORDER BY status;

-- CANONICAL: Active subscriptions (revenue-generating)
SELECT COUNT(*) as active_subscriptions 
FROM company_subscriptions 
WHERE status IN ('active', 'trialing');

-- CANONICAL: Subscriptions needing attention (past_due, overdue)
SELECT COUNT(*) as at_risk_subscriptions 
FROM company_subscriptions 
WHERE status IN ('past_due', 'overdue');

-- CANONICAL: Canceled subscriptions
SELECT COUNT(*) as canceled_subscriptions 
FROM company_subscriptions 
WHERE status = 'canceled';

-- ====================================================================
-- SECTION F: BILLING COUNTERS (Single Source of Truth)
-- ====================================================================

-- CANONICAL: Total invoices
SELECT COUNT(*) as total_invoices 
FROM billing_invoices;

-- CANONICAL: Invoices by status (payment pipeline)
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount_due
FROM billing_invoices
GROUP BY status
ORDER BY status;

-- CANONICAL: Outstanding invoices (overdue, unpaid)
SELECT COUNT(*) as outstanding_invoices 
FROM billing_invoices 
WHERE status IN ('issued', 'past_due', 'overdue');

-- CANONICAL: Total revenue collected (paid invoices)
SELECT 
  COUNT(*) as paid_invoices,
  COALESCE(SUM(total_amount), 0) as total_collected
FROM billing_invoices 
WHERE status = 'paid';

-- ====================================================================
-- SECTION G: RECONCILIATION CHECKS (Verify consistency)
-- ====================================================================

-- CHECK 1: Verify users count matches admin summary
-- Expected: SELECT count FROM admin_company_stats WHERE company_id = ...
-- Actual:
SELECT 
  company_id,
  COUNT(*) as actual_user_count
FROM users
GROUP BY company_id;

-- CHECK 2: Verify mills count matches company stats
-- Expected: Each company should report accurate mill count
-- Actual:
SELECT 
  c.id, c.name,
  (SELECT COUNT(*) FROM mills WHERE company_id = c.id AND deleted_at IS NULL) as actual_mills,
  c.mills_count as reported_mills,
  (SELECT COUNT(*) FROM mills WHERE company_id = c.id AND deleted_at IS NULL) 
    - c.mills_count as discrepancy
FROM companies c
WHERE c.status != 'archived'
HAVING (SELECT COUNT(*) FROM mills WHERE company_id = c.id AND deleted_at IS NULL) 
  != c.mills_count;

-- CHECK 3: Verify subscription count matches company active subscriptions
SELECT 
  c.id, c.name,
  COUNT(cs.id) as active_subscriptions
FROM companies c
LEFT JOIN company_subscriptions cs ON c.id = cs.company_id 
  AND cs.status IN ('active', 'trialing')
GROUP BY c.id, c.name
HAVING COUNT(cs.id) > 0;

-- CHECK 4: Verify invoice amounts match subscription billing
SELECT 
  cs.id as subscription_id,
  cs.plan_type,
  COUNT(bi.id) as invoice_count,
  COALESCE(SUM(bi.total_amount), 0) as total_invoiced,
  (cs.monthly_amount * (EXTRACT(MONTH FROM NOW()) - EXTRACT(MONTH FROM cs.created_at))) as expected_amount
FROM company_subscriptions cs
LEFT JOIN billing_invoices bi ON cs.id = bi.subscription_id
WHERE cs.status IN ('active', 'past_due')
GROUP BY cs.id, cs.plan_type, cs.monthly_amount, cs.created_at
ORDER BY total_invoiced DESC;

-- ====================================================================
-- SECTION H: AUDIT TRAIL COUNTERS
-- ====================================================================

-- Audit events by action type
SELECT 
  action,
  COUNT(*) as count
FROM audit_logs
GROUP BY action
ORDER BY count DESC
LIMIT 20;

-- Audit events per company
SELECT 
  company_id,
  COUNT(*) as audit_count
FROM audit_logs
GROUP BY company_id
ORDER BY audit_count DESC;

-- Recent audit events (last 7 days)
SELECT 
  action,
  COUNT(*) as count
FROM audit_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY action
ORDER BY count DESC;

-- ====================================================================
-- SECTION I: DASHBOARD KPI AGGREGATIONS
-- ====================================================================

-- DASHBOARD: Admin Summary (all metrics in one query)
SELECT 
  (SELECT COUNT(*) FROM companies) as total_companies,
  (SELECT COUNT(*) FROM companies WHERE status = 'active') as active_companies,
  (SELECT COUNT(*) FROM mills WHERE deleted_at IS NULL) as total_mills,
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
  (SELECT COUNT(*) FROM company_subscriptions WHERE status IN ('active', 'trialing')) as active_subscriptions,
  (SELECT COUNT(*) FROM billing_invoices WHERE status IN ('issued', 'past_due', 'overdue')) as outstanding_invoices,
  (SELECT COALESCE(SUM(total_amount), 0) FROM billing_invoices WHERE status = 'paid') as total_revenue;

-- DASHBOARD: Companies at Risk
SELECT 
  c.id, c.name,
  cs.status,
  CASE 
    WHEN cs.status = 'past_due' THEN 'Payment Overdue'
    WHEN c.status = 'suspended' THEN 'Suspended'
    WHEN c.status = 'archived' THEN 'Archived'
    ELSE 'Active'
  END as risk_level
FROM companies c
LEFT JOIN company_subscriptions cs ON c.id = cs.company_id
WHERE c.status IN ('suspended', 'archived')
  OR cs.status IN ('past_due', 'overdue');

-- DASHBOARD: Top companies by user count
SELECT 
  c.id, c.name,
  COUNT(u.id) as user_count,
  COUNT(m.id) as mill_count,
  cs.plan_type
FROM companies c
LEFT JOIN users u ON c.id = u.company_id
LEFT JOIN mills m ON c.id = m.company_id AND m.deleted_at IS NULL
LEFT JOIN company_subscriptions cs ON c.id = cs.company_id
WHERE c.status = 'active'
GROUP BY c.id, c.name, cs.plan_type
ORDER BY user_count DESC
LIMIT 20;

-- ====================================================================
-- SECTION J: DATA QUALITY REPORT
-- ====================================================================

-- Summary of data health
SELECT 
  'Total Companies' as metric,
  COUNT(*) as value,
  '✓' as status
FROM companies
UNION ALL
SELECT 'Active Companies', COUNT(*), '✓'
FROM companies WHERE status = 'active'
UNION ALL
SELECT 'Total Users', COUNT(*), '✓'
FROM users
UNION ALL
SELECT 'Active Users', COUNT(*), '✓'
FROM users WHERE is_active = true
UNION ALL
SELECT 'Total Mills', COUNT(*), '✓'
FROM mills WHERE deleted_at IS NULL
UNION ALL
SELECT 'Total Employees', COUNT(*), '✓'
FROM hr_employees WHERE deleted_at IS NULL
UNION ALL
SELECT 'Active Subscriptions', COUNT(*), '✓'
FROM company_subscriptions WHERE status IN ('active', 'trialing')
UNION ALL
SELECT 'Outstanding Invoices', COUNT(*), 
  CASE WHEN COUNT(*) > 0 THEN '⚠' ELSE '✓' END
FROM billing_invoices WHERE status IN ('issued', 'past_due', 'overdue')
ORDER BY metric;

-- ====================================================================
-- SECTION K: DELTA REPORTS (Month-over-month)
-- ====================================================================

-- Companies added this month
SELECT COUNT(*) as new_companies_this_month
FROM companies
WHERE created_at >= DATE_TRUNC('month', NOW());

-- Users added this month
SELECT COUNT(*) as new_users_this_month
FROM users
WHERE created_at >= DATE_TRUNC('month', NOW());

-- Employees added this month
SELECT COUNT(*) as new_employees_this_month
FROM hr_employees
WHERE created_at >= DATE_TRUNC('month', NOW());

-- Revenue collected this month
SELECT 
  COALESCE(SUM(total_amount), 0) as revenue_this_month
FROM billing_invoices
WHERE status = 'paid'
  AND paid_at >= DATE_TRUNC('month', NOW());

-- ====================================================================
-- NOTES FOR DEVELOPERS
-- ====================================================================

/*
These queries are the SINGLE SOURCE OF TRUTH for all dashboard numbers.

DO NOT:
- Hard-code counters in the frontend
- Use multiple different queries in different files
- Cache numbers longer than 1 hour
- Show cached numbers without last-update timestamp

DO:
- Call /api/admin/dashboard-summary once per page load
- Cache response in TanStack Query with 1-hour gcTime
- Display "Last updated: X seconds ago"
- Refresh on demand (button)

If numbers don't match:
1. Run these SQL queries directly
2. Compare with API response
3. Check query cache staleness
4. Check database transaction isolation (READ UNCOMMITTED vs READ COMMITTED)

Reconciliation SLA: All counters must match within 5 minutes.
*/

-- ====================================================================
-- END OF COUNTER RECONCILIATION
-- ====================================================================
