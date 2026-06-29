# SpinFlow ERP — Full Audit Report

**Date:** 2026-06-21
**Scope:** Backend (FastAPI + SQLAlchemy2 async) + Frontend (React18 + Vite + TanStack Router) + DB (Supabase Postgres) + Deploy (Render)

---

## 1. Executive Summary

**Health Score: 72/100**

SpinFlow ERP is a well-architected multi-tenant SaaS with strong security foundations (parameterized SQL, JWT validation, rate limiting, security headers) and a mature module-access chain. However, four systemic issues lower the score: (1) the frontend has **two diverging permission systems** (`useRBAC` vs `useModuleAccess`) that can produce contradictory results; (2) **9 route pages use an incomplete `canWrite()`** that bypasses company subscription checks; (3) there is a **Zustand rehydration race** causing false redirect-to-login on page refresh; (4) the **backend `require_module()` skips subscription checks for MILL_OWNER on `users`/`masters`** via `_ALWAYS_ALLOWED`. Additionally, one **public DDL endpoint** (`GET /api/run-migration-040`) is a critical security hole. Six known-bug-pattern occurrences were found, and the RBAC matrix has 3 inconsistencies between frontend and backend. Customization infrastructure exists but **field labels, dropdowns, and custom fields are only partially propagated** to consuming surfaces.

---

## 2. Critical Issues — P0 (blocks demo/revenue)

### P0-1: Public unauthenticated DDL endpoint
- **File:** `backend/app/main.py:567-574`
- **Issue:** `GET /api/run-migration-040` has no `Depends(get_current_user)`. Anyone can trigger `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` statements.
- **Fix:** Add `Depends(get_current_user)` with SUPER_ADMIN guard, or remove entirely.

### P0-2: Two diverging frontend permission systems
- **Files:**
  - `src/hooks/useRBAC.ts` — fetches company modules fresh via API (`staleTime: 0`), checks 3 layers
  - `src/hooks/useModuleAccess.ts` — uses stale `user.allowedModules` from login response (persisted in localStorage)
  - `src/components/layout/Sidebar.tsx:188-194` — uses BOTH hooks simultaneously
- **Issue:** `useRBAC` fetches fresh company-module data and can return a different result than `useModuleAccess` which relies on the login-time snapshot. Sidebar mixes both — a module could be hidden by one system but shown by the other.
- **Fix:** Unify to one permission system. Either make `useModuleAccess` also fetch fresh, or make `useRBAC` the single source of truth and remove `useModuleAccess`.

### P0-3: 9 route pages bypass company subscription with `canWrite()`
- **Files:**
  - `src/routes/_app.hr.tsx:264`
  - `src/routes/_app.quality.tsx:71`
  - `src/routes/_app.production.tsx:4678`
  - `src/routes/_app.stores.tsx:54`
  - `src/routes/_app.purchase.tsx:80`
  - `src/routes/_app.masters.tsx:95`
  - `src/routes/_app.maintenance.tsx:304`
  - `src/routes/_app.inventory.tsx:42`
  - `src/routes/_app.dispatch.tsx:43`
- **Issue:** `canWrite()` from `src/lib/rbac.ts:74-81` calls `_getCtx()` with `null` for both `companyModules` and `moduleRestrictions` — it checks role-only, ignoring whether the company has enabled that module. If "hr" is disabled for a company, the HR page would still show edit buttons (which would 403 on backend).
- **Fix:** Replace with `useRBAC().canAccess(module, true)` which checks all 3 layers including company subscription.

### P0-4: Zustand rehydration race causes false redirect
- **Files:**
  - `src/routes/_app.tsx:21-23` — `beforeLoad` reads `useAuth.getState().user` before persist rehydration completes
  - `src/routes/login.tsx:14` — same race in login guard
  - `src/routes/_app.admin.tsx:50-53` — same race in admin guard
  - `src/stores/auth.ts:82-118` — persist middleware with no `onRehydrateStorage` or `skipHydration`
  - `src/router.tsx` — no hydration awareness
- **Issue:** On page refresh, `useAuth.getState().user` is `null` until the persist middleware reads localStorage. Route guards fire during route resolution, **before** rehydration, causing false redirects to `/login`. If rehydration completes between the `_app.tsx` redirect and login page load, it can create a **redirect loop**.
- **Fix:** Add `onRehydrateStorage` callback; use `skipHydration: true`; render a loading state until hydration completes.

---

## 3. Important Issues — P1

### P1-1: MILL_OWNER bypasses subscription for `users`/`masters` via `_ALWAYS_ALLOWED`
- **File:** `backend/app/core/deps.py:82-87`
- **Issue:** `_ALWAYS_ALLOWED` dict gives MILL_OWNER unconditional access to `users` and `masters` modules **without calling `resolve_access()`**. This means `CompanyModule.is_enabled` is never checked for these modules when accessed by MILL_OWNER. Even if a company explicitly disables `users` for MILL_OWNER via `RoleModuleAccess`, the bypass would ignore it.
- **Fix:** Remove `MILL_OWNER` from `_ALWAYS_ALLOWED["users"]` and `_ALWAYS_ALLOWED["masters"]`. MILL_OWNER already has `True` in `ACCESS_MATRIX` for all modules — the subscription check in `resolve_access()` is the necessary addition.

### P1-2: SQL injection in `deletion_service.py`
- **File:** `backend/app/services/deletion_service.py:495`
- **Issue:** `",".join(f"'{u}'" for u in user_ids)` — string interpolation of user IDs into raw SQL. User IDs from DB, not direct user input, but breaks parameterization. If a compromised session yields a crafted user_id, this becomes an injection vector.
- **Fix:** Use `= ANY(:user_ids)` parameterization as noted in the service audit.

### P1-3: `alerts` and 6 other modules missing from backend ACCESS_MATRIX
- **File:** `backend/app/core/rbac.py:37-122`
- **Missing modules:** `alerts`, `uploads`, `analytics`, `lc_tracking`, `whatsapp`, `column_config`, `admin`
- **Issue:** These 7 module codes are not explicitly listed in the backend `ACCESS_MATRIX`. SUPER_ADMIN and MILL_OWNER are fine (SUPER_ADMIN bypasses; MILL_OWNER uses `{m: True for m in MODULES}`). But lower roles like `GENERAL_MANAGER`, `STORE_MANAGER`, `ACCOUNTANT` who have these modules in the **frontend** `ACCESS_MATRIX` will see UI buttons but get 403 from the backend. The `alerts` module is especially critical — it has no canonical registry entry.
- **Fix:** Add `alerts`, `uploads`, `analytics`, `lc_tracking`, `whatsapp`, `column_config` to the backend `ACCESS_MATRIX` with appropriate role access levels.

### P1-4: `AUDITOR` incorrectly in frontend DASHBOARD_ONLY_ROLES
- **File:** `src/lib/access.ts:244`
- **Issue:** Frontend `DASHBOARD_ONLY_ROLES` includes `"AUDITOR"`. Backend `rbac.py:26` excludes `AUDITOR`. On the backend, `AUDITOR` has read access to `quality`, `production`, `hr`, `accounts`, `audit`, `stock`, `reports`. On the frontend, the `beforeLoad` guard redirects `AUDITOR` back to `/dashboard`, making those backend-accessible routes unreachable.
- **Fix:** Remove `"AUDITOR"` from frontend `DASHBOARD_ONLY_ROLES` to match backend.

### P1-5: `GET /purchase/bales/stats` — cross-mill data leak
- **File:** `backend/app/api/v1/purchase.py:300-336` (deferred)
- **Issue:** The endpoint executes `select(CottonBale)` without any `WHERE` clause. The `effective_mill_id` variable is computed but never passed to the query. Returns bales across ALL mills in ALL companies.
- **Fix:** Add `effective_mill_id` filter to the bales stats query.

### P1-6: No CSRF protection
- **File:** (entire codebase)
- **Issue:** No CSRF middleware, no CSRF tokens, no `Origin`/`Referer` validation. The refresh token cookie uses `SameSite=None` (permissive). While access tokens are in-memory-only (mitigating standard CSRF), the refresh endpoint (`POST /auth/refresh`) is vulnerable.
- **Fix:** Implement CSRF token validation for state-changing requests, or set `SameSite=Strict` on cookies where possible.

### P1-7: `POST /auth/users` and `POST /admin/users` lack password strength validation
- **Files:**
  - `backend/app/api/v1/auth.py:520-580` — no password validation at all
  - `backend/app/api/v1/admin.py:157-160` — only checks `len < 8`, no complexity
  - `backend/app/api/v1/auth.py:457-474` — reset-password lacks validation
- **Issue:** Users can be created with weak passwords (e.g., `"123"`). `ChangePasswordRequest` schema says `min_length=6` but server enforces `>= 8`.
- **Fix:** Add consistent server-side validation (8+ chars, uppercase, digit, special char) to all password-setting endpoints.

---

## 4. Minor / Nice-to-fix — P2

### P2-1: `User.role_rel` lacks eager loading in 2 code paths
- **Files:**
  - `backend/app/api/v1/auth.py:567` — `POST /auth/users` accesses `user.role_rel` without `selectinload`
  - `backend/app/api/v1/auth.py:632` — `POST /auth/force-change-password` accesses `user.role_rel` without `selectinload`
- **Issue:** These could raise `MissingGreenletError` if the session identity map is cold. Currently works because the `Role` object was fetched earlier in the same request.
- **Fix:** Add `selectinload(User.role_rel)` to the query in both locations.

### P2-2: Frontend `SYSTEM_MODULES` differs from backend
- **Files:**
  - `src/lib/access.ts:233-241` — has `admin`, `alerts` in SYSTEM_MODULES
  - `backend/app/core/access.py:21-22` — imports from `module_registry.py` which lacks `admin` and `alerts`
- **Issue:** Frontend treats `admin` and `alerts` as system modules that bypass company subscription. Backend has no `admin` module code. `alerts` has no registry entry — it's a ghost module.
- **Fix:** Align frontend and backend SYSTEM_MODULES. Either add `alerts` to the canonical registry, or remove it from both systems.

### P2-3: `POST /auth/register` has no rate limit
- **File:** `backend/app/api/v1/demo.py:50`
- **Issue:** Public registration endpoint with no rate limiting. Could be used for account creation spam.
- **Fix:** Add `@limiter.limit("5/minute")`.

### P2-4: `GET /tours` has no auth
- **File:** `backend/app/api/v1/demo.py:102`
- **Issue:** Lists all product tours without authentication.
- **Fix:** Add `Depends(get_current_user)`.

### P2-5: `GET /api/run-migration-040` has no auth (see P0-1)
- Same as P0-1, listed here as severity reference.

### P2-6: Frontend `useRBAC` fetches fresh module data at every mount
- **File:** `src/hooks/useRBAC.ts:20-42`
- **Issue:** `staleTime: 0` with `refetchOnWindowFocus: true` means every mount (including tab re-focus) triggers a `GET /admin/companies/{id}/modules` call. On slow connections, permission checks briefly return incomplete results.
- **Fix:** Increase `staleTime` to 5 minutes. Use `refetchInterval` instead of `refetchOnWindowFocus`.

### P2-7: `src/lib/rbac.ts:74-81` caches permission results forever
- **File:** `src/lib/rbac.ts:62-81`
- **Issue:** The `_ctxCache` Map caches `AccessContext` per role string with no expiry. If company subscription changes or user restrictions are updated, the cache still returns the old result until the page is hard-refreshed.
- **Fix:** Add TTL to `_ctxCache` or invalidate on route change.

### P2-8: `POST /mills` uses bare `get_current_user` instead of `require_module`
- **File:** `backend/app/api/v1/masters.py`
- **Issue:** MILL_OWNER can create mills via `POST /mills` with `get_current_user` instead of `require_module("masters", write=True)`. Currently gated by inline role check (`SUPER_ADMIN/MILL_OWNER`), but bypasses the module permission framework.
- **Fix:** Replace with `require_module("masters", write=True)`.

### P2-9: `alerts.py:637` trusts `body.mill_id` without scope validation
- **File:** `backend/app/api/v1/alerts.py:637`
- **Issue:** `POST /alerts/rules` uses `mill_id=body.mill_id` directly. Guard: only MILL_OWNER or SUPER_ADMIN. MILL_OWNER could create a rule for any mill in their company.
- **Fix:** Validate body.mill_id against the mill scope.

### P2-10: `lotrac.py:37` uses `getattr` instead of `get_mill_scope()`
- **File:** `backend/app/api/v1/lotrac.py:37`
- **Issue:** `GET /trips` uses `getattr(current_user, "mill_id", "")` instead of `get_mill_scope()`. For MILL_OWNER (no personal mill_id), this could be empty causing incorrect scoping.
- **Fix:** Replace with `scope = await get_mill_scope(current_user, db)`.

### P2-11: Documentation references port 6543
- **Files:** `CONTEXT.md:806,878`, `STAGING_DEPLOYMENT.md:24,96`
- **Issue:** These files reference Supabase port `6543` (direct connection). Current config uses `5432` (connection pooler). Outdated documentation could cause deployment failures.
- **Fix:** Update documentation to reference port 5432.

---

## 5. Module-by-Module Status Table

| # | Module | CRUD works? | Endpoints | require_module? | Mill Scoped? | Frontend Page | Frontend Guard | Issues |
|---|--------|------------|-----------|----------------|-------------|---------------|----------------|--------|
| 1 | **Dashboard** | ✅ Read-only | ~13 | ✅ dashboard/admin | ✅ | `_app.dashboard.tsx` | `AccessGuard` | None significant |
| 2 | **Production** | ✅ Full CRUD | ~28 | ✅ production | ✅ | `_app.production.tsx` 4678 lines | `AccessGuard` + `canWrite()` | Uses `canWrite()` (P0-3); large page |
| 3 | **Quality** | ✅ Full CRUD | ~13 | ✅ quality | ✅ (except summary/csp-trend) | `_app.quality.tsx` | `AccessGuard` + `canWrite()` | `summary`/`csp-trend` may lack mill scope |
| 4 | **Stock** | ✅ Read-only | 3 | ✅ stock | ✅ | `_app.stock.tsx` | `AccessGuard` | Thin — mutations via other modules |
| 5 | **Inventory** | ✅ Full CRUD | ~8 | ✅ inventory | ✅ | `_app.inventory.tsx` | `AccessGuard` + `canWrite()` | Uses `canWrite()` (P0-3) |
| 6 | **LoTrac** | ✅ Full CRUD | ~10 | ✅ lotrac/inventory | ⚠️ Incomplete (P2-10) | `_app.lotrac.tsx` 1199 lines | `AccessGuard` | `getattr` scoping (P2-10) |
| 7 | **Dispatch** | ✅ Full CRUD | ~15 | ✅ dispatch | ✅ | `_app.dispatch.tsx` 513 lines | `AccessGuard` + `canWrite()` | Dual status endpoints |
| 8 | **Purchase** | ✅ Full CRUD | ~12 | ✅ purchase | ⚠️ Stats leak (P1-5) | `_app.purchase.tsx` 1618 lines | `AccessGuard` + `canWrite()` | Stats cross-mill leak (P1-5) |
| 9 | **Stores** | ✅ Full CRUD | ~10 | ✅ stores | ✅ | `_app.stores.tsx` 870 lines | `AccessGuard` + `canWrite()` | Uses `canWrite()` (P0-3) |
| 10 | **HR** | ✅ Full CRUD | ~20 | ✅ hr | ✅ (IDOR audit fixed) | `_app.hr.tsx` 3717 lines | `AccessGuard` + `canWrite()` | Uses `canWrite()` (P0-3); extreme page size |
| 11 | **Payroll** | ✅ Full CRUD | ~7 | ✅ payroll | ✅ | `_app.payroll.tsx` 503 lines | `AccessGuard` | Well-factored |
| 12 | **Accounts** | ✅ Full CRUD | ~11 | ✅ accounts | ✅ | `_app.accounts.tsx` 971 lines | `AccessGuard` | COGS fixed (was always $0) |
| 13 | **Maintenance** | ✅ Full CRUD | ~13 | ✅ maintenance | ✅ | `_app.maintenance.tsx` 1087 lines | `AccessGuard` + `canWrite()` | Uses `canWrite()` (P0-3) |
| 14 | **Reports** | ✅ Read-only | ~3 | ✅ reports | ⚠️ Partial | `_app.reports.tsx` 984 lines | `AccessGuard` | Stock summary is hardcoded 0 |
| 15 | **Masters** | ✅ Full CRUD | ~28 | ⚠️ Except POST /mills | ✅ | `_app.masters.tsx` 3257 lines | `AccessGuard` + `canWrite()` | Uses `canWrite()` (P0-3); POST /mills not module-gated (P2-8) |

---

## 6. Role Access Matrix — Actual vs Expected

### Backend Role Definitions (from `rbac.py`, lines 14-20):
```
MANAGEMENT: SUPER_ADMIN, MILL_OWNER, GENERAL_MANAGER
PRODUCTION: PRODUCTION_MANAGER, SUPERVISOR, MACHINE_OPERATOR
QUALITY:    QUALITY_MANAGER, AUDITOR
DISPATCH:   DISPATCH_MANAGER
MAINTENANCE: MAINTENANCE_MANAGER
STORES:     STORE_MANAGER
HR:         HR_MANAGER
FINANCE:    ACCOUNTANT
SECURITY:   SECURITY_GATE
```

### Backend ACCESS_MATRIX actual behavior (from `rbac.py`):

| Module | SA | MO | GM | PM | QM | DM | MM | SM | HR | AC | SV | MOp | SG | AU |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| dashboard | W | W | W | W | W | W | W | W | W | W | W | R | R | R |
| production | W | W | R | W | — | — | — | — | — | — | R | R | — | R |
| quality | W | W | R | — | W | — | — | — | — | — | — | — | — | R |
| stock | W | W | — | — | — | — | — | W | — | — | — | — | — | R |
| inventory | W | W | — | — | — | — | — | — | — | — | — | — | — | — |
| purchase | W | W | R | — | — | — | — | — | — | — | — | — | — | — |
| stores | W | W | — | — | — | — | — | W | — | — | — | — | — | — |
| dispatch | W | W | — | — | — | W | — | — | — | — | — | — | — | — |
| hr | W | W | — | — | — | — | — | — | W | — | — | — | — | — |
| payroll | W | W | R | — | — | — | — | — | — | W | — | — | — | — |
| accounts | W | W | R | — | — | — | — | — | — | — | W | — | — | R |
| maintenance | W | W | — | — | — | — | W | — | — | — | — | — | — | — |
| lotrac | W | W | — | — | — | W | — | — | — | — | — | — | — | — |
| reports | W | W | W | — | — | — | — | — | — | — | — | — | — | — |
| sales | W | W | — | — | — | — | — | — | — | — | — | — | — | — |
| masters | W | W | — | — | — | — | — | — | — | — | — | — | — | — |
| users | W | W | — | — | — | — | — | — | — | — | — | — | — | — |
| alerts | — | W | — | — | — | — | — | — | — | — | — | — | — | — |
| uploads | W | W | — | — | — | — | — | — | — | — | — | — | — | — |

W=write, R=read, —=no access

### Discrepancies found:

1. **AUDITOR (AU):** Frontend `access.ts:244` marks `AUDITOR` as dashboard-only. Backend gives `AUDITOR` read access to `production`, `quality`, `accounts`, `audit`, `stock`, `reports`. **MISMATCH** — frontend blocks routes that backend allows.

2. **GENERAL_MANAGER (GM):** Frontend `access.ts` gives GM write to `dashboard`, `reports`, `production`, `quality`, `stock`, `hr`, `payroll`, `accounts`, `purchase`, `sales`, `stores`, `dispatch`, `maintenance`, `lotrac`, `lc_tracking`, `alerts`. Backend gives GM only read to `production`, `quality`, `stock`, `purchase`, `payroll`, `accounts`, `reports`, `dashboard`. **MISMATCH** — frontend shows write UI buttons that 403 on backend.

3. **ALERTS module:** Present in frontend ACCESS_MATRIX for 17 roles. On backend, `alerts` is missing from `module_registry.py` and `rbac.ACCESS_MATRIX`. Only MILL_OWNER gets access (via `{m: True for m in MODULES}`). **MISMATCH** — all other roles see alerts in sidebar but get 403.

4. **Dashboard-only role definitions differ:** Frontend includes `AUDITOR`; backend excludes it.

---

## 7. Multi-Tenant Isolation Test Results

### Methodology
The local DB was unavailable for live queries (connection timeout). The analysis is based on code audit of routing, scoping, and model definitions.

### Confirmed via Code Audit:

**Tables with `mill_id` column:** ~30+ tables including `mills`, `departments`, `employees`, `machines`, `production_entries`, `quality_tests`, `lots`, `dispatch_orders`, `trips`, `inventory_items`, `cotton_bales`, `suppliers`, `stores_spares`, `store_issues`, `maintenance_tasks`, `maintenance_schedules`, `payroll_months`, etc.

**Tables with `company_id` but NO `mill_id`:** `companies`, `company_subscriptions`, `company_modules`, `billing_invoices`, `billing_payments`, `users`, `audit_logs`, `deletion_logs`, `approval_workflows`, `alert_rules`

**Scope enforcement mechanism:**
- Every GET list endpoint uses `get_mill_scope()` → applies `model.mill_id == effective_mill_id` or `model.mill_id.in_(mills_sub)` (for MILL_OWNER company-wide scope)
- Every POST create endpoint stamps `mill_id` from `get_mill_scope()`, never from request body
- SUPER_ADMIN bypasses all scoping (expected — cross-company administration)
- MILL_OWNER gets company-scoped access (all mills under their company)

**Confirmed leaks (see P1-5, P2-10):**
- `GET /purchase/bales/stats` — no WHERE clause, fetches ALL bales across all companies
- `GET /trips` (lotrac.py:37) — uses `getattr` instead of `get_mill_scope`, may not scope correctly for MILL_OWNER
- `POST /alerts/rules` — trusts `body.mill_id` without scope validation

**Queries to run when DB is accessible:**
```sql
-- Check for orphaned data: mill_id points to mill in different company
SELECT t.mill_id, m.company_id, t.company_id 
FROM some_table t 
JOIN mills m ON t.mill_id = m.id 
WHERE t.company_id != m.company_id;

-- Check for null mill_ids where not expected
SELECT COUNT(*) FROM production_entries WHERE mill_id IS NULL;
SELECT COUNT(*) FROM quality_tests WHERE mill_id IS NULL;

-- Cross-tenant: user from company A accessing company B data
SELECT u.company_id as user_company, 
       pe.company_id as entry_company, 
       COUNT(*) 
FROM production_entries pe 
JOIN users u ON u.id = 'some_user_id' 
WHERE pe.company_id != u.company_id;
```

---

## 8. Security Checklist Results

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | JWT payload contains only sub/role/exp | **PASS** | `security.py:17-28` — `sub`, `role`, `exp`, `iat`, `type`, `iss`, `jti`. No PII/sensitive data. |
| 2 | JWT algorithm is HS512 | **PASS** | `config.py` — `JWT_ALGORITHM` defaults to `HS512`. |
| 3 | JWT secrets >= 32 chars | **PASS** | `config.py:121-125` — validated in settings. |
| 4 | Every route has Depends(get_current_user) | **FAIL** (2 exceptions) | `main.py:567` — `/api/run-migration-040` is public. `demo.py:102` — `GET /tours` is public. |
| 5 | SQL is parameterized | **FAIL** (1 occurrence) | `deletion_service.py:495` — string interpolation of user_ids. |
| 6 | CORS allows only whitelisted origins | **PASS** | `config.py:52-57` — explicit origins list, `"*"` filtered. |
| 7 | Rate limiting on /auth/login | **PASS** | `auth.py:132` — 10/min with account lockout after 5 failures. |
| 8 | Password validation server-side | **FAIL** (3 endpoints) | `auth.py:520` POST /auth/users — no validation. `auth.py:457` reset-password — no validation. `admin.py:160` — only length check. |
| 9 | CSRF protection | **FAIL** | No CSRF middleware, no tokens, no Origin/Referer validation. |
| 10 | Security headers present | **PASS (MODERATE)** | CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options all set. CSP uses `'unsafe-inline'`/`'unsafe-eval'` (React requirement). HSTS missing. |
| 11 | Upload file type validation | **PASS** | `uploads.py:34-62` — magic byte detection + MIME allowlist + 10MB limit. |
| 12 | Rate limiting on mutation endpoints | **PASS** | 10/min on 6 admin mutation endpoints, uploads, exports. |
| 13 | Token type check (access vs refresh) | **PASS** | `deps.py:34` — checks `payload.get("type") == "access"`. |
| 14 | Company suspension check | **PASS** | `deps.py:42-48` — checks `company.status` at every request. |
| 15 | Subscription health check | **PASS` | `deps.py:52-62` — 402 for expired/grace/cancelled. |

**Overall Security Score: 12/15 passes (80%)**

---

## 9. Known-Bug-Pattern Scan Results

### Pattern 1: `require_module()` missing SUPER_ADMIN bypass
- **Occurrences:** 0 (✓ SUPER_ADMIN bypass present in all locations)
- All endpoints using `require_module()` get the bypass automatically via `deps.py:104-106`
- However, `admin.py` uses bare `get_current_user` (not `require_module`) — 60+ endpoints rely on inline role checks. This is intentional but inconsistent.

### Pattern 2: Lazy-loaded relationships after session yield (MissingGreenlet)
- **Occurrences:** 3 high-risk relationships found

| File:Line | Relationship | Risk |
|-----------|-------------|------|
| `user.py:47` | `User.role_rel` (default lazy="select") | **HIGH** — accessed in 179 locations as `current_user.role_rel.code` |
| `masters.py:59` | `Company.mills` (default lazy="select") | **MEDIUM** — accessed in admin and billing flows |
| `masters.py:82` | `Mill.company` (default lazy="select") | **MEDIUM** — back-reference from Mill to Company |

### Pattern 3: Zustand persist rehydration race
- **Occurrences:** 3 locations (see P0-4)

| File:Line | Guard | Risk |
|-----------|-------|------|
| `_app.tsx:21` | `beforeLoad: if (!user) redirect /login` | **HIGH** — full page redirect loop on refresh |
| `login.tsx:14` | `beforeLoad: if (user) redirect /dashboard` | **HIGH** — same race |
| `_app.admin.tsx:50` | `beforeLoad: if (!user || role != SA) redirect /dashboard` | **MEDIUM** |

### Pattern 4: Companies.id assumed UUID instead of VARCHAR
- **Occurrences:** 0 (✓ No bug found)
- Column type is `String(36)` everywhere. All FKs use `String(36)`. `generate_uuid()` returns `str(uuid.uuid4())` — always a string. No `UUID` type usage in column definitions.

### Pattern 5: DB port 6543 instead of 5432
- **Occurrences:** 0 in runtime config (✓ Documentation drift only)
- `.env` files use `5432`. `CONTEXT.md:806,878` and `STAGING_DEPLOYMENT.md:24,96` reference `6543`. Not a runtime bug but a documentation trap.

### Pattern 6: Trusting mill_id/company_id from request body
- **Occurrences:** 3 found

| File:Line | Endpoint | Risk |
|-----------|----------|------|
| `alerts.py:637` | `POST /alerts/rules` — `mill_id=body.mill_id` | **MEDIUM** — should validate against scope |
| `lotrac.py:37` | `GET /trips` — `getattr(current_user, "mill_id")` | **MEDIUM** — doesn't use get_mill_scope() |
| `admin.py:157-158` | `POST /admin/users` — `company_id/mill_id from body` | **LOW** — SUPER_ADMIN-only endpoint |

---

## 10. Recommendations (Ranked by Priority)

### 🔴 Immediate (fix before next deploy)

1. **Remove or secure `GET /api/run-migration-040`** (P0-1) — Add `Depends(get_current_user)` with SUPER_ADMIN guard.
2. **Fix Zustand rehydration race** (P0-4) — Add `onRehydrateStorage` and render a hydration guard before route resolution.
3. **Fix `GET /purchase/bales/stats` cross-mill leak** (P1-5) — Add mill scope WHERE clause.

### 🟡 High (next sprint)

4. **Unify `useRBAC` and `useModuleAccess`** (P0-2) — Remove the diverging dual system. Pick one (recommend: `useRBAC` with fresh API data) and migrate all consumers.
5. **Fix 9 `canWrite()` calls** (P0-3) — Replace with `useRBAC().canAccess(module, true)`.
6. **Add missing modules to backend ACCESS_MATRIX** (P1-3) — Add `alerts`, `uploads`, `analytics`, `lc_tracking`, `whatsapp`, `column_config` with appropriate role access.
7. **Fix `AUDITOR` DASHBOARD_ONLY_ROLES mismatch** (P1-4) — Remove `AUDITOR` from frontend `DASHBOARD_ONLY_ROLES`.
8. **Fix SQL injection in deletion_service.py** (P1-2) — Parameterize user_ids.

### 🟢 Medium (next 2-3 sprints)

9. **Add CSRF protection** (P1-6) — Implement SameSite cookie strategy + CSRF tokens.
10. **Enforce password strength on all creation endpoints** (P1-7) — Unify validation across auth.py, admin.py.
11. **Fix MILL_OWNER `_ALWAYS_ALLOWED` bypass** (P1-1) — Remove MILL_OWNER from `_ALWAYS_ALLOWED` to ensure subscription checks run.
12. **Add eager loading for `User.role_rel`** (P2-1) — In 2 code paths in auth.py.
13. **Align frontend/backend SYSTEM_MODULES** (P2-2) — Register `alerts` in canonical module registry.

### 🔵 Low (backlog)

14. Add rate limit to `POST /auth/register` (P2-3).
15. Add auth to `GET /tours` (P2-4).
16. Fix port 6543 documentation drift (P2-11).
17. Fix `lotrac.py:37` to use `get_mill_scope()` (P2-10).
18. Refactor oversized route pages (5 pages exceed 1000 lines).

---

*Report generated on 2026-06-21 via automated code audit.*
