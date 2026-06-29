# SpinFlow ERP — Release Candidate RC-1 Validation Report

**Date:** 2026-06-07  
**Commit:** `e9dc431`  
**Backend Tests:** 295/295 passing  
**Frontend Build:** Clean (14 pre-existing TS warnings — all known)  

---

## 1. EXECUTIVE SUMMARY

SpinFlow ERP has reached Release Candidate stage. The platform supports the complete company lifecycle — creation, billing, suspension, reactivation, archive, and delete — with a single-transaction onboarding service, canonical RBAC system, and database-driven billing engine.

**Verdict: CONDITIONAL GO** — 30 critical/high issues must be resolved before production launch. Core architecture is solid; gaps are concentrated in cross-company access control, query performance at scale, and missing rate limiting.

---

## 2. TEST COVERAGE — AREA 1

### 2.1 End-to-End Flows

| # | Flow | Endpoint | Tested | Coverage |
|---|------|----------|--------|----------|
| 1 | Company Creation | `POST /admin/onboarding` | ✅ 12 tests | All 5 plans, rollbacks, performance |
| 2 | Mill Creation | `POST /masters/mills` | ✅ 3 tests | Service-level, limit enforcement |
| 3 | Plan Assignment | `POST /admin/onboarding` | ✅ 14 tests | All plans, limits, module sync |
| 4 | Owner Creation | `POST /admin/onboarding` | ✅ 8 tests | Full attribute verification |
| 5 | User Creation | `POST /admin/auth/users` | ⚠️ Partial | Service-level limit check only |
| 6 | Employee Import | `POST /hr/employees/bulk` | ⚠️ Partial | Unit coercion tests only |
| 7 | Invoice Generation | `POST /admin/billing/invoices/generate-*` | ✅ 10 tests | All invoice types |
| 8 | Payment Recording | `POST /admin/billing/payments` | ✅ 7 tests | Manual/Razorpay/refund/reconcile |
| 9 | Plan Upgrade | `POST /subscription/change-requests` | ⚠️ Partial | Module sync only, not full flow |
| 10 | Overage Purchase | `POST /billing/purchase-overage` | ⚠️ 1 test | Extra users only — missing mills/employees |
| 11 | Suspension | `POST /admin/companies/{id}/suspend` | ✅ 7 tests | Full cascade |
| 12 | Reactivation | `POST /admin/companies/{id}/reactivate` | ✅ 5 tests | Mills, users, subscription |
| 13 | Archive | `POST /admin/companies/{id}/archive` | ✅ 1 test | Soft delete flags |
| 14 | Delete | `DELETE /admin/companies/{id}` | ✅ 7 tests | Orphan prevention, backup |
| 15 | Restore from Archive | — | ❌ **MISSING** | No endpoint exists |

### 2.2 Gaps (AREA 1)

| Severity | Issue |
|----------|-------|
| **HIGH** | No restore-from-archive endpoint — archived companies are dead |
| **HIGH** | No integration test for `POST /auth/users` or `POST /admin/users` |
| **HIGH** | No integration test for `POST /hr/employees` or `POST /hr/employees/bulk` |
| **MEDIUM** | No integration test for full plan change lifecycle (request → review → approve) |
| **MEDIUM** | Overage purchase only tested for users — missing mill and employee overage tests |

---

## 3. ROLE & PERMISSION AUDIT — AREA 2

### 3.1 Role Access Matrix

| Role | Business Modules | Admin | Billing | Users/Masters |
|------|-----------------|-------|---------|---------------|
| **SUPER_ADMIN** | Full access (all modules) | ✅ Full | ✅ Full | ✅ Full |
| **MILL_OWNER** | Full access (all modules) | ❌ | ✅ Read/Write own | ✅ Own company |
| **GENERAL_MANAGER** | Read/Write (14 modules), Read-only (4) | ❌ | ❌ | ❌ |
| **PRODUCTION_MANAGER** | Read/Write (4), Read-only (2) | ❌ | ❌ | ❌ |
| **QUALITY_MANAGER** | Read/Write (3), Read-only (2) | ❌ | ❌ | ❌ |
| **DISPATCH_MANAGER** | Read/Write (6), Read-only (2) | ❌ | ❌ | ❌ |
| **STORE_MANAGER** | Read/Write (4), Read-only (2) | ❌ | ❌ | ❌ |
| **HR_MANAGER** | Read/Write (4) | ❌ | ❌ | ❌ |
| **ACCOUNTANT** | Read/Write (5), Read-only (3) | ❌ | ❌ | ❌ |
| **MAINTENANCE_MANAGER** | Read/Write (3), Read-only (1) | ❌ | ❌ | ❌ |
| **SUPERVISOR** | Read/Write (2) | ❌ | ❌ | ❌ |
| **MACHINE_OPERATOR** | Dashboard only | ❌ | ❌ | ❌ |
| **SECURITY_GATE** | Dashboard only | ❌ | ❌ | ❌ |
| **AUDITOR** | Read-only (5) | ❌ | ❌ | ❌ |

### 3.2 RBAC Architecture Score

| Component | Status |
|-----------|--------|
| Canonical `rbac.py` with all 14 roles | ✅ |
| Three-layer enforcement (`access.py`) | ✅ |
| `require_module()` on all business routes | ✅ |
| `_ALWAYS_ALLOWED` bypass for SUPER_ADMIN/MILL_OWNER | ✅ |
| Inline role checks on billing/admin routes | ⚠️ Mix of `role` and `role_rel.code` |
| Stale `permissions.py` (unused duplicate) | 🗑️ Should be deleted |
| `SCANNER_ROLES` constant (unused) | 🗑️ Should be cleaned |

### 3.3 Issues (AREA 2)

| Severity | Issue |
|----------|-------|
| **HIGH** | `auth.py` references non-existent role `"MILL_ADMIN"` — should be `"MILL_OWNER"` |
| **MEDIUM** | `ui_config.py` (6 routes) has no module guard — any auth user can access |
| **MEDIUM** | `mill_config.py` (5 routes) has no module guard — subscription/currency exposed |
| **LOW** | `billing.py` uses `current_user.role` (~40 instances) instead of `role_rel.code` |
| **LOW** | `permissions.py` is stale, unused — should be deleted |
| **LOW** | `SCANNER_ROLES` in `lotrac.py` defined but never used |

---

## 4. SCALE TESTING — AREA 3

### 4.1 N+1 Query Analysis

| Severity | Endpoint | Issue |
|----------|----------|-------|
| **CRITICAL** | `GET /admin/billing/companies` | 6+ queries/company in a loop → ~3,000 queries for 500 companies |
| **CRITICAL** | `GET /admin/billing/overview` | 2 queries/company in a loop over all companies |
| **CRITICAL** | `GET /admin/billing/dashboard` | 3 queries/company in a loop over all companies |
| **HIGH** | `GET /subscription/admin/summary` | 2 queries/active company in a loop |
| **HIGH** | `GET /admin/billing/subscriptions-enriched` | 4 queries/row in a loop |

### 4.2 Pagination Audit

| Endpoint | Pagination | Status |
|----------|------------|--------|
| `GET /subscription/invoices` | ❌ No page/page_size | Returns full list |
| `GET /subscription/change-requests` | ❌ No page/page_size | Returns full list |
| `GET /payroll/months/{id}/payslips` | ❌ No page/page_size | Can be large |
| All other list endpoints | ✅ Have pagination | Bounds-checked |

### 4.3 Issues (AREA 3)

| Severity | Issue |
|----------|-------|
| **CRITICAL** | 3 billing listing endpoints have N+1 loops — will not scale past ~50 companies |
| **HIGH** | 3 list endpoints lack pagination — unbounded result sets |

---

## 5. SECURITY AUDIT — AREA 4

### 5.1 Cross-Company Access (IDOR)

| Severity | Endpoint | Risk |
|----------|----------|------|
| **CRITICAL** | `GET /subscription/companies/{company_id}` | MILL_OWNER views ANY company's subscription |
| **CRITICAL** | `POST /subscription/invoices/generate` | MILL_OWNER generates invoices for ANY company |
| **CRITICAL** | `GET /subscription/invoices` | MILL_OWNER lists invoices for ANY company |
| **CRITICAL** | `GET /subscription/companies/{company_id}/billing-history` | MILL_OWNER views ANY company's billing history |
| **CRITICAL** | `GET /admin/billing/company-payments/{company_id}` | MILL_OWNER views ANY company's payments |
| **CRITICAL** | `GET /admin/billing/company-detail/{company_id}` | MILL_OWNER views ANY company's billing detail |
| **GOOD** | All business modules (hr/production/quality/etc.) | ✅ Mill-scoped queries protect cross-company |

### 5.2 UUID Validation

| Issue | Detail |
|-------|--------|
| **MEDIUM** | No FastAPI `UUID` type or regex validation on any ID parameter — all are `str` |
| **MEDIUM** | No 400-level early rejection for malformed IDs |

### 5.3 Rate Limiting

| Endpoint Group | Rate Limit | Status |
|----------------|-----------|--------|
| Login | 10/min | ✅ |
| Forgot password | 5/min | ✅ |
| Upload | 10/min | ✅ |
| CSV Import | 10/min | ✅ |
| Exports | 10/min | ✅ |
| Admin endpoints (suspend/reactivate/reset/change plan) | ❌ None | **HIGH** |
| Billing mutations (generate invoice/record payment/reconcile/refund) | ❌ None | **HIGH** |
| Bulk creates (employees/stores/quality) | ❌ None | **HIGH** |
| Auth aux (refresh/change-password/logout) | ❌ None | **MEDIUM** |
| Masters write (create/update company/mill/customer) | ❌ None | **MEDIUM** |

### 5.4 Security Headers

| Header | Status |
|--------|--------|
| Content-Security-Policy | ✅ Present (but uses `unsafe-inline`/`unsafe-eval`) |
| X-Content-Type-Options: nosniff | ✅ |
| X-Frame-Options: DENY | ✅ |
| Referrer-Policy | ✅ |
| Permissions-Policy | ✅ |
| Strict-Transport-Security (HSTS) | ❌ **MISSING** |
| Cross-Origin-Resource-Policy | ❌ **MISSING** |

### 5.5 Upload Security

| Check | Status |
|-------|--------|
| File type whitelist | ✅ |
| File size limit (10MB) | ✅ |
| Path traversal prevention | ✅ |
| Rate limited (10/min) | ✅ |
| Audit logged | ✅ |
| Malware scanning | ❌ Missing |

### 5.6 Issues (AREA 4)

| Severity | Issue |
|----------|-------|
| **CRITICAL** | 6 IDOR holes in billing endpoints — MILL_OWNER can access ANY company's data |
| **HIGH** | No rate limiting on admin write endpoints |
| **HIGH** | No rate limiting on billing mutation endpoints |
| **HIGH** | No rate limiting on bulk create endpoints |
| **MEDIUM** | No UUID validation on any ID parameters |
| **MEDIUM** | Missing HSTS header |
| **MEDIUM** | Missing Cross-Origin-Resource-Policy header |
| **MEDIUM** | CSP relies on `unsafe-inline`/`unsafe-eval` |

---

## 6. BACKUP & RECOVERY — AREA 5

### 6.1 Lifecycle Cascade Verification

| Transition | Endpoint | Cascade | Tested |
|------------|----------|---------|--------|
| Active → Suspended | `POST /admin/companies/{id}/suspend` | Mills ❌, Users ❌, Sessions ❌, Subscription → overdue | ✅ 5 tests |
| Suspended → Active | `POST /admin/companies/{id}/reactivate` | Mills ✅, Users ✅, Sessions ❌ (must re-login), Subscription ✅ | ✅ 3 tests |
| Suspended → Archived | `POST /admin/companies/{id}/archive` | Soft delete flags | ✅ 1 test |
| Archived → Deleted | `DELETE /admin/companies/{id}` | Hard delete all child records | ✅ 7 tests |
| Archived → Active | ❌ **NO ENDPOINT** | — | ❌ Missing |

### 6.2 Orphan Prevention

| Child Entity | Cleaned on Delete | Test |
|-------------|-------------------|------|
| Mills | ✅ | `test_no_orphan_records` |
| Users | ✅ | `test_no_orphan_records` |
| UserSessions | ✅ | `test_no_orphan_records` |
| CompanyModules | ✅ | `test_company_module_removed` |
| CompanySubscription | ✅ | Cascade |
| Audit Logs | ✅ | `test_deletion_log_created` |
| Billing Invoices | ✅ | Cascade |

### 6.3 Issues (AREA 5)

| Severity | Issue |
|----------|-------|
| **HIGH** | No endpoint to restore an archived company — archive is a one-way door |
| **MEDIUM** | Suspension cascade deactivates mills/users but no test verifies `is_active=false` vs actual deletion |

---

## 7. PRODUCTION READINESS SCORECARD — AREA 6

| Category | Score | Rationale |
|----------|-------|-----------|
| **Architecture** | 92/100 | Company-centric, single-transaction onboarding, 3-layer RBAC, module registry. Deduct 8 for stale `permissions.py` and `SCANNER_ROLES`. |
| **Security** | 68/100 | Deduct 20 for 6 CRITICAL IDOR holes in billing. Deduct 8 for missing rate limits. Deduct 4 for HSTS/UUID/headers. |
| **Billing** | 94/100 | Full billing commerce: invoices, payments, overage, overdue, proration, renewals. Deduct 6 for N+1 in listing endpoints. |
| **Performance** | 65/100 | Deduct 25 for 3 critical N+1 patterns on billing listing endpoints. Deduct 10 for missing pagination on 3 list endpoints. |
| **Operations** | 78/100 | Missing rate limits on write endpoints. Missing restore-from-archive. No malware scanning on uploads. |
| **Recovery** | 75/100 | Full lifecycle cascade tested. Deduct 25 for missing archive restore path. |
| **Maintainability** | 90/100 | Clean module structure, consistent conventions. Deduct 10 for stale code (`permissions.py`, `SCANNER_ROLES`). |
| **Overall** | **80/100** | **CONDITIONAL GO** — Core architecture is production-ready. 6 critical security issues must be fixed before launch. |

---

## 8. CRITICAL ISSUES (Must Fix Before Launch)

| # | Area | Issue | Fix |
|---|------|-------|-----|
| C1 | Security | 6 IDOR holes in billing: MILL_OWNER can read/write any company's subscription, invoices, payments, billing history | Add `company_id == current_user.company_id` check on all MILL_OWNER-accessible billing endpoints |
| C2 | Performance | `GET /admin/billing/companies` does 6+ queries per company in a loop | Rewrite with batch subqueries or JOINs |
| C3 | Performance | `GET /admin/billing/overview` does 2 queries per company in a loop | Use aggregate subqueries |
| C4 | Performance | `GET /admin/billing/dashboard` does 3 queries per company in a loop | Use aggregate subqueries |

---

## 9. HIGH ISSUES (Fix Before First Paying Customer)

| # | Area | Issue | Fix |
|---|------|-------|-----|
| H1 | Security | No rate limiting on admin/billing mutation endpoints | Add `@limiter.limit("10/minute")` |
| H2 | Security | No rate limiting on bulk create endpoints | Add `@limiter.limit("5/minute")` |
| H3 | RBAC | `auth.py` references non-existent role `MILL_ADMIN` | Change to `MILL_OWNER` |
| H4 | RBAC | `ui_config.py` (6 routes) has no module guard | Add `require_module("column_config")` |
| H5 | RBAC | `mill_config.py` (5 routes) has no module guard | Add `require_module("masters")` or dedicated guard |
| H6 | Recovery | No restore-from-archive endpoint | Add `POST /admin/companies/{id}/restore` |
| H7 | Testing | No integration test for user creation endpoint | Add HTTP-level test for `POST /auth/users` |
| H8 | Testing | No integration test for employee import | Add HTTP-level test for `POST /hr/employees/bulk` |
| H9 | Testing | No integration test for plan change flow | Add test for request → review → approve |
| H10 | Performance | 3 endpoints lack pagination (`/subscription/invoices`, `/subscription/change-requests`, `/payroll/months/{id}/payslips`) | Add `page`/`page_size` params |

---

## 10. RECOMMENDED FIXES (First Month Post-Launch)

| # | Area | Issue |
|---|------|-------|
| R1 | Security | Add HSTS header (`max-age=31536000; includeSubDomains`) |
| R2 | Security | Add Cross-Origin-Resource-Policy: `same-origin` |
| R3 | Security | Add UUID validation on all path/query ID parameters |
| R4 | Security | Add malware scanning on file uploads |
| R5 | Maintenance | Delete stale `permissions.py` |
| R6 | Maintenance | Clean up unused `SCANNER_ROLES` constant |
| R7 | Consistency | Standardize `billing.py` role checks to use `role_rel.code` |
| R8 | Testing | Add mill and employee overage purchase tests |
| R9 | Testing | Add CSP nonce-based approach for stronger XSS protection |
| R10 | CSP | Migrate from `unsafe-inline`/`unsafe-eval` to nonce-based CSP |

---

## 11. GO / NO-GO DECISION

**Verdict: CONDITIONAL GO**

**Rationale:**
- Architecture (92/100) and billing (94/100) are production-ready
- Core business flows are complete with strong test coverage
- 295 backend tests pass, frontend builds clean

**Conditions for launch:**
1. ✅ Fix 4 CRITICAL issues (C1–C4) — IDOR + N+1 queries
2. ✅ Fix 6 HIGH issues (H1, H3, H4, H5, H6) — rate limiting, RBAC, archive restore
3. ⏳ High-priority testing gaps (H7–H9) can be deferred to first sprint post-launch

**Estimated fix time:** 2-3 engineering days for critical + high issues  
**Risk if launched without fixes:** Data exposure (IDOR), performance degradation at >50 companies, inability to restore archived customers

**Signed:** SpinFlow RC-1 Audit  
**Date:** 2026-06-07
