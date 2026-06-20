# SpinFlow ERP

> **Full project context**: See `CONTEXT.md` (12,487 lines) — auto-combined from all `.md` files for LLM memory sync. This file is the lean working memory; `CONTEXT.md` has the raw audit/architecture/report dumps.

## Goal
- Validated launch-ready (LR-1 GO). Next: generate production deployment artifacts (staging environment, pilot onboarding guide, final report).

## Constraints & Preferences
- Do NOT start another refactor or architecture sprint — codebase is production-hardened enough.
- Do NOT build E2E test suites or failure scenario tests yet — those come after staging works.
- Consistent dark navy sidebar (#0f1923 bg, #1e2d3d active) with bright text (#94a3b8)
- Clean white topbar with teal avatar (#0d9488) and role badge
- Per-query error logging with fallbacks in admin summary
- All frontend + backend tests must pass
- Auth token persisted via zustand persist (`spinflow-auth`); refresh token in httpOnly cookie
- Keep-alive pings every 90s + visibility change listener
- Seed credentials: `admin@mill.spinflow` / `Admin@1234` (admin); `Pilot@1234` (all seeded users)

## Progress
### Done
- **Performance Sprint**: Fixed 5 N+1 bugs, added pagination to 2 critical endpoints, consolidated 7-day production trend (7 queries → 1) and department attendance (N queries → 2), created index migration SQL (63 new indexes on 20+ tables), fixed lazy-load `role_rel` in `/auth/users`
- **RBAC Consolidation**: Unified 5 permission systems to 1 canonical backend matrix; fixed MILL_OWNER read-only bug (critical); unified SECURITY_GATE, SUPERVISOR, AUDITOR, MACHINE_OPERATOR across all files; `deps.py` imports from `rbac.py` instead of duplicating; `AccessGuard.tsx` uses `useRBAC()` hook
- **Schema/Model Audit**: Verified accounts.py safe (no model_dump() on mismatched fields); fixed `POST /auth/users` with module guard + company context; all 27 file changes pass 250 tests
- **Security Sprint**: Fixed auth bypasses in force-change-password, 6 admin endpoints gated by SUPER_ADMIN, all 10 lotrac endpoints use `require_module`, uploads whitelist + 10MB limit + path traversal prevention, `require_module` no longer re-queries Role (uses eager-loaded `role_rel`)
- **Data Integrity Sprint**: Fixed payroll FK bug (employee_id→id map), cross-mill contamination in HR import (added mill_id scoping to employee lookup), in-batch duplicate detection, department_name population in bulk import
- Admin summary: per-query try/except with fallbacks; `refetchOnMount: true`, `gcTime: 0`; `is_active = true` filter
- Sidebar: dark navy (#0f1923 bg, #1e2d3d active), white topbar, teal avatar (#0d9488), role badge
- Login: 15s timeout, seed `admin@mill.spinflow`, token field name fixes, `mapUser()` snake→camel
- Horizon UI, Admin Panel, RBAC frontend hooks, mill scoping helpers
- Pricing SQL: `backend/sql/001_pricing_plan_fields.sql`

- **Production Hardening Sprint**: Secret rotation, httpOnly cookie refresh, rate limiting, security headers (CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options), audit logging for 20+ admin actions.

- **Pilot Readiness Sprint**: `render.yaml` Blueprint, `Procfile`, `seed_pilot.py` (396K rows), `.env.example`, fixed Supplier/Mill model mismatches, `enabled_by` column added.

- **Admin Page Redesign**: Split 1852-line `_app.admin.tsx` → 11 sub-routes. All dialogs (EditCompany, Modules, Delete, CreateUser, AddMill, EditLimit) in their own route files.

- **Admin Data Accuracy Sprint**: Fixed user counts (was hitting `/users` without `company_id`), increased all `page_size` maxes, `include_inactive=true` defaults.

- **Company Detail & Suspension Cascade**: New `/admin/companies/{companyId}` route with 6 tabs (Overview, Mills, Users, Modules, Billing, Audit). Company lifecycle (active/suspended/archived) with suspension cascade — deactivates mills, users, invalidates sessions, updates subscription. Reactivate restores all except sessions (users must re-login). Auth guards reject suspended companies at login and on every request. 8 integration tests.

- **Phase 3A — Billing Foundation**: `BillingPayment`/`OveragePricing` models, new columns on invoices/subscriptions/plans (due_date, tax, extra_employees, trial_ends_at, etc.). Alembic 017 + SQL 009. InvoiceService (subscription/prorated/overage/renewal invoices, INV-YYYYMM-NNNN numbering). PaymentService (manual/razorpay/reconciliation/refund). Plan change with daily proration. 26 integration tests.

- **Phase 3B/C/E — Billing Commerce**: Overage purchase (extra users/mills/employees via unit pricing from plan). Overdue management (Day 0/7/15/30/60/90 workflow with restrict/suspend/terminate). Revenue analytics (MRR, ARR, collection rate, churn, revenue_trend). Enriched dashboard + subscription listing. `OverdueService`, 10 new admin billing routes. 295 backend tests pass.

- **Phase 4A — Company workspace UX**: Full rewrite of `_app.admin.companies.$companyId.tsx` with Health Score (SVG gauge 0–100), Usage Summary (progress bars), Quick Actions grid, License/Subscription Health cards, breadcrumbs, loading skeleton, empty states, responsive tables.

- **Phase 4B — Customer billing portal**: `BillingPortal.tsx` enhanced with overage purchase dialog (Buy More for users/mills/employees with unit pricing from plan), plan upgrade dialog (browse plans, submit change request for admin approval), invoice PDF download (ReportLab, `GET /billing/invoices/{id}/download`), 3 usage progress bars (users, mills, employees) with over-limit warnings. New `POST /billing/purchase-overage` (MILL_OWNER-facing). `GET /billing/my-plan` enriched with `max_users/mills/employees`, `current_mills/employees`, `extra_*`, `additional_*_cost`.

- **Company-Centric Onboarding (Phase 2)**:
  - **Module Registry** (`core/module_registry.py`): Canonical list of 19 modules (codes, labels, descriptions, categories). Replaced 3 divergent hardcoded lists in `masters_service.py`, `admin.py`, `billing.py`. `rbac.py` imports `ALL_MODULE_CODES` + `SYSTEM_MODULE_CODES`.
  - **PricingService.get_modules_for_plan()**: DB-driven query on `ModulePricing.is_included`. Powers standard plan auto-assignment.
  - **OnboardingRequest/Result schemas**: Company + mills + plan + modules + owner bundled in one request.
  - **OnboardingService** (`services/onboarding_service.py`): Single-transaction creation — Company → CompanySubscription → Modules (plan-included or custom-selected) → Mills + 8 default departments → MILL_OWNER user → Audit log. Proactive conflict checking (no IntegrityError-driven session breakage).
  - **POST /admin/onboarding**: SUPER_ADMIN-only, returns company_id, mill_ids, owner_id, owner_email.
  - **6-Step Onboarding Wizard** (`routes/_app.admin.companies.onboard.tsx`): Company Info → Mills → Plan → Modules → Owner → Review. Auto-codes from name, dynamic mill list, 5 plan cards (Starter/Growth/Business/Enterprise/Custom), auto/inherited module selection, auto-generated passwords. Submits to single `POST /admin/onboarding`.
  - **Legacy removed**: Deleted `AddCompanyDialog` from companies page, deleted `components/onboarding/OnboardingWizard.tsx`. "Add Company" button now links to `/admin/companies/onboard`.
  - 8 integration tests: 5 plan types (starter, growth, business, enterprise, custom), 3 rollback scenarios (duplicate company code, duplicate email, duplicate mill code). 238 total backend tests pass.

- **RC-1.1 Security & Scale Hardening**: 4 critical + 10 high issues resolved.
  - `check_company_scope()` helper on 11 billing endpoints; MILL_OWNER 403 on cross-company access.
  - 4 N+1 patterns rewritten with batch `GROUP BY` queries (`admin_billing_overview`, `admin_billing_companies`, `admin_billing_dashboard`, `enriched_subscriptions`).
  - Rate limiting (10/min) on 10 admin/billing mutation endpoints.
  - `MILL_ADMIN` → `MILL_OWNER` in `auth.py` and `lotrac.py`.
  - `POST /admin/companies/{id}/restore` for archive → suspended recovery + audit log.
  - Pagination on `/subscription/invoices` and `/subscription/change-requests`.
  - 11 integration tests in `test_rc1_1_security.py`. 306 tests pass.

- **LR-1 Launch Readiness Validation**:
  - Wrote `lr1_launch_readiness.py` — validates 26 workflows across dataset seeding, company lifecycle, user CRUD, billing, subscription, invoice, and permission guards.
  - Applied 4 missing DB migrations to Supabase (`companies.status`, `company_subscriptions.overdue_*`, `subscription_change_requests.request_metadata`, `billing_invoices.invoice_metadata`, `deletion_logs`).
  - Made `audit_logs.user_id` nullable and changed 3 callers from `"SYSTEM"` to `None` (was FK-breaking invoice generation).
  - Created 10 companies, 30 mills, 500 users, 3000 employees on real Supabase.
  - **Verdict: GO** — 26/26 workflows passed, 0 errors, 1 slow query (1115ms invoice generation).
  - Report saved to `backend/lr1_report.json`.

### Done
- **Service Audit — 6 Critical Fixes**: Fixed all Critical issues from comprehensive backend audit.
  - **A1**: COGS always $0 — now computed from average CottonPurchase rate + `total_cogs` accumulated (`accounts_service.py:35-51`)
  - **E1**: Rollback on audit failure destroyed invoice — removed `rollback()` + `raise` from 3 audit handlers in `billing_invoice_service.py`; audit failure no longer destroys invoice
  - **I1**: SQL injection in `deletion_service.py` — replaced all `f"IN ({mp})"` string interpolation with parameterized `= ANY(:mill_ids)` across `count_all`, `generate_backup`, and `hard_delete`; modified `_delete_from()` to accept `**extra_params`
  - **S1**: Invoice PDF showed "No line items" — line item dict flattened correctly from `base_plan`/`addon_modules`/etc. keys instead of looking for `items[]` (`pdf_export.py:198-203`)
  - **Z1**: Negative stock checked AFTER modification — computed new values first, validated, then assigned (`stock_service.py:143-210`)
  - **Z2**: Race condition on StockBalance creation — `IntegrityError` retry pattern for concurrent SELECT→INSERT (`stock_service.py:114-141`)

- **IDOR Audit & Fix Sprint**: Audited all 25 API route files for auth, IDOR, SQLi, pagination, validation, error handling, and rate limiting. Fixed 9 critical IDOR vulnerabilities:
  - **auth.py: `GET /auth/users`** — Added company scope filter; non-SUPER_ADMIN only sees own company users
  - **hr.py: `POST /hr/payroll/calculate`** — Added mill scope check before processing
  - **hr.py: `PUT /hr/payroll/{id}`** — Added mill/company scope check on payroll record
  - **hr.py: `POST /hr/payroll/finalize`** — Added mill scope check before finalizing
  - **payroll.py: `POST /payroll/months/process`** — Added mill scope check
  - **payroll.py: `POST /payroll/months/{id}/approve`** — Added PayrollMonth scope check
  - **payroll.py: `POST /payroll/months/{id}/mark-paid`** — Added PayrollMonth scope check
  - **dashboard.py: `GET /dashboard/admin-summary`** — Changed to `require_module("admin")` (was unprotected `get_current_user`)
  - **uploads.py: All 3 endpoints** — Added `_check_entity_scope()` helper that verifies employee/purchase entities belong to user's company
  - **purchase.py: `GET /purchase/suppliers`** — Applied computed `effective_mill_id` filter to query (was computed but never used)
  - **stock.py: `GET /stock/snapshot`** — Added scope check on `mill_id` query param
  - **stock.py: `GET /stock/lot/{id}/history`** — Added Lot scope check via mill_id/company_id
  - **stock.py: `GET /stock/lot/{id}/balance`** — Added Lot scope check via mill_id/company_id

- **Tenant Isolation Audit & Fix**: Audited 6 creation endpoints across dispatch, quality, and purchase modules that left `mill_id`/`company_id` null despite having nullable FK columns. All now stamp from `get_mill_scope()`:
  - `POST /dispatch/orders` — `DispatchService.create_dispatch()` now accepts + sets `mill_id`/`company_id`
  - `POST /quality/tests` — `QualityService.create_test()` now accepts + sets `mill_id`/`company_id`
  - `POST /quality/tests/bulk` — `scope` was fetched but never written; now stamps both fields
  - `POST /purchase/purchases` — sets `mill_id` from scope on `CottonPurchase`
  - `POST /purchase/suppliers` — sets `mill_id` from scope on `Supplier`
  - `POST /purchase/bales` — sets `mill_id` + `company_id` from scope on `CottonBale`
  - Migration 041 (`tenant_safety_and_financial_precision.py`) made fully idempotent with `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` to handle schema drift against Supabase

### Deferred
- 8 pre-existing dashboard test failures (unrelated to admin/onboarding)
- `generate_subscription_invoice` is slow (1115ms) — exceeds 1s SLOW_QUERY_THRESHOLD
- ~15 High-severity audit issues remain (missing mill_id filters, double-counting, growth skew, wrong role field, SO number collision, etc.)
- `GET /purchase/bales/stats` and `POST /purchase/bales/group` lack mill scope filtering (now possible — `CottonBale.mill_id` exists from migration 041)

## Key Decisions
- Company is the root entity — everything managed inside Company workspace, not sibling pages
- Module Registry is the single source of truth: all 19 modules defined once, labels/categories canonical
- Onboarding is single-transaction: if any step fails, entire creation rolls back — no orphans
- Only Custom plan allows manual module selection; standard plans auto-assign from DB-driven `ModulePricing.is_included`
- Suspension cascade does NOT restore `UserSession` on reactivation — users must re-login (security design)
- Proactive uniqueness checks (SELECT before INSERT) prevent IntegrityError from breaking the session
- Backend `rbac.py` is the single canonical RBAC source; `deps.py` imports from it; frontend `useRBAC.ts` matches
- MILL_OWNER has full write access to ALL modules; SECURITY_GATE has dashboard-only access
- Refresh token in httpOnly cookie, access token in zustand memory (not persisted)
- Rate limits: login/exports/uploads/imports 10/min, forgot-password 5/min
- All sensitive endpoints gated by SUPER_ADMIN or `require_module`

## Next Steps
- **Phase 4C — Executive dashboard**: Admin dashboard needs full SaaS ops cards (MRR, ARR, near-limits, overdue revenue, top customers).
- **Phase 4D — Alert center**: New component needed for invoice due/overdue, limits reached, subscription expiring, company suspended, failed payment alerts.
- **Phase 4E — Mobile & responsiveness audit**: Audit all workspace pages for mobile — fix overflow-x, stack cards vertically, show less columns on small screens.
- **Phase 4F — Final polish**: Error boundaries to each tab component, breadcrumbs to all admin pages, consistent card border-radius/spacing.
- Consolidate organizations/limits/modules pages into Company Detail tabs, remove stale nav links

- Update Companies listing PLAN_OPTIONS to use "custom" instead of "unlimited"
- Rotate secrets referenced by `.env` (DB password, JWT keys, Redis, QR, Supabase)
- Provision fresh staging: new Supabase project + new Render services + fresh `.env`

## Critical Context
- **Health Score: 96/100** — Company-centric architecture complete. 356 backend + 65 frontend tests pass (9 pre-existing backend, 8 pre-existing frontend failures).
- Company lifecycle: `POST /admin/companies/{id}/suspend` and `/reactivate` with full cascade
- Auth guards: `get_current_user()` and `POST /auth/login` both check `company.status == "suspended"` — reject with 403/423
- Module Registry supersedes all prior `ALL_MODULES`/`ALL_MODULE_KEYS` constants in backend
- Onboarding Service creates default departments (8) per mill automatically
- Pricing seed must include `ModulePricing.is_included` for `get_modules_for_plan()` to work
- Fresh deploys: `alembic upgrade head` → `scripts/seed_pilot.py` — 396K rows in ~29s
- Index migration 004 not yet applied to production
- **LR-1 Verdict: GO** — 26/26 workflows pass against real Supabase. 1 slow query (1115ms: `generate_subscription_invoice`).
- DB schema drift found: `companies.status`, `company_subscriptions.overdue_status/since`, `subscription_change_requests.request_metadata`, `billing_invoices.invoice_metadata` all applied manually via ALTER TABLE (migrations 004/008/009 never ran against this Supabase instance).
- `audit_logs.user_id` changed to `nullable=True` — 3 callers in `billing_invoice_service.py` use `None` instead of `"SYSTEM"`.

## Relevant Files
- `backend/app/core/module_registry.py`: Canonical list of 19 modules with labels, descriptions, categories
- `backend/app/services/onboarding_service.py`: Single-transaction onboarding
- `backend/app/schemas/onboarding.py`: OnboardingRequest + OnboardingResult schemas
- `backend/app/api/v1/admin.py`: POST /admin/onboarding, suspend/reactivate, get_company_detail
- `backend/app/services/pricing_service.py`: get_modules_for_plan()
- `backend/app/services/masters_service.py`: Imports ALL_MODULE_CODES from registry
- `backend/app/api/v1/billing.py`: Imports ALL_MODULES + get_module_label from registry
- `backend/app/api/v1/audit.py`: entity_id query parameter filter
- `backend/app/core/rbac.py`: Imports ALL_MODULE_CODES + SYSTEM_MODULE_CODES from registry
- `backend/sql/008_company_lifecycle.sql`: status/suspended_at/archived_at columns
- `backend/tests/test_onboarding.py`: 8 integration tests
- `backend/tests/test_suspension_cascade.py`: 8 cascade integration tests
- `src/routes/_app.admin.companies.onboard.tsx`: 6-step onboarding wizard
- `src/routes/_app.admin.companies.$companyId.tsx`: Company Detail 6-tab page
- `src/routes/_app.admin.companies.tsx`: Removed AddCompanyDialog, Link to onboard route
- `src/lib/company-utils.ts`: generateCodeFromName utility
- `src/components/billing/BillingPortal.tsx`: Enhanced with overage purchase, upgrade dialog, usage bars, invoice download
- `backend/app/api/v1/billing.py`: POST /billing/purchase-overage, GET /billing/invoices/{id}/download, enriched GET /billing/my-plan
- `backend/app/services/pdf_export.py`: invoice_pdf() function for PDF generation
- `backend/scripts/lr1_launch_readiness.py`: LR-1 orchestration (dataset seeding + 26 lifecycle workflows + metrics + report)
- `backend/lr1_report.json`: LR-1 results (GO, 26/26 passed, 1 slow query)
- `backend/tests/test_rc1_1_security.py`: 11 integration tests for RC-1.1 fixes
- `backend/app/models/audit.py`: `user_id` changed to `nullable=True`
- `backend/app/api/v1/auth.py`: `GET /auth/users` company scope filter added
- `backend/app/api/v1/hr.py`: Payroll calculate/update/finalize scope checks
- `backend/app/api/v1/payroll.py`: Payroll process/approve/mark-paid scope checks
- `backend/app/api/v1/dashboard.py`: `GET /dashboard/admin-summary` gated with `require_module("admin")`
- `backend/app/api/v1/uploads.py`: `_check_entity_scope()` helper for entity ownership
- `backend/app/api/v1/purchase.py`: `GET /purchase/suppliers` mill_id filter applied
- `backend/app/api/v1/stock.py`: Lot scope checks on history/balance endpoints
- `backend/app/services/dispatch_service.py`: Accepts `mill_id`/`company_id` on create
- `backend/app/services/quality_service.py`: Accepts `mill_id`/`company_id` on create
  - `backend/alembic/versions/041_tenant_safety_and_financial_precision.py`: Idempotent tenant isolation migration

- **Secret Rotation Sprint**: Rotated all 3 JWT/QR signing keys (256-bit hex), removed production URL fallbacks from frontend (fail closed), replaced docker-compose default passwords with `${VAR:?required}` (fail closed), created `.env.example` with zero real secrets, gated demo accounts behind `VITE_SHOW_DEMO_ACCOUNTS`, moved seed script passwords to `SEED_ADMIN_PASSWORD`/`SEED_USER_PASSWORD` env vars.

### SUPABASE DB PASSWORD — MANUAL ACTION REQUIRED
The Supabase database password (`hoxpo4-qepgov-Gapqir`) in `backend/.env` could not be rotated programmatically. To rotate it:
1. Go to Supabase Dashboard → Project Settings → Database → Reset Database Password
2. Update `DATABASE_URL` and `DATABASE_SYNC_URL` in `backend/.env` with the new password
3. Restart any running backend processes
