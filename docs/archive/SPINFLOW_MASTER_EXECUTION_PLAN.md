# SpinFlow ERP — Master Remediation & Execution Plan

**Prepared by:** Principal Engineer  
**Date:** 2026-06-11  
**Input:** Full Enterprise Audit Report (SPINFLOW_ENTERPRISE_AUDIT.md)  
**Status:** Pre-production hardening before first mill go-live  
**Scope:** All 10 issues from audit → executable engineering work  

---

> **Reading this document:** Start with Phase 1 (Dependency Graph) to understand what blocks what. Then follow waves in Phase 2 strictly in order — Wave N must be complete before Wave N+1 begins. Use Phase 3 for sprint planning, Phase 4 for every migration, Phase 9 for coding sessions.

---

# PHASE 1 — Dependency Graph

## Issue Dependency Matrix

Every issue from the audit is mapped: what it depends on, what it blocks, and why.

```
DEPENDENCY NOTATION
→  "blocks" (must be done first)
←  "depends on" (cannot start until this is done)
⚡ "emergency" (can be done in parallel, no deps)
```

| Issue ID | Title (short) | Depends On | Blocks | Risk |
|---|---|---|---|---|
| **A-01** | DB pool size | None | PF-02 | LOW (config only) |
| **A-02** | Migration fail-fast | None | ALL migrations | LOW |
| **A-03** | User.company_id FK | None | A-04, DF-01 | MEDIUM |
| **A-04** | 14 global unique constraints | A-03 | D-01, DF-01, E-03 | HIGH |
| **A-05** | In-memory file store | None | None | LOW |
| **A-06** | Single uvicorn worker | A-01 | P-01, P-02 | LOW |
| **D-01** | machine_code string FK | A-04 | DF-01 | HIGH |
| **D-02** | No cascade deletes | A-03, A-04 | None | MEDIUM |
| **D-03** | String dates | A-04 | None | HIGH |
| **D-04** | Missing composite indexes | A-04, D-01 | P-01 | LOW |
| **D-05** | Dual payroll models | None | None | MEDIUM |
| **D-06** | InventoryItem no mill_id | A-04 | None | MEDIUM |
| **AP-01** | 164 swallowed exceptions | None | Q-01 | MEDIUM |
| **AP-02** | Import RBAC bypass | None | S-05 | LOW |
| **AP-03** | Webhook HMAC broken | None | None | LOW |
| **AP-04** | No rate limit on import/export | None | S-04 | LOW |
| **AP-05** | Dashboard swallows errors | AP-01 | None | LOW |
| **AP-06** | N+1 HR queries | D-04 | P-01 | LOW |
| **AP-07** | CORS regex too broad | None | None | LOW |
| **F-01** | JWT in localStorage | None | S-01, S-02 | MEDIUM |
| **F-02** | No Zod validation | None | Q-01 | LOW |
| **F-03** | Stale cache after mutations | None | None | LOW |
| **F-04** | Mill switch no cache clear | F-03 | None | LOW |
| **F-05** | Hardcoded API URL fallback | None | None | LOW |
| **F-06** | No error boundaries | AP-01 | None | LOW |
| **E-01** | KPI efficiency formula | None | None | LOW |
| **E-02** | Waste % not validated | F-02 | None | LOW |
| **E-03** | Production not linked to Lots | A-04, D-01 | DF-01 | HIGH |
| **E-04** | Shift no uniqueness | A-04 | None | LOW |
| **E-05** | Payroll no finalization lock | None | None | LOW |
| **DF-01** | machine_code tenant bypass | A-03, A-04, D-01 | None | HIGH |
| **DF-02** | Import no rollback | None | None | LOW |
| **DF-03** | QR token no expiry | None | None | MEDIUM |
| **Q-01** | Zero tests | AP-01, F-02 | ALL waves | HIGH |
| **Q-02** | No seed data | None | Q-01 | LOW |
| **PF-01** | Render cold start | None | None | LOW |
| **PF-02** | Pool exhaustion | A-01 | None | RESOLVED by A-01 |
| **PF-03** | Migration failure blocks deploy | A-02 | None | RESOLVED by A-02 |
| **S-01** | JWT localStorage (same as F-01) | None | None | HIGH |
| **S-02** | No CSRF / SameSite | F-01 | None | LOW |
| **S-03** | RAZORPAY secret not validated | None | None | LOW |
| **S-04** | OTP rate limit per IP | AP-04 | None | LOW |
| **S-05** | No export audit log | AP-02 | None | LOW |
| **S-06** | Sessions not revoked on pw change | None | None | LOW |
| **P-01** | No pagination on list endpoints | D-04 | None | LOW |
| **P-02** | Excel parse blocks event loop | A-06 | None | LOW |
| **P-03** | Stale cache 3min | F-03 | None | LOW |
| **TD-01** | production.py/v2 overlap | None | None | LOW |
| **TD-02** | get_mill_scope duplicated | None | None | LOW |
| **TD-03** | No code splitting | None | None | LOW |
| **TD-04** | Inconsistent date handling | D-03 | None | LOW |
| **DI-01** | Health check no DB ping | None | None | LOW |
| **DI-02** | Staging/prod share secrets | None | None | MEDIUM |
| **DI-03** | No backup verification | None | None | LOW |
| **DI-04** | SlowAPI in-memory backend | AP-04 | None | LOW |

## Visual Dependency Tree (Critical Path Only)

```
Level 0 (No deps — start immediately):
┌─────────────────────────────────────────────────────────────────────┐
│  A-01  A-02  A-03  AP-01  AP-02  AP-03  AP-04  F-01  F-05  DI-01  │
│  S-03  D-05  Q-02  PF-01  A-05  AP-07  F-02   F-06  TD-02         │
└─────────────────────────────────────────────────────────────────────┘
         │         │
         ▼         ▼
Level 1 (Depends on Level 0):
┌─────────────────────────────────────────────────────────────────────┐
│  A-04 (← A-03)     D-01 (← A-04)     F-03 (← F-01)                │
│  S-01 (← F-01)     S-02 (← F-01)     S-04 (← AP-04)               │
│  DI-04 (← AP-04)   S-05 (← AP-02)    Q-01 (← AP-01, F-02)         │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
Level 2 (Depends on Level 1):
┌─────────────────────────────────────────────────────────────────────┐
│  D-02 (← A-03, A-04)    D-03 (← A-04)    D-04 (← A-04, D-01)      │
│  D-06 (← A-04)          E-03 (← A-04, D-01)    DF-01 (← A-03, D-01)│
│  F-04 (← F-03)          P-03 (← F-03)                              │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
Level 3 (Depends on Level 2):
┌─────────────────────────────────────────────────────────────────────┐
│  AP-06 (← D-04)    P-01 (← D-04)    TD-04 (← D-03)                │
│  E-01 (← E-03)     E-02 (← F-02)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Critical path to first mill go-live:**  
`A-01 → A-02 → A-03 → A-04 → D-01 → DF-01 → E-03 → Q-01`

---

# PHASE 2 — Implementation Waves

## Wave 1 — Emergency Stabilization
**Duration:** 3 days  
**Goal:** Prevent production crash and data corruption. Zero functional changes — only infrastructure fixes.

### Issues in Wave 1
`A-01, A-02, AP-01 (partial), AP-03, AP-07, DI-01, F-05, S-03`

### Files Involved
```
backend/app/db/session.py               — pool_size, max_overflow
backend/app/main.py                     — lifespan fail-fast
backend/app/api/v1/billing.py           — webhook HMAC raw body
backend/app/api/v1/*.py                 — remove bare except blocks (partial)
backend/app/api/v1/health.py (new)     — DB ping health check
backend/app/core/config.py             — check_secrets() add RAZORPAY
src/lib/api.ts                          — remove hardcoded URL fallback
render.yaml                             — CORS origins
```

### Tables Affected
None — no schema changes in Wave 1.

### API Endpoints Affected
- `GET /api/health` — enhanced with DB check
- `POST /api/v1/subscription/webhook` — HMAC fix
- All endpoints — exception handling improvement

### Frontend Routes Affected
- `src/lib/api.ts` — env var enforcement

### Migration Required
None.

### Rollback Strategy
All changes are config/code-only. Git revert to previous commit restores prior state in one command.

### Expected Risks
- `check_secrets()` change may crash startup if `RAZORPAY_WEBHOOK_SECRET` is not set on Render — add to Render env vars before deploying.
- Removing bare `except` blocks may expose previously hidden errors in logs — this is intentional and expected.

### Success Criteria
- `GET /api/health` returns `{"status":"ok","db":"connected","latency_ms":N}`
- Render deploy fails on migration error (test with broken migration, then revert)
- DB pool handles 10 concurrent connections without timeout
- No bare `except Exception: return {}` remaining in Wave 1 files
- Webhook HMAC validates correctly against Razorpay test payload
- Frontend throws error at startup if `VITE_API_BASE_URL` is missing

---

## Wave 2 — Security Hardening
**Duration:** 4 days  
**Goal:** Eliminate token exposure, harden auth, lock down data access.  
**Depends on:** Wave 1 complete.

### Issues in Wave 2
`F-01/S-01, S-02, S-04, S-05, S-06, AP-02, AP-04, DI-04, A-05`

### Files Involved
```
src/stores/auth.ts                      — remove token from localStorage
src/lib/api.ts                          — in-memory token management
backend/app/api/v1/auth.py             — SameSite=Strict, session revocation
backend/app/api/v1/imports.py          — require_module on all import endpoints
backend/app/api/v1/exports.py          — add audit log calls
backend/app/core/limiter.py            — Redis backend for SlowAPI
backend/app/core/config.py            — REDIS_URL enforcement
```

### Tables Affected
- `user_sessions` — add revocation on password change

### API Endpoints Affected
- `POST /auth/refresh` — SameSite=Strict cookie
- `POST /auth/change-password` — revoke all sessions
- `POST /imports/parse`, `/imports/validate`, `/imports/commit` — require_module
- All export endpoints — audit log

### Frontend Routes Affected
- `src/stores/auth.ts` — token no longer in localStorage
- All protected routes — token sourced from memory, not storage

### Migration Required
None — session revocation is logic-only.

### Rollback Strategy
- Token storage change: revert `auth.ts`. Users will need to log back in once.
- Rate limit Redis: if Redis is unavailable, fall back to in-memory (acceptable degradation).

### Expected Risks
- Removing token from localStorage means users must log in again after tab close if access token expires. Mitigate: keep token in `sessionStorage` (tab-scoped, not XSS-accessible from other tabs) as a transitional step.
- SameSite=Strict may break OAuth flows if any are added later — document this.

### Success Criteria
- `localStorage` inspection in browser shows no `spinflow-auth` access token
- Import endpoints return 403 for users without module access
- All exports create audit log rows
- SlowAPI rate counts survive a Render restart (verify via Redis `KEYS ratelimit:*`)
- Password reset invalidates previous JWT (test: get token, reset password, use old token → 401)

---

## Wave 3 — Multi-Tenant Corrections
**Duration:** 7 days  
**Goal:** Make the system safe for multiple mills and multiple companies.  
**Depends on:** Wave 1 + Wave 2 complete, A-03 (User.company_id FK) done first.

### Issues in Wave 3
`A-03, A-04 (14 unique constraints), D-06, DF-01, E-04`

### Sub-order within Wave 3 (STRICT)
```
Step 3.1: A-03 — Add User.company_id FK (migration 023)
Step 3.2: Audit existing data for orphaned company_ids
Step 3.3: A-04 batch 1 — Machine.code, Customer.code, Route.code (migration 024)
Step 3.4: A-04 batch 2 — Dispatch.dispatch_no, Lot.lot_no, Trip.trip_no (migration 025)
Step 3.5: A-04 batch 3 — Supplier.code, CottonBale.bale_number, Invoice.invoice_no (migration 026)
Step 3.6: A-04 batch 4 — InventoryItem + mill_id, Warehouse.code, Technician.code, SalesOrder.so_no (migration 027)
Step 3.7: DF-01 — Add machine scope validation in ProductionService
Step 3.8: E-04 — Shift uniqueness constraint (migration 028)
```

### Files Involved
```
backend/app/models/user.py              — company_id FK
backend/app/models/masters.py          — Machine, Customer, Route, MasterVehicle
backend/app/models/dispatch.py         — Dispatch.dispatch_no, Vehicle.vehicle_no
backend/app/models/inventory.py        — Lot.lot_no, InventoryItem + mill_id
backend/app/models/lotrac.py           — Trip.trip_no
backend/app/models/purchase.py         — Supplier.code, CottonBale.bale_number
backend/app/models/accounts.py         — Invoice.invoice_no
backend/app/models/stock.py            — SalesOrder.so_no
backend/app/models/maintenance.py      — Technician.code
backend/app/models/production.py       — Shift uniqueness
backend/app/api/v1/production.py        — machine scope validation in create_entry
backend/alembic/versions/023–028.py    — 6 new migrations
```

### Tables Affected (all via migrations)
`users, machines, customers, master_routes, master_vehicles, dispatches, lots, trips, suppliers, cotton_bales, invoices, sales_orders, technicians, inventory_items, warehouses, shifts`

### API Endpoints Affected
- `POST /production/entries` — machine scope validation
- All master CRUD endpoints — uniqueness validation messages updated

### Frontend Routes Affected
- `_app.masters.tsx` — error messages for code collision
- `_app.production.tsx` — machine selector scoped to mill

### Migration Required
**Yes — 6 migrations (023–028).** See Phase 4 for full safety review per migration.

### Rollback Strategy
Each migration has a `downgrade()` that reverts the UniqueConstraint change. Because we are converting `unique=True` to `UniqueConstraint(col, mill_id)`, rollback restores global uniqueness. Rollback is safe if no data has been inserted with duplicate codes across mills.

**Pre-rollback check:**
```sql
-- Run before any rollback of 024-028
SELECT code, COUNT(*) FROM machines GROUP BY code HAVING COUNT(*) > 1;
-- If any rows returned, rollback will violate original unique constraint — DO NOT rollback
```

### Expected Risks
- **Highest risk migration in the entire project.** If production already has data with duplicate codes across mills, migrations 024–028 will fail. Pre-migration data audit is mandatory.
- `InventoryItem` adding `mill_id` (D-06): existing rows will have `NULL` mill_id after migration. Must backfill before adding NOT NULL constraint.

### Success Criteria
- Two mills in the same company can both create a Machine with code "BL-01"
- MILL_OWNER sees only their mills' machines in production entry form
- `GET /api/v1/production/entries` for Mill A returns zero records from Mill B
- All 6 migrations run cleanly on staging DB before production deploy

---

## Wave 4 — Database Integrity
**Duration:** 5 days  
**Goal:** Enforce referential integrity, fix type mismatches, add performance indexes.  
**Depends on:** Wave 3 complete.

### Issues in Wave 4
`D-01, D-02, D-03, D-04, D-05, AP-06`

### Sub-order within Wave 4
```
Step 4.1: D-05 — Resolve dual payroll models (audit + migrate data)
Step 4.2: D-04 — Add composite indexes (migration 029)
Step 4.3: D-02 — Add cascade deletes and SoftDeleteMixin (migration 030)
Step 4.4: D-01 — Add machine_id UUID FK alongside machine_code (migration 031)
Step 4.5: D-03 — Begin string → DATE type migration for high-priority tables (migration 032)
Step 4.6: AP-06 — Fix N+1 HR queries with selectinload
```

### Files Involved
```
backend/app/models/production.py       — DowntimeLog, ProductionEntry add machine_id
backend/app/models/hr.py               — Employee, Attendance add SoftDeleteMixin
backend/app/models/dispatch.py         — Dispatch SoftDeleteMixin
backend/app/models/payroll.py          — PayrollMonth deduplicate with monthly_payroll
backend/app/api/v1/hr.py               — selectinload for custom fields
backend/alembic/versions/029–032.py   — 4 new migrations
```

### Migration Required
Yes — 4 migrations (029–032).

### Rollback Strategy
- D-04 (indexes): `DROP INDEX` — no data risk.
- D-02 (cascade): reverts cleanly, no data change.
- D-01 (machine_id column): drop the new column — no data loss.
- D-03 (string→DATE): use `USING` cast; downgrade re-casts to VARCHAR.

### Success Criteria
- HR employee list with 200 employees loads in < 500ms (from 5+ seconds)
- Deleting a Machine soft-deletes all its ProductionEntries (or orphan check fires)
- Composite index on `(mill_id, date)` is visible in `pg_indexes`
- No `monthly_payroll` table writes — all payroll goes through `payroll_months`

---

## Wave 5 — Production Workflow Completion
**Duration:** 8 days  
**Goal:** Complete the ERP workflows that are currently broken or incomplete. This wave adds features, not just fixes.  
**Depends on:** Wave 4 complete.

### Issues/Features in Wave 5
`E-01, E-02, E-03, E-05, DF-02, DF-03, F-02, F-03, F-04, F-06`

### Features Added
1. **Lot → ProductionEntry link** (E-03): When entering production, operator selects active lot.
2. **Waste % server-side validation** (E-02): Reject waste entries > configured threshold.
3. **Efficiency KPI formula standardisation** (E-01): Backend computes and returns efficiency.
4. **Payroll finalization lock** (E-05): Finalized payroll cannot be modified.
5. **Import transaction rollback** (DF-02): Atomic imports with per-row error reporting.
6. **QR token expiry** (DF-03): Tokens expire after 30 days.
7. **Zod form validation** (F-02): All production forms validated before submit.
8. **Cache invalidation** (F-03/F-04): Mutations invalidate relevant queries; mill switch clears all.
9. **Error boundaries** (F-06): All route components wrapped.

### Files Involved
```
backend/app/models/production.py       — ProductionEntry add lot_id FK
backend/app/api/v1/production.py        — create_entry validate lot scope
backend/app/api/v1/production_v2.py     — waste pct server validation
backend/app/api/v1/imports.py           — atomic transaction with savepoints
backend/app/api/v1/dashboard.py         — standardised efficiency formula
backend/app/api/v1/payroll.py           — finalization lock guard
backend/app/models/inventory.py         — Lot/InventoryBag qr_expires_at
src/routes/_app.production.tsx          — Zod schemas, lot selector
src/routes/_app.hr.tsx                  — query invalidation
src/routes/_app.payroll.tsx             — finalized state guard
src/components/ErrorBoundary.tsx (new) — route-level error boundary
src/stores/auth.ts                      — setActiveMill → queryClient.clear()
backend/alembic/versions/033.py        — ProductionEntry.lot_id + qr_expires_at
```

### Migration Required
Migration 033: Add `lot_id` and `lot_no` to `production_entries`. Add `qr_expires_at` to `lots` and `inventory_bags`. All new columns nullable — zero downtime migration.

### Success Criteria
- Production entry form shows lot selector; selected lot is stored on the entry
- Waste entry with waste_pct > 30% is rejected by API with descriptive error
- Dashboard shows efficiency as `(actual_kg / rated_capacity_kg) * 100`
- Finalized payroll month returns 400 on any edit attempt
- Import of 500 employees: if row 300 fails, rows 1–299 are committed; rows 300–500 are reported as errors
- QR scan for a lot with `qr_expires_at` in the past returns 410 Gone
- Mill switch in header clears all cached queries (verified by network tab)

---

## Wave 6 — Performance Optimization
**Duration:** 4 days  
**Goal:** Make the system fast enough for 24/7 mill operations with 20+ concurrent users.  
**Depends on:** Wave 5 complete.

### Issues in Wave 6
`A-06, P-01, P-02, P-03, TD-01, TD-02, TD-03, TD-04, DI-03`

### Changes
1. **Pagination** on all list endpoints that are currently unbounded.
2. **asyncio.to_thread** for Excel parsing, PDF export.
3. **Reduce staleTime** to 30s for operational data.
4. **Frontend code splitting** in vite.config.ts.
5. **Date library consolidation** to dayjs.
6. **production.py refactor** — split into sub-modules.
7. **get_mill_scope deduplication** — central Depends factory.

### Migration Required
None.

### Success Criteria
- `/api/v1/masters/machines` with 500 machines returns in < 200ms (paginated)
- Excel import of 5000 rows does not block other API requests (verified by concurrent request test)
- Initial JS bundle < 1.5 MB (from ~2.5 MB)
- Dashboard loads in < 1.5s on a 10 Mbps connection

---

## Wave 7 — Production Deployment Readiness
**Duration:** 3 days  
**Goal:** Final hardening, smoke testing, go-live checklist execution.  
**Depends on:** Waves 1–6 complete, Q-01 test suite written.

### Issues in Wave 7
`Q-01, Q-02, DI-01, DI-02, DI-04, PF-01, S-06`

### Actions
1. Run full test suite against staging DB.
2. Upgrade Render to paid tier (always-on).
3. Separate staging and production Supabase projects.
4. Verify all migrations run cleanly on clean DB.
5. Load test: 20 concurrent users for 10 minutes.
6. Security scan: OWASP ZAP against staging.
7. Run go-live checklist (Phase 10).

---

# PHASE 3 — Exact Task List

## Sprint 1 (Wave 1) — Emergency Stabilization

| Task ID | Issue | Title | Files | Migration | Tests | Hours | Priority | Level |
|---|---|---|---|---|---|---|---|---|
| T-001 | A-01 | Increase DB pool to 10/10 | db/session.py | No | Manual | 1 | P0 | Junior |
| T-002 | A-02 | Fail fast on migration error | main.py | No | Yes | 2 | P0 | Mid |
| T-003 | AP-03 | Fix webhook HMAC raw body | billing.py | No | Yes | 2 | P0 | Mid |
| T-004 | DI-01 | Add DB ping to /health | health.py (new) | No | Yes | 2 | P0 | Junior |
| T-005 | AP-07 | Restrict CORS to explicit origins | render.yaml, config.py | No | No | 1 | P0 | Junior |
| T-006 | F-05 | Remove hardcoded API URL fallback | src/lib/api.ts | No | No | 0.5 | P0 | Junior |
| T-007 | S-03 | Add RAZORPAY_SECRET to check_secrets | config.py | No | No | 0.5 | P0 | Junior |
| T-008 | AP-01 | Batch 1: Remove bare except in production.py, dashboard.py | production.py, dashboard.py | No | Yes | 4 | P0 | Mid |
| T-009 | A-05 | Replace _FILE_STORE with /tmp + TTL | imports.py | No | Yes | 3 | P0 | Mid |

**Sprint 1 Total: 16 hours**

---

## Sprint 2 (Wave 2) — Security Hardening

| Task ID | Issue | Title | Files | Migration | Tests | Hours | Priority | Level |
|---|---|---|---|---|---|---|---|---|
| T-010 | F-01/S-01 | Move JWT from localStorage to sessionStorage | auth.ts, api.ts | No | Yes | 4 | P0 | Mid |
| T-011 | S-02 | Set SameSite=Strict on refresh cookie | auth.py | No | Yes | 1 | P0 | Junior |
| T-012 | S-06 | Revoke sessions on password change | auth.py, user_sessions | No | Yes | 2 | P0 | Mid |
| T-013 | AP-02 | Add require_module to all import endpoints | imports.py | No | Yes | 2 | P0 | Junior |
| T-014 | AP-04 | Add @limiter.limit to import/export endpoints | imports.py, exports.py | No | Yes | 2 | P0 | Junior |
| T-015 | DI-04 | Configure SlowAPI with Redis backend | limiter.py | No | Yes | 2 | P1 | Mid |
| T-016 | S-04 | Per-user OTP rate limit via Redis | auth.py | No | Yes | 3 | P1 | Mid |
| T-017 | S-05 | Add audit log to all export endpoints | exports.py | No | Yes | 2 | P1 | Junior |
| T-018 | AP-01 | Batch 2: Remove bare except in hr.py, imports.py, billing.py | hr.py, imports.py, billing.py | No | Yes | 6 | P1 | Mid |

**Sprint 2 Total: 24 hours**

---

## Sprint 3 (Wave 3) — Multi-Tenant Corrections (Part A: Data Audit)

| Task ID | Issue | Title | Files | Migration | Tests | Hours | Priority | Level |
|---|---|---|---|---|---|---|---|---|
| T-019 | A-03 | Add User.company_id FK | user.py, migration 023 | Yes | Yes | 3 | P0 | Senior |
| T-020 | A-03 | Data audit: find orphaned company_ids | SQL script | No | No | 2 | P0 | Senior |
| T-021 | A-04 | Data audit: find duplicate codes across mills (all 14 tables) | SQL audit script | No | No | 4 | P0 | Senior |
| T-022 | A-04 | Batch 1: Machine.code, Customer.code, Route.code | masters.py, migration 024 | Yes | Yes | 6 | P0 | Senior |
| T-023 | A-04 | Batch 2: Dispatch.dispatch_no, Lot.lot_no, Trip.trip_no | dispatch.py, inventory.py, lotrac.py, migration 025 | Yes | Yes | 6 | P0 | Senior |
| T-024 | A-04 | Batch 3: Supplier.code, CottonBale.bale_number, Invoice.invoice_no | purchase.py, accounts.py, migration 026 | Yes | Yes | 6 | P0 | Senior |
| T-025 | A-04 | Batch 4: InventoryItem + mill_id, Warehouse.code, Technician.code, SalesOrder.so_no | inventory.py, stock.py, maintenance.py, migration 027 | Yes | Yes | 6 | P1 | Senior |
| T-026 | DF-01 | Add machine scope validation in ProductionService | production.py | No | Yes | 2 | P0 | Mid |
| T-027 | D-06 | Add mill_id to InventoryItem, backfill | inventory.py, migration 027 | Yes | Yes | 4 | P1 | Senior |
| T-028 | E-04 | Shift UniqueConstraint per mill | production.py, migration 028 | Yes | Yes | 2 | P1 | Mid |

**Sprint 3 Total: 41 hours**

---

## Sprint 4 (Wave 4) — Database Integrity

| Task ID | Issue | Title | Files | Migration | Tests | Hours | Priority | Level |
|---|---|---|---|---|---|---|---|---|
| T-029 | D-05 | Audit monthly_payroll vs payroll_months; migrate to canonical model | hr.py, payroll.py, SQL | Yes | Yes | 8 | P0 | Principal |
| T-030 | D-04 | Add composite indexes | models/*.py, migration 029 | Yes | No | 3 | P1 | Mid |
| T-031 | D-02 | Add cascade deletes + SoftDeleteMixin to Employee, Lot, Dispatch | models/*.py, migration 030 | Yes | Yes | 6 | P1 | Senior |
| T-032 | D-01 | Add machine_id UUID FK to ProductionEntry, DowntimeLog, WasteEntry | production.py, migration 031 | Yes | Yes | 8 | P1 | Senior |
| T-033 | D-03 | Migrate date columns to DATE type (high-priority tables: production_entries, downtime_logs, waste_entries) | models/production.py, migration 032 | Yes | Yes | 6 | P1 | Senior |
| T-034 | AP-06 | Fix N+1 HR queries with selectinload | hr.py | No | Yes | 4 | P1 | Mid |
| T-035 | AP-01 | Batch 3: Remove bare except in remaining 18 API files | All remaining API files | No | Yes | 8 | P1 | Mid |

**Sprint 4 Total: 43 hours**

---

## Sprint 5 (Wave 5) — Production Workflow Completion

| Task ID | Issue | Title | Files | Migration | Tests | Hours | Priority | Level |
|---|---|---|---|---|---|---|---|---|
| T-036 | E-03 | Add lot_id to ProductionEntry | production.py, migration 033 | Yes | Yes | 6 | P0 | Senior |
| T-037 | F-02 | Add Zod schemas to production forms | _app.production.tsx | No | Yes | 6 | P0 | Mid |
| T-038 | F-02 | Add Zod schemas to HR, payroll, dispatch forms | _app.hr.tsx, _app.payroll.tsx, _app.dispatch.tsx | No | Yes | 8 | P1 | Mid |
| T-039 | E-02 | Server-side waste % validation | production_v2.py | No | Yes | 3 | P1 | Mid |
| T-040 | E-01 | Standardise efficiency KPI formula | dashboard.py, _app.dashboard.tsx | No | Yes | 4 | P1 | Mid |
| T-041 | E-05 | Payroll finalization lock | payroll.py | No | Yes | 2 | P1 | Mid |
| T-042 | DF-02 | Import atomic transaction with savepoints | imports.py | No | Yes | 4 | P1 | Senior |
| T-043 | DF-03 | QR token expiry | qr_system.py, inventory.py, migration 033 | Yes | Yes | 4 | P1 | Mid |
| T-044 | F-03 | Add queryClient.invalidateQueries to all mutations | All frontend routes | No | Yes | 6 | P1 | Mid |
| T-045 | F-04 | Clear all query cache on mill switch | auth.ts | No | Yes | 1 | P1 | Junior |
| T-046 | F-06 | Add ErrorBoundary to all route components | ErrorBoundary.tsx (new), _app.tsx | No | Yes | 4 | P1 | Mid |

**Sprint 5 Total: 48 hours**

---

## Sprint 6 (Wave 6) — Performance

| Task ID | Issue | Title | Files | Migration | Tests | Hours | Priority | Level |
|---|---|---|---|---|---|---|---|---|
| T-047 | P-01 | Paginate masters/machines, customers endpoints | masters.py | No | Yes | 4 | P1 | Mid |
| T-048 | P-02 | Wrap Excel/PDF processing in asyncio.to_thread | imports.py, exports.py | No | Yes | 3 | P1 | Mid |
| T-049 | P-03 | Reduce operational data staleTime to 30s | _app.production.tsx, _app.hr.tsx | No | No | 2 | P2 | Junior |
| T-050 | TD-03 | Frontend code splitting in vite.config.ts | vite.config.ts | No | No | 3 | P2 | Mid |
| T-051 | TD-04 | Standardise dates to dayjs, create src/lib/date.ts | src/lib/date.ts (new), all routes | No | No | 6 | P2 | Mid |
| T-052 | TD-01 | Refactor production.py into sub-modules | api/v1/production/ (new dir) | No | Yes | 8 | P2 | Senior |
| T-053 | TD-02 | Centralise get_mill_scope into Depends factory | deps.py, all API files | No | Yes | 6 | P2 | Senior |
| T-054 | A-06 | Wrap CPU tasks in asyncio.to_thread | imports.py | No | Yes | 2 | P2 | Mid |

**Sprint 6 Total: 34 hours**

---

## Sprint 7 (Wave 7) — Go-Live Readiness

| Task ID | Issue | Title | Files | Migration | Tests | Hours | Priority | Level |
|---|---|---|---|---|---|---|---|---|
| T-055 | Q-01 | Write integration tests for all P0 endpoints | tests/test_production.py, test_auth.py, test_hr.py | No | N/A | 24 | P0 | Senior |
| T-056 | Q-01 | Write unit tests for payroll formulas | tests/test_payroll.py | No | N/A | 8 | P0 | Mid |
| T-057 | Q-01 | Write frontend tests with vitest | src/**/*.test.ts | No | N/A | 16 | P1 | Mid |
| T-058 | Q-02 | Create seed_dev.py script | backend/scripts/seed_dev.py | No | No | 6 | P1 | Mid |
| T-059 | DI-02 | Separate staging/production Supabase projects | render.yaml, .env.production | No | No | 4 | P0 | Senior |
| T-060 | DI-03 | Document backup procedure; set up verification | docs/BACKUP.md | No | No | 3 | P1 | Mid |
| T-061 | PF-01 | Upgrade Render to paid always-on tier | render.yaml | No | No | 1 | P0 | Junior |

**Sprint 7 Total: 62 hours**

---

## Grand Total

| Wave | Tasks | Hours | Duration |
|---|---|---|---|
| Wave 1 — Emergency Stabilization | 9 | 16 | 3 days |
| Wave 2 — Security Hardening | 9 | 24 | 4 days |
| Wave 3 — Multi-Tenant Corrections | 10 | 41 | 7 days |
| Wave 4 — Database Integrity | 7 | 43 | 7 days |
| Wave 5 — Production Workflow | 11 | 48 | 8 days |
| Wave 6 — Performance | 8 | 34 | 6 days |
| Wave 7 — Go-Live Readiness | 7 | 62 | 10 days |
| **TOTAL** | **61 tasks** | **268 hours** | **~45 working days** |

---

# PHASE 4 — Migration Safety Review

## Migration Execution Protocol (All Migrations)

**Before every migration:**
1. Backup Supabase project (Dashboard → Database → Backups → Create manual backup)
2. Run migration on staging first; verify on staging for 24 hours
3. Run pre-check SQL queries (see per-migration below)
4. Schedule maintenance window (shift change gap: 02:00–03:00 IST)
5. Have rollback command ready in a terminal

**Migration command:**
```bash
DATABASE_URL="postgresql+asyncpg://..." PYTHONPATH=/path/to/backend alembic upgrade head
```

**Rollback command:**
```bash
alembic downgrade -1
```

---

## Migration 023 — User.company_id FK

**Pre-check:**
```sql
-- Find orphaned users (company_id not in companies table)
SELECT id, email, company_id FROM users
WHERE company_id IS NOT NULL
AND company_id NOT IN (SELECT id FROM companies);
-- Expected: 0 rows. If any rows exist, fix them before running migration.
```

**Downtime:** Zero — adding a FK to an existing column with `NOT VALID` in PostgreSQL is near-instant.  
**Rollback:** `ALTER TABLE users DROP CONSTRAINT fk_users_company_id;`  
**Risk:** LOW

---

## Migrations 024–027 — Global Unique → Per-Mill Unique (HIGHEST RISK)

**Pre-check (run for each table before its migration):**
```sql
-- Example for machines — run equivalent for each table
SELECT code, COUNT(DISTINCT mill_id) as mills, COUNT(*) as total
FROM machines
GROUP BY code
HAVING COUNT(DISTINCT mill_id) > 1;
-- Expected: 0 rows. If any rows exist, the migration will fail.
-- If rows exist, either rename conflicting codes or accept they are intentional cross-mill duplicates.
```

**Migration strategy:**
```python
# In upgrade():
# Step 1: DROP the global unique index
op.drop_index("ix_machines_code_unique", table_name="machines")  # or DROP CONSTRAINT
# Step 2: CREATE composite unique index
op.create_unique_constraint("uq_machines_code_mill", "machines", ["code", "mill_id"])
```

**Downtime:** Zero (creating new index concurrent; dropping old is fast).  
**Rollback:**
```python
# In downgrade():
op.drop_constraint("uq_machines_code_mill", "machines")
op.create_unique_constraint("uq_machines_code", "machines", ["code"])
# WARNING: Will fail if duplicate codes exist after rollback
```

**Post-migration validation:**
```sql
SELECT conname, contype FROM pg_constraint WHERE conname LIKE 'uq_machines%';
-- Should show uq_machines_code_mill, NOT the old uq_machines_code
```

**Risk:** HIGH — run data audit first. Back up DB. Test on staging with production data copy.

---

## Migration 028 — Shift UniqueConstraint

**Pre-check:**
```sql
SELECT name, mill_id, COUNT(*) FROM shifts GROUP BY name, mill_id HAVING COUNT(*) > 1;
-- Expected: 0 rows
```
**Risk:** LOW

---

## Migration 029 — Composite Indexes

**Notes:** Adding indexes is non-blocking in PostgreSQL with `CREATE INDEX CONCURRENTLY`. No downtime. No rollback needed (dropping an index has no data impact).  
**Risk:** LOW

---

## Migration 030 — Cascade Deletes + SoftDeleteMixin

**Pre-check:**
```sql
-- Find production_entries whose machine_code has no matching machine
SELECT COUNT(*) FROM production_entries pe
WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.code = pe.machine_code);
-- Must be 0 before adding FK constraints
```

**Risk:** MEDIUM — FK constraints can be added with `NOT VALID` for immediate application, then `VALIDATE` separately during low-traffic window.

---

## Migration 031 — Add machine_id UUID FK to ProductionEntry

**Strategy:** Add `machine_id` as nullable first. Backfill from JOIN with machines. Then add NOT NULL if desired.  
**Backfill SQL:**
```sql
UPDATE production_entries pe
SET machine_id = m.id
FROM machines m
WHERE m.code = pe.machine_code;
```
**Expected downtime:** Zero (nullable column add is instant; UPDATE can run online).  
**Risk:** LOW for adding column; MEDIUM for backfill (locks rows briefly — run in batches of 1000).

---

## Migration 032 — String → DATE type

**Strategy for each column:**
```sql
ALTER TABLE production_entries
  ALTER COLUMN date TYPE DATE USING date::DATE;
```

**Pre-check:**
```sql
-- Find rows with invalid date strings
SELECT COUNT(*) FROM production_entries WHERE date !~ '^\d{4}-\d{2}-\d{2}$';
-- Must be 0
```

**Risk:** MEDIUM — any invalid date string (NULL, garbage, wrong format) will fail the USING cast. Pre-check is critical.

---

## Migration 033 — ProductionEntry.lot_id + QR expiry

**Risk:** LOW — all new nullable columns.

---

# PHASE 5 — Testing Strategy

## Test Infrastructure Setup

```
backend/tests/
├── conftest.py          — pytest fixtures, test DB, auth helpers
├── test_auth.py         — login, refresh, OTP, lockout
├── test_production.py   — entries, stoppage, waste, manpower
├── test_hr.py           — employee CRUD, bulk import
├── test_payroll.py      — payroll formulas, finalization
├── test_billing.py      — webhook HMAC, subscription
├── test_tenant.py       — multi-tenant isolation (critical)
├── test_migrations.py   — migration chain integrity
└── test_security.py     — auth bypass attempts, RBAC

src/__tests__/
├── auth.test.ts         — login flow, token storage
├── production.test.ts   — form validation, submission
├── hrForm.test.ts       — employee form Zod validation
└── millSwitch.test.ts   — cache clearing on mill change
```

---

## Unit Tests

### Payroll Formula Tests
```python
def test_basic_wage_calculation():
    # 26 payable days, ₹400/day wage = ₹10,400
    assert calculate_basic_wage(daily_wage=400, payable_days=26) == 10400

def test_pf_deduction():
    # PF = 12% of basic, capped at ₹1,800
    assert calculate_pf(basic=20000) == 1800
    assert calculate_pf(basic=5000) == 600

def test_overtime_calculation():
    # OT = 2x daily rate / 8 hours
    assert calculate_ot(daily_wage=400, ot_hours=4) == 400  # (400/8)*4*2
```

### Efficiency Formula Tests
```python
def test_efficiency_zero_target():
    result = compute_efficiency(actual_kg=100, target_kg=0)
    assert result is None  # Not Infinity

def test_efficiency_normal():
    result = compute_efficiency(actual_kg=85, target_kg=100)
    assert result == 85.0
```

---

## Integration Tests (Critical Path)

### Multi-Tenant Isolation (MOST IMPORTANT)
```python
async def test_mill_a_cannot_see_mill_b_production():
    # Create entries for mill A and mill B
    token_a = login("operator_a@mill-a.com")
    token_b = login("operator_b@mill-b.com")
    
    entry = create_production_entry(token_a, mill_id=MILL_A_ID)
    
    response = get_production_entries(token_b)  # Mill B user
    ids = [e["id"] for e in response["data"]]
    
    assert entry["id"] not in ids  # Mill A entry NOT visible to Mill B

async def test_machine_code_scoped_to_mill():
    # Both mills can have machine code BL-01
    create_machine(MILL_A_TOKEN, code="BL-01", mill_id=MILL_A_ID)  # OK
    create_machine(MILL_B_TOKEN, code="BL-01", mill_id=MILL_B_ID)  # Must also be OK
    
async def test_import_requires_module_access():
    token = login_as("QUALITY_CHECKER")  # No HR module
    response = parse_import_file(token, module="hr", file=sample_excel)
    assert response.status_code == 403
```

### Stoppage Log Tests
```python
async def test_log_stoppage_success():
    body = {"machine_code": "BL-01", "datalog_code": 7, "stop_from": "08:30", "stop_to": "09:15"}
    response = await client.post("/api/v1/production/downtime/datalog", json=body, headers=auth)
    assert response.status_code == 200
    assert response.json()["stop_from"] == "08:30"

async def test_log_stoppage_invalid_time_format():
    body = {"machine_code": "BL-01", "datalog_code": 7, "stop_from": "8:30", "stop_to": "9:15"}  # no leading zero
    response = await client.post("/api/v1/production/downtime/datalog", json=body, headers=auth)
    assert response.status_code in (200, 400)  # Define and enforce format
```

### Migration Chain Test
```python
def test_migration_chain_integrity():
    # Every migration has a valid down_revision pointing to previous
    revisions = get_all_revisions()
    for rev in revisions:
        if rev.down_revision:
            assert rev.down_revision in [r.revision for r in revisions]
```

---

## API Security Tests

```python
async def test_no_unauthenticated_access():
    protected_endpoints = [
        ("GET", "/api/v1/production/entries"),
        ("POST", "/api/v1/hr/employees"),
        ("GET", "/api/v1/dashboard/summary"),
        ("GET", "/api/v1/payroll/months"),
    ]
    for method, path in protected_endpoints:
        response = await client.request(method, path)  # No auth header
        assert response.status_code == 401

async def test_brute_force_lockout():
    for _ in range(6):
        await client.post("/api/v1/auth/login", json={"email": "x@x.com", "password": "wrong"})
    response = await client.post("/api/v1/auth/login", json={"email": "x@x.com", "password": "wrong"})
    assert response.status_code == 429  # Rate limited

async def test_webhook_rejects_invalid_signature():
    response = await client.post("/api/v1/subscription/webhook",
        json={"event": "payment.captured"},
        headers={"x-razorpay-signature": "bad_sig"})
    assert response.status_code == 400
```

---

## Load Tests

```python
# locust loadtest.py
class SpinFlowUser(HttpUser):
    wait_time = between(1, 3)
    
    @task(5)
    def get_production_entries(self):
        self.client.get("/api/v1/production/entries?page=1&page_size=20",
                       headers={"Authorization": f"Bearer {TOKEN}"})
    
    @task(3)
    def create_production_entry(self):
        self.client.post("/api/v1/production/entries",
                        json={"machine_code": "BL-01", "actual_kg": 85, "date": "2026-06-11", "shift": "A"},
                        headers={"Authorization": f"Bearer {TOKEN}"})
    
    @task(1)
    def get_dashboard(self):
        self.client.get("/api/v1/dashboard/summary",
                       headers={"Authorization": f"Bearer {TOKEN}"})

# Run: locust -f loadtest.py --host=https://spinflow.onrender.com --users=20 --spawn-rate=2
# Target: 20 concurrent users, p95 response time < 1s, 0 errors over 10 minutes
```

---

# PHASE 6 — Missing ERP Modules Roadmap

## What Spinning Mills Need That SpinFlow Is Missing

| # | Module | Description | Business Value | Dev Effort | ROI |
|---|---|---|---|---|---|
| 1 | **Production Planning Board** | Daily/weekly target vs actual by machine, visual shift planner | 🔴 Critical | 10 days | Very High |
| 2 | **Lot Traceability Engine** | Full bale-to-dispatch chain: cotton bale → blow room → carding → combing → drawing → ring frame → winding → cone → bag → dispatch | 🔴 Critical | 15 days | Very High |
| 3 | **Shift Logbook** | Supervisor's digital shift report: production, stoppages, quality, headcount, issues | 🔴 Critical | 7 days | Very High |
| 4 | **Quality Workflow** | Sample collection → lab test → pass/fail → lot release → QA approval chain | 🔴 Critical | 12 days | High |
| 5 | **Machine Monitoring Dashboard** | Real-time machine status (running/stopped/maintenance), OEE calculation | 🟠 High | 20 days | Very High |
| 6 | **Customer Order Planning** | SO → production schedule → delivery commitment | 🟠 High | 10 days | High |
| 7 | **Waste Analysis Report** | Department-wise waste trend, machine-wise waste variance, benchmark vs actuals | 🟠 High | 5 days | High |
| 8 | **Cotton Consumption Tracker** | Bale consumption per mixing recipe, staple count consumption per lot | 🟠 High | 8 days | High |
| 9 | **Inter-Department Transfer** | Formal handover between blow room → carding → ring frame with quantity tracking | 🟠 High | 8 days | High |
| 10 | **Cone/Package Inventory** | Cone count, weight per package, warehouse slot tracking | 🟡 Medium | 6 days | Medium |
| 11 | **TFO / Doubling Module** | Twisted yarn count management, doubling production tracking | 🟡 Medium | 8 days | Medium |
| 12 | **Mobile Supervisor App** | React Native PWA for shift supervisors: quick entry, QR scan, approvals | 🟡 Medium | 20 days | High |
| 13 | **Maintenance Work Order** | Preventive/breakdown maintenance scheduler, spare parts consumption | 🟡 Medium | 10 days | Medium |
| 14 | **Purchase Order Workflow** | Cotton PO → GRN → bale tagging → storage → mixing linkage | 🟡 Medium | 10 days | High |
| 15 | **Electricity/Utility Tracking** | Units per kg production, department-wise consumption, cost per unit | 🟢 Low | 5 days | Medium |
| 16 | **IoT Machine Integration** | OPC-UA / Modbus data from spinning frames → automatic production entries | 🟢 Low | 30 days | Very High (long-term) |
| 17 | **AI Production Forecasting** | ML model: predict next-day production based on machine age, cotton grade, humidity | 🟢 Low | 20 days | Medium (requires data) |
| 18 | **WhatsApp/SMS Alerts** | Stoppage > X minutes → WhatsApp alert to supervisor; payroll ready → employee SMS | 🟢 Low | 5 days | High |

---

# PHASE 7 — Enterprise Roadmap

## 30-Day Plan (Days 1–30)
**Theme: "Make it safe to run in production"**

**Sprints 1–3 (Waves 1–2):**
- All P0 emergency fixes live
- All security hardening live
- DB pool stable at 20 concurrent users
- Import RBAC enforced
- JWT not in localStorage

**Infrastructure:**
- Render paid tier
- Staging Supabase separate from production
- Redis for rate limiting

**Testing:**
- 30 integration tests for critical endpoints
- Passing on every push via CI

**Expected Outcome:** System is safe to demonstrate to first mill. No crash risk under normal use.

---

## 60-Day Plan (Days 31–60)
**Theme: "Make it correct for multi-mill SaaS"**

**Sprints 4–5 (Waves 3–4):**
- All 14 global unique constraints resolved
- machine_id UUID FK deployed
- Multi-tenant isolation verified via automated tests
- Payroll models deduplicated
- Employee import fully working for 5+ mills

**ERP Features:**
- Lot traceability: ProductionEntry linked to Lot
- Waste % server-side validation
- QR token expiry enforced
- Efficiency KPI formula standardised

**Testing:**
- 80 integration tests
- Multi-tenant isolation test suite
- Nightly test run on staging

**Expected Outcome:** Second mill can be onboarded without data conflicts.

---

## 90-Day Plan (Days 61–90)
**Theme: "Make it fast and complete enough for 24/7 mill operation"**

**Sprints 6–7 (Waves 5–6):**
- All production workflow features complete
- Pagination on all list endpoints
- Frontend code splitting (< 1.5 MB bundle)
- Error boundaries, Zod validation
- Zod on all forms

**New Modules (from Phase 6):**
- Production Planning Board
- Shift Logbook
- Quality Workflow (phase 1: sample → test → pass/fail)

**Testing:**
- Load test: 20 concurrent users × 10 minutes, 0 errors
- Security: OWASP ZAP scan, 0 high/critical findings
- Full go-live checklist passed

**Expected Outcome:** First mill can go live in production. 24/7 operation supported.

---

## 180-Day Plan (Days 91–180)
**Theme: "Full ERP — replace every paper register"**

**Modules:**
- Lot Traceability Engine (full bale-to-dispatch chain)
- Machine Monitoring Dashboard (manual status entry → later IoT)
- Customer Order Planning
- Inter-Department Transfer module
- Maintenance Work Order system
- Cotton Consumption Tracker
- Waste Analysis Reports
- Purchase Order Workflow
- WhatsApp/SMS alert integration (Twilio / Meta API)

**Infrastructure:**
- Horizontal scaling: 2 Render instances behind load balancer
- Database read replica for reporting queries
- Redis job queue (Celery/ARQ) for async tasks (bulk export, report generation)
- Sentry error tracking
- Grafana/PostHog for usage analytics

**Security:**
- Annual penetration test
- SOC 2 readiness assessment
- GDPR/PDPA compliance review (employee PII)

**Expected Outcome:** SpinFlow replaces all paper registers and Excel sheets across 3+ mills.

---

## 365-Day Plan (Days 181–365)
**Theme: "SaaS Scale — 10 companies, 25+ mills"**

**Architecture:**
- Move from Supabase shared to dedicated PostgreSQL cluster
- pgBouncer connection pooling
- CDN for static assets (Cloudflare)
- React Native mobile app for supervisors (PWA first)
- Multi-region deployment (India + MENA if needed)

**AI/ML Features:**
- Production forecasting: predict next-day output by machine and cotton grade
- Quality prediction: flag lots likely to fail based on cotton parameters
- Anomaly detection: flag unusual waste spikes, stoppage patterns
- Chatbot for shift supervisors: "What was yesterday's efficiency for Department 3?"

**IoT Integration:**
- OPC-UA data connector for Rieter/LMW machine PLCs
- Automatic production entry creation from machine data
- Real-time OEE dashboard (Availability × Performance × Quality)

**Business Metrics:**
- ≥ 10 paying companies
- ≥ 25 mills onboarded
- ₹50L ARR target
- NPS score > 40 from mill managers

---

# PHASE 8 — GitHub Project Structure

## Epic → Feature → Story → Subtask

```
EPIC E1: Emergency Stabilization
├── Feature F1.1: Database Stability
│   ├── Story S1.1.1: Increase connection pool to 10/10 [T-001]
│   │   Acceptance: DB handles 10 concurrent inserts without timeout
│   │   Definition of Done: pool_size=10 in session.py; Render env var updated; smoke tested
│   └── Story S1.1.2: Fail-fast on migration error [T-002]
│       Acceptance: Broken migration causes Render health check to fail
│       Definition of Done: SystemExit(1) in lifespan; tested with dummy bad migration
│
├── Feature F1.2: Webhook Reliability
│   └── Story S1.2.1: Fix Razorpay HMAC raw body [T-003]
│       Acceptance: Test payment captured event processes correctly
│       Definition of Done: request.body() used; unit test passes; staging payment tested
│
└── Feature F1.3: Observability
    └── Story S1.3.1: DB-aware health check [T-004]
        Acceptance: /health returns 503 if DB unreachable
        Definition of Done: SELECT 1 in health endpoint; Render healthCheckPath confirmed working

---

EPIC E2: Security Hardening
├── Feature F2.1: Token Security
│   ├── Story S2.1.1: Move JWT to sessionStorage [T-010]
│   │   Acceptance: localStorage has no JWT after login
│   │   Definition of Done: auth.ts partialize removes token; manual browser inspection confirms; users re-auth on tab close (documented)
│   └── Story S2.1.2: SameSite=Strict refresh cookie [T-011]
│       Acceptance: Cookie has SameSite=Strict attribute
│       Definition of Done: browser devtools confirms; CSRF test fails (cannot trigger from attacker origin)
│
├── Feature F2.2: Access Control
│   ├── Story S2.2.1: require_module on import endpoints [T-013]
│   │   Acceptance: QUALITY_CHECKER gets 403 on /imports/parse with module=hr
│   │   Definition of Done: All 4 import endpoints use require_module; test passes
│   └── Story S2.2.2: Rate limit import/export [T-014]
│       Acceptance: 21st request in 1 minute returns 429
│       Definition of Done: @limiter decorators on all endpoints; test confirms 429
│
└── Feature F2.3: Audit
    └── Story S2.3.1: Export audit log [T-017]
        Acceptance: Every export creates a row in audit_logs
        Definition of Done: log_audit() called in all export endpoints; DB row confirmed after export

---

EPIC E3: Multi-Tenant Corrections
├── Feature F3.1: User Referential Integrity
│   └── Story S3.1.1: User.company_id FK [T-019, T-020]
│       Acceptance: Creating user with invalid company_id fails with FK error
│       Definition of Done: Migration 023 applied; pre-check SQL returns 0 rows; FK tested
│
├── Feature F3.2: Per-Mill Unique Constraints
│   ├── Story S3.2.1: Machine/Customer/Route codes per mill [T-022]
│   ├── Story S3.2.2: Dispatch/Lot/Trip codes per mill [T-023]
│   ├── Story S3.2.3: Supplier/Bale/Invoice codes per mill [T-024]
│   └── Story S3.2.4: Inventory/Warehouse/Technician/SO codes per mill [T-025]
│       Acceptance for each: Two mills can create records with identical codes
│       Definition of Done: Migration applied; integration test confirms two-mill scenario works
│
└── Feature F3.3: Machine Scope in Production
    └── Story S3.3.1: Validate machine belongs to mill on entry [T-026]
        Acceptance: Production entry with machine from another mill returns 400
        Definition of Done: ProductionService validates mill scope; test confirms

---

EPIC E4: Database Integrity
├── Feature F4.1: Payroll Consolidation [T-029]
├── Feature F4.2: Composite Indexes [T-030]
├── Feature F4.3: Cascade Deletes [T-031]
├── Feature F4.4: UUID Machine FK [T-032]
└── Feature F4.5: Date Type Migration [T-033]

---

EPIC E5: Production Workflow Completion
├── Feature F5.1: Lot Traceability [T-036]
├── Feature F5.2: Form Validation [T-037, T-038]
├── Feature F5.3: Waste & Efficiency [T-039, T-040]
├── Feature F5.4: Payroll Lock [T-041]
├── Feature F5.5: Import Reliability [T-042]
└── Feature F5.6: Frontend Stability [T-043, T-044, T-045, T-046]

---

EPIC E6: Performance [T-047 to T-054]
EPIC E7: Testing [T-055 to T-060]
EPIC E8: Infrastructure [T-059, T-060, T-061]
```

---

# PHASE 9 — Claude Code Execution Order

## Exact Prompts for Each Wave

---

### Prompt W1 — Wave 1: Emergency Stabilization

```
You are working on SpinFlow ERP (FastAPI + React).

CONTEXT: Production system for a spinning mill. DB is Supabase PostgreSQL. 
Backend: /Users/kannaa/millflow/backend
Frontend: /Users/kannaa/millflow/src

TASKS TO EXECUTE (in order, do not skip any):

1. backend/app/db/session.py
   Change pool_size=3 to pool_size=10
   Change max_overflow=2 to max_overflow=10

2. backend/app/main.py — lifespan function
   In the migration exception handler, replace the current except block with:
     except Exception as exc:
         logger.critical(f"FATAL: Migration failed — {exc}", exc_info=True)
         raise SystemExit(1)

3. backend/app/api/v1/billing.py — billing_webhook function
   Replace json.dumps(payload) body construction with:
     body_bytes = await request.body()
     expected = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), body_bytes, hashlib.sha256).hexdigest()
   Remove the json.dumps line.

4. backend/app/api/v1/ — create new file health.py if not exists
   Add a GET /health endpoint that does:
     await db.execute(text("SELECT 1"))
     return {"status": "ok", "db": "connected"}
   Register it in main.py if not already registered.

5. backend/app/core/config.py — check_secrets()
   Add RAZORPAY_WEBHOOK_SECRET to the list of required secrets.

6. src/lib/api.ts — first line after imports
   Change: const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://spinflow.onrender.com"
   To: const API_BASE = import.meta.env.VITE_API_BASE_URL
       if (!API_BASE) throw new Error("VITE_API_BASE_URL is not set. Check your .env file.")

7. render.yaml — CORS_ORIGINS
   Remove any wildcard regex. Set CORS_ORIGINS to explicit production domain only.

8. backend/app/api/v1/production.py — the get_entries endpoint
   Find the outer try/except that catches Exception and returns {"total":0,"data":[]}
   Replace the except block with:
     except Exception as e:
         logger.error(f"production.entries list error: {e}", exc_info=True)
         raise HTTPException(status_code=500, detail="Failed to retrieve production entries")

9. backend/app/api/v1/dashboard.py
   Find the outer try/except wrapping KPI queries. 
   Replace return of zeroed data with:
     raise HTTPException(status_code=500, detail="Failed to compute dashboard KPIs")

VERIFICATION BEFORE COMMITTING:
- python3 -c "from app.main import app; print('OK')"
- npx tsc --noEmit (0 errors)
- npx vite build (0 errors)

COMMIT MESSAGE: "fix(wave1): emergency stabilization — pool, migration fail-fast, webhook HMAC, health check"
```

---

### Prompt W2 — Wave 2: Security Hardening

```
You are working on SpinFlow ERP. Wave 1 is complete.

CONTEXT: 
- JWT access token is currently stored in Zustand persist → localStorage
- Import endpoints use get_current_user instead of require_module
- SlowAPI uses in-memory storage (lost on restart)
- Refresh cookie is SameSite=Lax (should be Strict)

TASKS TO EXECUTE (in order):

1. src/stores/auth.ts
   In the `partialize` function, REMOVE `token` from the persisted keys:
     partialize: (state) => ({
       user: state.user,
       // token: state.token,  <-- REMOVE THIS LINE
       isAuthenticated: state.isAuthenticated,
       activeMill: state.activeMill,
     }),
   The token will only live in memory (Zustand state, not persisted).
   
2. backend/app/api/v1/auth.py — _set_refresh_cookie function
   Change samesite="lax" to samesite="strict"

3. backend/app/api/v1/auth.py — change_password endpoint
   After successfully changing password, add:
     await db.execute(
         update(UserSession).where(UserSession.user_id == current_user.id).values(is_active=False)
     )
     await db.commit()

4. backend/app/api/v1/imports.py
   Change the following endpoints from get_current_user to require_module:
     /imports/parse      → require_module("masters")
     /imports/validate   → require_module("masters")
     /imports/commit     → require_module("masters", write=True)
   The module parameter should be taken from the request body/form when the module differs.
   For HR imports: require_module("hr", write=True)
   For production imports: require_module("production", write=True)

5. backend/app/api/v1/imports.py — _FILE_STORE
   Replace the in-memory dict with /tmp file storage:
     import tempfile, pickle, time
     _TEMP_DIR = Path(tempfile.gettempdir()) / "spinflow_imports"
     _TEMP_DIR.mkdir(exist_ok=True)
     
     def _save_file(file_id, content, meta):
         ((_TEMP_DIR / f"{file_id}.bin")).write_bytes(pickle.dumps({"content": content, "meta": meta, "ts": time.time()}))
     
     def _load_file(file_id):
         path = _TEMP_DIR / f"{file_id}.bin"
         if not path.exists(): return None, None
         data = pickle.loads(path.read_bytes())
         if time.time() - data["ts"] > 1800: path.unlink(); return None, None  # 30 min TTL
         return data["content"], data["meta"]
     
     def _delete_file(file_id):
         (_TEMP_DIR / f"{file_id}.bin").unlink(missing_ok=True)

6. backend/app/core/limiter.py
   Configure Redis backend if REDIS_URL is set:
     from app.core.config import settings
     storage_uri = settings.REDIS_URL if settings.REDIS_URL else "memory://"
     limiter = Limiter(key_func=get_remote_address, default_limits=[...], storage_uri=storage_uri)

7. backend/app/api/v1/imports.py, exports.py
   Add @limiter.limit("20/minute") to all import endpoints
   Add @limiter.limit("60/minute") to all export endpoints

8. backend/app/api/v1/exports.py
   At the start of each export handler, add:
     await log_audit(db, current_user.id, role_code, "export", module_name, None, f"Exported data")

VERIFICATION:
- Run the test: GET /api/v1/imports/parse without auth → 401
- Run the test: GET /api/v1/imports/parse with QUALITY_CHECKER token and module=hr → 403
- browser localStorage should show no 'spinflow-auth' with token key after login

COMMIT: "fix(wave2): security hardening — JWT sessionStorage, SameSite=Strict, import RBAC, file store TTL, Redis rate limit"
```

---

### Prompt W3A — Wave 3: Pre-Migration Data Audit

```
You are the Principal Engineer for SpinFlow ERP. 
Before running multi-tenant migrations, run these SQL audits on the production database.
DO NOT run any migrations yet. Only produce the audit report.

Connect to Supabase and run each query. Report the results.

QUERY 1 — Orphaned users:
SELECT id, email, company_id FROM users
WHERE company_id IS NOT NULL
AND company_id NOT IN (SELECT id FROM companies);

QUERY 2–15 — For each globally unique column, find duplicates across mills:
SELECT 'machines' as tbl, code, COUNT(*) FROM machines GROUP BY code HAVING COUNT(*) > 1;
SELECT 'customers' as tbl, code, COUNT(*) FROM customers GROUP BY code HAVING COUNT(*) > 1;
SELECT 'dispatches' as tbl, dispatch_no, COUNT(*) FROM dispatches GROUP BY dispatch_no HAVING COUNT(*) > 1;
SELECT 'lots' as tbl, lot_no, COUNT(*) FROM lots GROUP BY lot_no HAVING COUNT(*) > 1;
SELECT 'trips' as tbl, trip_no, COUNT(*) FROM trips GROUP BY trip_no HAVING COUNT(*) > 1;
SELECT 'suppliers' as tbl, code, COUNT(*) FROM suppliers GROUP BY code HAVING COUNT(*) > 1;
SELECT 'cotton_bales' as tbl, bale_number, COUNT(*) FROM cotton_bales GROUP BY bale_number HAVING COUNT(*) > 1;
SELECT 'invoices' as tbl, invoice_no, COUNT(*) FROM invoices GROUP BY invoice_no HAVING COUNT(*) > 1;
SELECT 'technicians' as tbl, code, COUNT(*) FROM technicians GROUP BY code HAVING COUNT(*) > 1;
SELECT 'sales_orders' as tbl, so_no, COUNT(*) FROM sales_orders GROUP BY so_no HAVING COUNT(*) > 1;

If any query returns rows:
  - List the conflicting values
  - Propose a rename strategy (e.g., append mill code: "BL-01" → "MILL1-BL-01")
  - Do NOT proceed to Wave 3 migrations until all conflicts are resolved

Expected result for a single-mill system: ALL queries return 0 rows.
```

---

### Prompt W3B — Wave 3: Multi-Tenant Migrations

```
You are implementing Wave 3 of the SpinFlow remediation plan.
Pre-condition: All data audit queries returned 0 rows.

CREATE THE FOLLOWING MIGRATIONS:

Migration 023 — backend/alembic/versions/023_user_company_fk.py
  - Add FK constraint on users.company_id → companies.id
  - Use NOT VALID (immediate) + VALIDATE CONSTRAINT (separate step)
  - down_revision = "022"

Migration 024 — backend/alembic/versions/024_machine_customer_route_unique_per_mill.py  
  - machines: DROP unique constraint on code; ADD UniqueConstraint("code", "mill_id", name="uq_machines_code_mill")
  - customers: same pattern with name="uq_customers_code_mill"
  - master_routes: same with name="uq_routes_code_mill"
  - master_vehicles: same with name="uq_vehicles_no_mill" (on vehicle_no + mill_id)
  - down_revision = "023"

Migration 025 — backend/alembic/versions/025_dispatch_lot_trip_unique_per_mill.py
  - dispatches: DROP unique on dispatch_no; ADD UniqueConstraint("dispatch_no","mill_id")
    Note: Dispatch model doesn't have mill_id — ADD mill_id column first (nullable)
  - lots: DROP unique on lot_no; UniqueConstraint already has mill_id — just change constraint
  - trips: DROP unique on trip_no; ADD UniqueConstraint("trip_no","mill_id")
  - down_revision = "024"

Migration 026 — backend/alembic/versions/026_supplier_bale_invoice_unique_per_mill.py
  - suppliers: DROP unique on code; ADD mill_id if missing; UniqueConstraint("code","mill_id")
  - cotton_bales: DROP unique on bale_number; ADD mill_id; UniqueConstraint("bale_number","mill_id")
  - invoices: DROP unique on invoice_no; ADD mill_id if missing; UniqueConstraint("invoice_no","mill_id")
  - down_revision = "025"

Migration 027 — backend/alembic/versions/027_inventory_warehouse_tech_so_unique_per_mill.py
  - inventory_items: ADD mill_id column (nullable FK to mills); UniqueConstraint("code","mill_id")
  - warehouses: DROP unique on code; UniqueConstraint("code","mill_id")
  - technicians: ADD mill_id; UniqueConstraint("code","mill_id")
  - sales_orders: DROP unique on so_no; UniqueConstraint("so_no","mill_id")
  - down_revision = "026"

Migration 028 — backend/alembic/versions/028_shift_unique_per_mill.py
  - shifts: ADD UniqueConstraint("name","mill_id",name="uq_shifts_name_mill")
  - down_revision = "027"

UPDATE MODELS:
  - Update each model's __table_args__ to match the new constraints
  - Update any model that is missing mill_id: add the column with FK
  - Ensure all models import UniqueConstraint if not already

UPDATE API:
  - In ProductionService.create_entry: validate machine belongs to current mill
  - In all master CREATE endpoints: update error messages to indicate code is unique per mill

TESTS TO WRITE:
  - test that two mills can create Machine with code "BL-01"
  - test that same mill cannot create two Machines with code "BL-01"

COMMIT: "feat(wave3): multi-tenant constraint fixes — 6 migrations, per-mill unique codes"
```

---

### Prompt W4 — Wave 4: Database Integrity

```
SpinFlow Wave 4 — Database integrity fixes.
Precondition: Wave 3 migrations deployed and verified.

TASK 1: Payroll model consolidation (T-029)
  Read both models: backend/app/models/hr.py (MonthlyPayroll) and backend/app/models/payroll.py (PayrollMonth, PayslipEntry)
  Determine which table has actual data in production (run: SELECT COUNT(*) FROM monthly_payroll; SELECT COUNT(*) FROM payroll_months;)
  Write a migration that:
    - If monthly_payroll has data: migrate it to payroll_months schema format
    - Deprecate monthly_payroll (rename to _deprecated_monthly_payroll)
  Update backend/app/api/v1/hr.py to use PayrollMonth/PayslipEntry models

TASK 2: Composite indexes (T-030)
  Create migration 029 adding these indexes:
    CREATE INDEX CONCURRENTLY ix_prod_entry_mill_date ON production_entries(mill_id, date);
    CREATE INDEX CONCURRENTLY ix_downtime_mill_date ON downtime_logs(mill_id, date);
    CREATE INDEX CONCURRENTLY ix_waste_mill_date ON waste_entries(mill_id, date);
    CREATE INDEX CONCURRENTLY ix_payslip_mill_month ON payslip_entries(mill_id, month, year);

TASK 3: machine_id UUID FK (T-032)
  Create migration 031:
    ALTER TABLE production_entries ADD COLUMN machine_id VARCHAR(36);
    ALTER TABLE downtime_logs ADD COLUMN machine_id VARCHAR(36);
    UPDATE production_entries pe SET machine_id = (SELECT id FROM machines WHERE code = pe.machine_code LIMIT 1);
    UPDATE downtime_logs dl SET machine_id = (SELECT id FROM machines WHERE code = dl.machine_code LIMIT 1);
    (DO NOT add FK constraint yet — add in next sprint after validation)

TASK 4: Fix N+1 HR query (T-034)
  In backend/app/api/v1/hr.py — the bulk list endpoint
  Replace individual custom field queries with:
    from sqlalchemy.orm import selectinload
    stmt = select(Employee).options(selectinload(Employee.custom_fields))
  Or use a single JOIN query to fetch all custom field values in one shot.

TASK 5: Remove remaining bare except blocks (T-035)
  In EVERY remaining API file: hr.py, imports.py, billing.py, masters.py, payroll.py, quality.py, maintenance.py, stores.py, purchase.py
  Replace every:
    except Exception as e:
        return {...} / return []
  With:
    except Exception as e:
        logger.error(f"[endpoint_name] error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
  EXCEPTION: Keep HTTPException re-raises.

COMMIT: "fix(wave4): DB integrity — payroll consolidation, composite indexes, machine_id FK, N+1 fix, exception cleanup"
```

---

### Prompt W5 — Wave 5: Production Workflow Completion

```
SpinFlow Wave 5 — Complete the production workflow.
Precondition: Waves 1–4 deployed.

TASK 1: Link ProductionEntry to Lot (T-036)
  Migration 033:
    ALTER TABLE production_entries ADD COLUMN lot_id VARCHAR(36) REFERENCES lots(id);
    ALTER TABLE production_entries ADD COLUMN lot_no VARCHAR(50);
  
  Update ProductionEntryCreate schema to include optional lot_id
  Update create_entry service: if lot_id provided, validate it belongs to same mill
  Update _app.production.tsx: add lot selector dropdown to production entry form

TASK 2: Waste % server validation (T-039)
  In production_v2.py — create_waste_entry:
    if body.waste_pct is not None and body.waste_pct > 30:
        raise HTTPException(400, detail=f"Waste % {body.waste_pct}% exceeds maximum allowed 30%")
    # Make the threshold configurable via MillSettings

TASK 3: Standardise efficiency formula (T-040)
  In dashboard.py — remove efficiency calc from frontend expectations
  Backend should return:
    efficiency_pct = (actual_kg / rated_capacity_kg * 100) if rated_capacity_kg > 0 else None
  Machine model needs rated_capacity_kg field — add to migration 033 if missing

TASK 4: Import atomic transaction (T-042)
  In imports.py — commit endpoint
  Replace current sequential inserts with savepoint pattern:
    async with db.begin():
        for i, row in enumerate(rows):
            savepoint = await db.begin_nested()
            try:
                db.add(record)
                await savepoint.commit()
                results["success"] += 1
            except Exception as e:
                await savepoint.rollback()
                results["errors"].append({"row": i+1, "error": str(e)})

TASK 5: Zod validation on production forms (T-037)
  In _app.production.tsx:
    import { z } from "zod"
    const productionEntrySchema = z.object({
      machine_code: z.string().min(1, "Machine is required"),
      actual_kg: z.number().positive("Must be positive").max(10000, "Implausible value"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
      shift: z.enum(["A", "B", "C", "G"]),
      lot_id: z.string().optional(),
    })
  Use react-hook-form + zodResolver if already installed, otherwise validate on submit

TASK 6: Cache invalidation + mill switch (T-044, T-045)
  In every mutation in every frontend route:
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["relevant-key"] }) }
  In auth.ts setActiveMill:
    setActiveMill: (mill) => { queryClient.clear(); set({ activeMill: mill }) }
    (import queryClient from wherever it is defined — typically in main.tsx or a queryClient.ts)

TASK 7: ErrorBoundary (T-046)
  Create src/components/ErrorBoundary.tsx:
    class ErrorBoundary extends React.Component<{children}, {hasError, error}> {
      // Standard React error boundary
      // Show: "Something went wrong. Please refresh the page."
      // Include: error message in development mode only
    }
  Wrap _app.tsx main Outlet with <ErrorBoundary>

COMMIT: "feat(wave5): production workflow — lot linkage, waste validation, efficiency formula, atomic imports, Zod forms, error boundaries"
```

---

# PHASE 10 — Final Deliverables

## 1. Executive Summary

SpinFlow ERP is architecturally sound for a single-mill proof of concept but has 10 critical issues that must be resolved before deploying to a paying customer running 24/7 production.

The most severe risk is the **connection pool of 5 connections** — this will cause service crashes during shift changes when 10+ operators are simultaneously active. The second most severe is **14 globally unique constraints** that make it impossible to onboard a second mill without data conflicts.

The **268-hour remediation plan** across 7 waves and 61 tasks transforms SpinFlow from a functional demo into a production-ready multi-tenant ERP. At a single senior developer's pace, this is approximately 45 working days. With a 2-person team, 25 days.

---

## 2. Engineering Roadmap (Summary)

| Phase | Theme | Duration | Outcome |
|---|---|---|---|
| Wave 1 | Emergency Stabilization | 3 days | No crash risk |
| Wave 2 | Security Hardening | 4 days | No token theft, no RBAC bypass |
| Wave 3 | Multi-Tenant Corrections | 7 days | Second mill can be onboarded |
| Wave 4 | Database Integrity | 7 days | No orphaned data, indexed queries |
| Wave 5 | Workflow Completion | 8 days | Full production workflow, lot traceability |
| Wave 6 | Performance | 6 days | 20 concurrent users, fast page loads |
| Wave 7 | Go-Live Readiness | 10 days | Tested, deployed, monitored |

---

## 3. Sprint Plan

| Sprint | Wave | Tasks | Hours | Calendar |
|---|---|---|---|---|
| Sprint 1 | Wave 1 | T-001 to T-009 | 16 | Days 1–3 |
| Sprint 2 | Wave 2 | T-010 to T-018 | 24 | Days 4–7 |
| Sprint 3 | Wave 3 | T-019 to T-028 | 41 | Days 8–14 |
| Sprint 4 | Wave 4 | T-029 to T-035 | 43 | Days 15–21 |
| Sprint 5 | Wave 5 | T-036 to T-046 | 48 | Days 22–30 |
| Sprint 6 | Wave 6 | T-047 to T-054 | 34 | Days 31–36 |
| Sprint 7 | Wave 7 | T-055 to T-061 | 62 | Days 37–46 |

---

## 4. Risk Register

| Risk ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | Migration 024–027 fails due to duplicate codes in production data | Medium | Critical | Run data audit (T-021) before any migration; rename conflicting codes |
| R-02 | JWT sessionStorage change logs out all users simultaneously | High | Medium | Deploy during maintenance window; notify users; force re-login acceptable |
| R-03 | Payroll model consolidation causes payroll data loss | Low | Critical | Full DB backup before T-029; staged migration; read-only audit before delete |
| R-04 | Connection pool increase causes Supabase rate limiting | Low | Medium | Supabase transaction pooler supports 100+ connections; test on staging first |
| R-05 | Render paid tier unavailable or price increase | Low | Low | Docker self-host on DigitalOcean as fallback ($12/mo) |
| R-06 | machine_id backfill finds machines.code with no match | Medium | High | Pre-check: SELECT COUNT(*) FROM production_entries WHERE machine_code NOT IN (SELECT code FROM machines) must be 0 |

---

## 5. Dependency Graph (Visual Summary)

```
WAVE 1 (no deps)         WAVE 2 (after W1)        WAVE 3 (after W2)
A-01 ──────────────────────────────────────────► A-03 ──► A-04 (14 migrations)
A-02 (fail-fast)                                            │
AP-03 (webhook)                                             ▼
DI-01 (health)          F-01 (JWT memory)          DF-01 (machine scope)
F-05 (no fallback)      S-02 (cookie)              D-06 (inventory mill_id)
S-03 (secrets check)    AP-02 (import RBAC)        E-04 (shift unique)
                        AP-04 (rate limits)
                        A-05 (file store)
                               │
                               ▼
WAVE 4 (after W3)        WAVE 5 (after W4)         WAVE 6 (after W5)
D-01 ──► D-04            E-03 (lot linkage)         P-01 (pagination)
D-02 (cascades)          F-02 (Zod forms)           P-02 (async parse)
D-03 (date types)        DF-02 (import txn)         TD-01 (refactor)
D-05 (payroll)           E-01 (efficiency)          TD-03 (code split)
AP-06 (N+1 fix)          F-03/F-04 (cache)
```

---

## 6. Deployment Plan

### Each Wave Deployment Procedure

```
Pre-deploy:
□ Run on staging for 24 hours
□ Run all tests on staging (npx vitest; pytest)
□ Run TypeScript build: npx vite build (0 errors)
□ Manual smoke test: login, create entry, export data
□ Create Supabase manual backup

Deploy:
□ Push to main: git push
□ Monitor Render deploy logs for errors
□ If migration fails: Render health check fails → auto-rollback
□ Verify /api/health returns {"status":"ok","db":"connected"}
□ Verify /api/v1/dashboard/summary returns real data

Post-deploy:
□ Monitor Sentry for 1 hour (new errors)
□ Check DB connection count: SELECT COUNT(*) FROM pg_stat_activity;
□ Notify mill operator: "System updated, please refresh your browser"
□ Document deployed version in CHANGELOG.md
```

---

## 7. Testing Plan

| Test Type | Count Target | Tool | Run On |
|---|---|---|---|
| Unit tests (payroll formulas) | 20 | pytest | Every commit |
| Integration tests (API) | 80 | pytest-asyncio | Every PR |
| Frontend component tests | 30 | vitest | Every PR |
| Multi-tenant isolation tests | 20 | pytest-asyncio | Every deploy |
| Security tests (RBAC bypass) | 15 | pytest | Every release |
| Load tests (20 concurrent users) | 1 scenario | locust | Pre go-live, monthly |
| Migration chain test | 1 | pytest | Every migration |

---

## 8. ERP Completion Roadmap

Modules completed (working): Production Entry, HR/Payroll, Dispatch, Quality, Inventory, Billing, Accounts, Maintenance, Masters, Dashboard

Modules partially working: Lot Traceability, Production v2 (waste/stoppage), Import/Export

Modules to build (ranked by mill priority):
1. Production Planning Board (90-day)
2. Full Lot Traceability chain (90-day)
3. Shift Logbook (90-day)
4. Quality Workflow with approvals (90-day)
5. Machine Monitoring Dashboard (180-day)
6. Inter-Department Transfer (180-day)
7. Cotton Consumption Tracker (180-day)
8. Customer Order Planning (180-day)
9. Mobile PWA for supervisors (365-day)
10. IoT Integration (365-day)

---

## 9. Multi-Tenant SaaS Roadmap

| Milestone | Target | Requirement |
|---|---|---|
| 1 company, 1 mill | Now (post-fixes) | Waves 1–2 complete |
| 1 company, 3 mills | 60 days | Wave 3 complete |
| 5 companies, 10 mills | 90 days | All waves + load tested |
| 10 companies, 25 mills | 180 days | Redis queue, read replica |
| 25 companies, 60 mills | 365 days | Multi-region, dedicated DB |

---

## 10. Go-Live Checklist

### Pre-Go-Live (T-minus 1 week)
```
Infrastructure:
□ Render paid tier active (always-on confirmed)
□ Production Supabase separate from staging
□ Redis URL set in production env vars
□ RAZORPAY_WEBHOOK_SECRET set in production env vars
□ All env vars validated by check_secrets() on startup
□ /api/health returns 200 with db:connected

Security:
□ JWT not in localStorage (confirmed via browser devtools)
□ SameSite=Strict on refresh cookie (confirmed via browser devtools)
□ Import endpoints return 403 for unauthorized roles
□ CORS origins restricted to production domain only
□ Rate limiting active (confirmed: 21st request in 1 min → 429)

Database:
□ All 033 migrations applied cleanly on production DB
□ Connection pool: pg_stat_activity shows max 10 connections under load
□ Composite indexes present: SELECT * FROM pg_indexes WHERE tablename = 'production_entries'
□ No orphaned company_ids: data audit query returns 0

Multi-tenancy:
□ Two test mills created under one company
□ Each mill's data is not visible to the other
□ Second mill can create Machine with same code as first mill

Production Workflow:
□ Production entry can be created with lot linkage
□ Waste entry > 30% is rejected
□ Stoppage entry saves correctly (stop_from/stop_to as VARCHAR)
□ Dashboard KPIs show correct data (not 0)

Testing:
□ All 80 integration tests passing
□ Load test: 20 users × 10 min, 0 errors, p95 < 1s
□ TypeScript build: 0 errors
□ Security: no 401 bypass, no cross-tenant data in responses

Operations:
□ Seed data created for first mill
□ First mill's admin user credentials set and tested
□ Database backup confirmed for today
□ Rollback procedure documented and tested on staging
□ On-call contact established for first 48 hours post-go-live
```

### Go-Live Day
```
□ 06:00 IST: Final staging smoke test
□ 07:00 IST: Deploy Wave 7 changes to production
□ 07:15 IST: Run migration on production DB
□ 07:30 IST: Verify /health, run smoke tests
□ 08:00 IST: First shift supervisor logs in → watch Sentry for 30 min
□ 08:30 IST: First production entry submitted → verify in dashboard
□ 14:00 IST: Second shift change → monitor concurrent users
□ Post Day 1: Review all Sentry errors, DB connection counts, response times
```

---

*End of SpinFlow Master Execution Plan*  
*61 tasks · 268 hours · 7 waves · 10 phases · 45 working days to go-live*  
*Prepared 2026-06-11*
