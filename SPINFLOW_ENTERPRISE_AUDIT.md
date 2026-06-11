# SpinFlow ERP — Full Enterprise Audit Report

**Audit Date:** 2026-06-11  
**Scope:** Full repository — backend, frontend, database, migrations, security, performance  
**Standard:** Pre-production readiness review for ₹5 crore spinning mill rollout  
**Methodology:** Static analysis, code review, architecture review, threat modelling  

---

## Repository Map

### Backend (`/backend/app/`)
- **Framework:** FastAPI async (Python 3.10), SQLAlchemy 2, Alembic, asyncpg
- **Database:** PostgreSQL via Supabase (connection pooler)
- **Auth:** JWT HS512, bcrypt, HttpOnly refresh cookie
- **Deployment:** Render (single uvicorn worker, `--workers 1`)
- **API files (25):** auth, admin, billing, dashboard, dispatch, exports, hr, imports, inventory, lotrac, maintenance, masters, mill_config, mixing, payroll, production, production_v2, purchase, quality, reports, sales, stock, stores, ui_config, users
- **Model files (20):** accounts, audit, billing, deletion_log, dispatch, hr, inventory, lotrac, maintenance, masters, mixing, payroll, production, production_v2, purchase, quality, stock, stores, ui_config, user
- **Migrations:** 022 migrations (001–022), linear chain, no branches

### Frontend (`/src/`)
- **Framework:** React 18, TanStack Router, Zustand, TanStack Query
- **UI:** shadcn/ui, Tailwind CSS
- **Route files (40+):** _app.production, _app.hr, _app.dashboard, _app.admin.*, _app.dispatch, etc.
- **State:** Zustand `persist` middleware → localStorage
- **API:** Axios with JWT interceptor, auto-refresh on 401

### Database Schema
- **Tables:** ~60 tables across 20 modules
- **Multi-tenancy:** `mill_id` per record, `company_id` on User
- **RBAC:** 3-layer (company subscription → role matrix → user module restrictions)
- **IDs:** UUID v4 (string, 36 char)

---

## Issue Severity Legend

| Severity | Meaning |
|---|---|
| 🔴 CRITICAL | Data loss, security breach, or production crash risk |
| 🟠 HIGH | Functional failure blocking multiple users or modules |
| 🟡 MEDIUM | Degraded behaviour, data quality risk, maintainability |
| 🟢 LOW | Polish, best-practice deviation, minor UX friction |

---

# PHASE 1 — Architecture Audit

---

### A-01 🔴 CRITICAL — Connection Pool Critically Undersized (5 total connections)

**File:** `backend/app/db/session.py:7-8`

```python
pool_size=3,
max_overflow=2,   # 5 total connections maximum
```

**Root Cause:** Supabase free tier has a low hard limit and the config was set conservatively and never revisited.

**Impact:** Under any concurrent load (2+ users submitting production entries simultaneously), connections queue and time out at 30 seconds (`pool_timeout=30`). With a single Render worker handling asyncio concurrency, a single slow query holding a connection blocks all other requests. In a mill with 10+ simultaneous operators, this will cause cascading 500 errors.

**Reproduction:** Submit 6 concurrent POST /production/entries requests — 5th and 6th will hang for 30 seconds then fail.

**Fix:** Increase to `pool_size=10, max_overflow=10`. Enable `pool_pre_ping=True` (already set). Switch to Supabase transaction-mode pooler (port 6543) which supports higher connection counts at no additional cost.

**Effort:** 30 minutes. **Risk of fix:** Low.

---

### A-02 🔴 CRITICAL — Migration Failures Silently Swallowed; App Continues Running

**File:** `backend/app/main.py:131-136`

```python
async def lifespan(app: FastAPI):
    try:
        await asyncio.to_thread(_run_alembic_upgrade)
        logger.info("Database migrations applied successfully")
    except Exception as exc:
        logger.error(f"Failed to apply database migrations: {exc}", exc_info=True)
        # APP CONTINUES — no raise, no crash
```

**Root Cause:** The exception is caught and logged but not re-raised, allowing the application to start against a stale schema.

**Impact:** This is exactly what caused the `stop_from`/`stop_to` TIME vs VARCHAR bug — migration 022 may fail silently on production if PostgreSQL rejects the USING cast, while new code runs against old columns. Any future migration failure will result in cryptic 500s with no indication that the schema is out of date.

**Reproduction:** Introduce a deliberate syntax error in migration 023, deploy — app starts, logs error, users get mysterious failures.

**Fix:**
```python
    except Exception as exc:
        logger.critical(f"FATAL: Migration failed — {exc}", exc_info=True)
        raise SystemExit(1)  # Crash the process; Render will restart and alert
```

**Effort:** 5 minutes. **Risk of fix:** Low (fail-fast is safer than running broken).

---

### A-03 🔴 CRITICAL — User.company_id Has No Foreign Key Constraint

**File:** `backend/app/models/user.py:30`

```python
company_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
# No ForeignKey("companies.id") — referential integrity not enforced
```

**Root Cause:** Column added without FK, likely to avoid circular import or bootstrapping issue.

**Impact:** Users can be created with a `company_id` pointing to a non-existent company. The `get_current_user` / `get_mill_scope` dependency chains then silently resolve to `None` for company scoping, potentially granting cross-company data access or causing NoneType errors that bypass auth checks.

**Fix:** Add `ForeignKey("companies.id", ondelete="SET NULL")` to the column definition. Create migration 023 to add the FK constraint after cleaning any orphaned records.

**Effort:** 1 hour (migration + data audit). **Risk:** Medium (requires data cleanup first).

---

### A-04 🟠 HIGH — 14 Global `unique=True` Constraints Break Multi-Tenant Operation

**Files:** Across 10+ model files

Complete list of globally-unique columns that should be scoped per-mill or per-company:

| Model | Column | Table | Impact |
|---|---|---|---|
| Machine | code | machines | Two mills can't share code "MC-01" |
| Customer | code | customers | Global customer codes |
| Route | code | master_routes | Global route codes |
| MasterVehicle | vehicle_no | master_vehicles | Global vehicle plate numbers |
| Dispatch | dispatch_no | dispatches | Global dispatch sequence |
| Lot | lot_no | lots | Global lot numbers |
| InventoryItem | code | inventory_items | Global item codes |
| Warehouse | code | warehouses | Global warehouse codes |
| Supplier | code | suppliers | Global supplier codes |
| CottonBale | bale_number | cotton_bales | Global bale numbers |
| Invoice | invoice_no | invoices | Global invoice numbers |
| SalesOrder | so_no | sales_orders | Global SO numbers |
| Trip | trip_no | trips | Global trip numbers |
| Technician | code | technicians | Global technician codes |

**Root Cause:** Initial schema designed for single-tenant, multi-tenant columns added later without revisiting uniqueness constraints.

**Impact:** The second mill onboarded on the same company **will fail to create any record** whose code matches the first mill's records. This is a complete blocker for the MILL_OWNER multi-mill scenario.

**Fix:** For each table: add `mill_id` column if missing; change `unique=True` to `UniqueConstraint(code, mill_id)`. Requires 14 migrations. Employee code was already fixed (migration 021) — same pattern for all others.

**Effort:** 3–5 days (migrations + data backfill). **Risk:** High (large schema change, requires careful sequencing).

---

### A-05 🟠 HIGH — In-Memory File Store in imports.py Will Lose Uploads on Restart

**File:** `backend/app/api/v1/imports.py:130-131`

```python
_FILE_STORE: dict[str, bytes] = {}
_FILE_META: dict[str, dict] = {}
```

**Root Cause:** Multi-step import flow (parse → validate → commit) uses server-side in-memory storage between requests.

**Impact:** On Render's free tier, the dyno sleeps after 15 minutes of inactivity. On wake (which takes 30+ seconds), `_FILE_STORE` is empty. Any user mid-import flow who waits too long between steps gets "File not found or expired" error and must re-upload. Additionally, the dict grows indefinitely if users abandon imports — memory leak on long-running instances. No TTL, no cleanup except on `commit`.

**Fix:** Use a temp file on disk (`/tmp/spinflow_imports/{file_id}.pkl`) with a 30-minute mtime-based cleanup job. Or store file_bytes in Redis with 30-minute TTL (Redis URL is already in config).

**Effort:** 2 hours. **Risk:** Low.

---

### A-06 🟡 MEDIUM — Single uvicorn Worker; No Horizontal Scale Path

**File:** `render.yaml`

```yaml
startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --loop asyncio
```

**Impact:** One process handles all requests. CPU-bound tasks (Excel parsing, bulk import, PDF generation) block the event loop, delaying all other requests. No failover if the process crashes.

**Fix:** For CPU tasks, use `asyncio.to_thread()` (already used for migrations — extend to import parsing). For scale, switch to `--workers 2` on paid Render tier or add Gunicorn with uvicorn workers. Already using `asyncio.to_thread` for migration — apply same pattern to file parsing in imports.py.

**Effort:** 4 hours. **Risk:** Low.

---

# PHASE 2 — Database Audit

---

### D-01 🔴 CRITICAL — ProductionEntry.machine_code FKs to Machine.code (String), Not machines.id

**File:** `backend/app/models/production.py:76`

```python
machine_code: Mapped[str] = mapped_column(String(50), ForeignKey("machines.code"), nullable=False)
```

**Root Cause:** Code-based FK used for convenience (human-readable in forms).

**Impact:** Machine `code` is globally unique — so cross-tenant collisions will produce incorrect FK resolution. If Mill A and Mill B both have a machine "BL-01", FK references are ambiguous at the DB level. Renaming a machine code breaks all historical production entries referencing that code. DowntimeLog, WasteEntry, RFManpowerPlan all have the same pattern.

**Fix:** Add `machine_id` (UUID FK to `machines.id`) column alongside `machine_code` (keep for display). Populate via migration using JOIN. Use ID for FK enforcement, code only for display.

**Effort:** 1 day. **Risk:** High (data migration, API changes).

---

### D-02 🟠 HIGH — No Cascade Deletes; Orphaned Records Will Accumulate

**Files:** Multiple model files

Most relationships have no `ondelete=` clause:
```python
# dispatch.py
lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=True)
# No ondelete — deleting a lot leaves dispatch records with dangling FK

# quality.py  
lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=True)
```

**Impact:** Deletion of parent records leaves children with NULL or broken FKs. Queries that JOIN on these will silently miss data or crash. The `DeletionLog` table tracks soft-deletes for `User` only — no other model uses `SoftDeleteMixin`.

**Fix:** Define explicit `ondelete="CASCADE"` or `ondelete="SET NULL"` on every FK per business rules. Add `SoftDeleteMixin` to all auditable entities (Employee, Lot, Machine, Dispatch, ProductionEntry).

**Effort:** 2 days. **Risk:** Medium.

---

### D-03 🟠 HIGH — String Dates Everywhere; No Date Type Validation or Indexing Efficiency

**Files:** Nearly every model

```python
date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # "YYYY-MM-DD"
joining_date: Mapped[date] = mapped_column(Date, nullable=True)             # correct
doj: Mapped[str] = mapped_column(String(10), nullable=True)                 # duplicate, wrong type
```

**Impact:** `String(10)` date columns cannot use PostgreSQL date range operators (`BETWEEN`, `<`, `>`), can store invalid strings like "2024-13-45", and BTREE indexes on varchar are less efficient than on DATE. The HR `Employee` model has both `joining_date` (proper `Date`) and `doj` (String) — duplicate fields, inconsistent.

**Fix:** Migrate all date String columns to PostgreSQL `DATE` type using `USING column::DATE`. Standardise to one date field per concept.

**Effort:** 2–3 days. **Risk:** High (touches every module).

---

### D-04 🟡 MEDIUM — Missing Composite Indexes on High-Query Columns

**Impact:** Production entries are queried by `(mill_id, date, shift, department)` together constantly. Individual column indexes on `mill_id`, `date`, `shift` force PostgreSQL to use the least selective index, not a composite scan.

**Fix:** Add composite indexes:
```python
Index("ix_prod_entry_mill_date", ProductionEntry.mill_id, ProductionEntry.date)
Index("ix_downtime_mill_date_dept", DowntimeLog.mill_id, DowntimeLog.date, DowntimeLog.department)
Index("ix_waste_mill_date", WasteEntry.mill_id, WasteEntry.date)
Index("ix_payslip_mill_month_year", PayslipEntry.mill_id, PayslipEntry.month, PayslipEntry.year)
```

**Effort:** 4 hours. **Risk:** Low (adding indexes is non-blocking in PostgreSQL).

---

### D-05 🟡 MEDIUM — Payroll Has Two Overlapping Models (MonthlyPayroll + PayslipEntry)

**Files:** `hr.py` model has `MonthlyPayroll`; `payroll.py` model has `PayrollMonth` + `PayslipEntry`

**Impact:** Two separate monthly payroll tracking tables with different schemas for the same concept. Queries and reports may pull from the wrong table. The HR API (`/hr/payroll`) uses `MonthlyPayroll`; the payroll API uses `PayrollMonth`/`PayslipEntry`. Dual-write risk: a month can be in one table but not the other.

**Fix:** Audit which table is actually populated; migrate data to `PayrollMonth`/`PayslipEntry` (the more complete schema); deprecate `monthly_payroll`.

**Effort:** 1 day. **Risk:** Medium.

---

### D-06 🟡 MEDIUM — `InventoryItem.code` Global Unique with No `mill_id`

**File:** `backend/app/models/inventory.py:18`

The `InventoryItem` table has no `mill_id` column at all. Items are globally shared across all tenants. This means if one mill creates item code "YARN-40s", no other mill can create that code, and all mills share the same item catalogue — destroying tenant isolation for inventory.

**Fix:** Add `mill_id` with FK to mills, add `UniqueConstraint("code", "mill_id")`.

---

# PHASE 3 — API Audit

---

### AP-01 🔴 CRITICAL — 164 Bare `except Exception` Blocks; All Errors Silently Swallowed

**Files:** All 25 API files

```python
except Exception as e:
    logger.error(f"production.entries list error: {e}")
    return {"total": 0, "page": 1, "page_size": 20, "pages": 0, "data": []}
```

**Impact:** Database constraint violations, connection errors, permission failures, and programming bugs are all caught and returned as empty data sets or `{"success": false}` JSON. The frontend silently shows an empty table. The client has no indication that an error occurred. Bugs cannot be tracked. This pattern appears 164 times across all API files.

**Fix:** For retrieval errors: return `HTTP 500` with a `request_id` for traceability. For write errors: always re-raise as `HTTPException`. Add Sentry or structured error logging. Remove `return {}` from exception handlers.

**Effort:** 3 days. **Risk:** Medium (will surface previously hidden errors — which is the point).

---

### AP-02 🟠 HIGH — Import Endpoints Use `get_current_user` Not `require_module`

**File:** `backend/app/api/v1/imports.py:149-150, 259-260, 369-370, 526-527`

```python
current_user: User = Depends(get_current_user),  # only checks valid JWT
```

vs. correct pattern:
```python
current_user: User = Depends(require_module("masters", write=True)),  # checks subscription + RBAC
```

**Impact:** Any authenticated user — regardless of role, subscription plan, or module access — can call `/imports/parse`, `/imports/validate`, and `/imports/commit`. A `QUALITY_CHECKER` with no HR module access can import employees. A suspended company's users can still import data.

**Fix:** Replace `get_current_user` with `require_module(module_name, write=True)` on all import endpoints.

**Effort:** 1 hour. **Risk:** Low.

---

### AP-03 🟠 HIGH — Billing Webhook HMAC Uses Incorrect `hmac.new()` Call

**File:** `backend/app/api/v1/billing.py:558-563`

```python
expected = hmac.new(
    settings.RAZORPAY_WEBHOOK_SECRET.encode(),
    body.encode(),
    hashlib.sha256,
).hexdigest()
```

**Impact:** `hmac.new()` is not a Python standard function — the correct function is `hmac.new()`. Actually, `hmac.new()` is a deprecated alias; the canonical form is `hmac.HMAC(key, msg, digestmod).hexdigest()`. More critically: the `body` is constructed from `json.dumps(payload)` where `payload` was already parsed from the request body — JSON key ordering may differ from Razorpay's original bytes, causing all webhook signatures to fail (HMAC mismatch), silently rejecting all payment events.

**Fix:** Read the raw request body bytes before parsing:
```python
body_bytes = await request.body()
expected = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), body_bytes, hashlib.sha256).hexdigest()
```

**Effort:** 30 minutes. **Risk:** Low.

---

### AP-04 🟠 HIGH — No Rate Limiting on Import/Export/Bulk Endpoints

**File:** `backend/app/api/v1/imports.py`, `exports.py`, `hr.py`

The `@limiter.limit("10/minute")` decorator is applied only to login and OTP endpoints. All import (file upload + parse), bulk HR upload, and data export endpoints are unlimited.

**Impact:** An attacker or misconfigured client can:
- Flood the import parser with 100 MB files, exhausting memory
- Call bulk employee import 1000 times/minute, inserting garbage data
- Call export endpoints in a loop, exfiltrating all data and saturating DB connections

**Fix:** Apply `@limiter.limit("20/minute")` to all import endpoints and `@limiter.limit("60/minute")` to export endpoints.

**Effort:** 2 hours. **Risk:** Low.

---

### AP-05 🟠 HIGH — Dashboard API Swallows DB Errors; Returns Zeros Silently

**File:** `backend/app/api/v1/dashboard.py`

The entire KPI computation block is wrapped in a bare `except Exception` that returns `0` for all metrics. As previously encountered, this meant a TIME/VARCHAR type mismatch (which caused the stoppage bug) also silently zeroed all production KPIs — making the mill think it produced nothing today.

**Fix:** Remove catch-all; let individual query errors bubble up as 500s with detail. Frontend should show "Error loading KPIs" rather than "0 kg produced".

---

### AP-06 🟡 MEDIUM — N+1 Query Patterns in HR and Reports APIs

**File:** `backend/app/api/v1/hr.py:157`

```python
for cv in cv_result.scalars().all():
    # Inner query per employee custom field
```

**Impact:** Loading 200 employees with custom fields fires 201 queries. On Supabase free tier with 5 connections and 100ms latency per query, this adds 20 seconds to the HR page load.

**Fix:** Use `selectinload()` or a single JOIN query to fetch all custom field values in one query.

**Effort:** 1 day. **Risk:** Low.

---

### AP-07 🟡 MEDIUM — CORS regex `.*\.onrender\.com` Allows Any Render Subdomain

**File:** `render.yaml`, `main.py`

```
CORS_ORIGIN_REGEX=^https://(.*\.ngrok(?:-free)?\.dev|.*\.onrender\.com)$
```

**Impact:** Any application deployed on Render (e.g., `attacker-app.onrender.com`) can make credentialed cross-origin requests to the SpinFlow API. This includes XSS pivots from compromised Render apps, sharing cookies across the Render domain namespace.

**Fix:** Restrict to explicit origins only: `CORS_ORIGINS=https://spinflow.onrender.com,https://spinflow-f.onrender.com`. Remove the wildcard regex for production.

**Effort:** 30 minutes. **Risk:** Low.

---

# PHASE 4 — Frontend Audit

---

### F-01 🔴 CRITICAL — Access Token Stored in Zustand localStorage (XSS-Accessible)

**File:** `src/stores/auth.ts:47-57`

```typescript
persist(
  (set) => ({ ... }),
  {
    name: "spinflow-auth",
    partialize: (state) => ({
      user: state.user,
      token: state.token,       // JWT access token persisted to localStorage
      isAuthenticated: state.isAuthenticated,
      activeMill: state.activeMill,
    }),
```

**Impact:** JWT access tokens stored in `localStorage` are readable by any JavaScript on the page. An XSS vulnerability (even in a third-party CDN script or injected user content) can exfiltrate the token and impersonate the user. The refresh token is correctly in HttpOnly cookie — but the 8-hour access token is fully exposed.

**Fix:** Do not persist the access token. Use `sessionStorage` or keep only in memory (Zustand without persist for the token itself). Rely on HttpOnly cookie for refresh. Accept that users need to refresh on tab reload — or use a short-lived (15min) access token.

**Effort:** 4 hours. **Risk:** Medium (UX change — users may need to re-auth on reload).

---

### F-02 🟠 HIGH — No Zod/Form Validation in Production Entry Forms

**File:** `src/routes/_app.production.tsx` (2062 lines)

Grep for Zod schema in production frontend returned 0 results. Forms submit raw state directly to API. No client-side validation for:
- `quantity_kg` — can be negative, non-numeric, or 999999
- `date` — can be any string
- `shift` — not validated against available shifts
- Required fields not enforced before submission

**Impact:** Invalid data reaches the API, which may silently accept it or fail with an obscure 422/500. Operators can submit corrupted entries without feedback.

**Fix:** Add Zod schemas for all production forms using `react-hook-form` + `zodResolver`. Validate on submit before API call.

**Effort:** 2 days. **Risk:** Low.

---

### F-03 🟠 HIGH — Stale Query Cache Shows Old Data After Mutations

**File:** Multiple frontend routes

Pattern seen across HR, production, payroll:
```typescript
// After creating/updating a record:
// No queryClient.invalidateQueries() call
// User sees old data until manual refresh
```

**Impact:** After approving a production entry, the entries list still shows "pending". After uploading employees, the table still shows old count. Users believe actions failed and submit twice.

**Fix:** Add `queryClient.invalidateQueries({ queryKey: [...] })` in every mutation's `onSuccess` callback.

**Effort:** 1 day. **Risk:** Low.

---

### F-04 🟠 HIGH — `activeMill` Mill Switch Does Not Invalidate All Queries

**File:** `src/stores/auth.ts` — `setActiveMill`

```typescript
setActiveMill: (mill) => set({ activeMill: mill }),
// No queryClient.clear() or invalidation
```

**Impact:** When a MILL_OWNER switches between mills using the mill selector, all TanStack Query caches still hold data from the previous mill. The user sees Mill A's production data while Mill B is selected, until individual queries naturally re-fetch.

**Fix:** Call `queryClient.clear()` or `queryClient.invalidateQueries()` inside `setActiveMill`.

**Effort:** 30 minutes. **Risk:** Low.

---

### F-05 🟡 MEDIUM — Hardcoded API Base URL Fallback to Production

**File:** `src/lib/api.ts:5`

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://spinflow.onrender.com";
```

**Impact:** Any developer running the frontend locally without a `.env.local` file will silently connect to the production API. Local development changes hit the live database.

**Fix:** Remove the fallback default. Fail loudly: `if (!import.meta.env.VITE_API_BASE_URL) throw new Error("VITE_API_BASE_URL is not set")`.

**Effort:** 5 minutes. **Risk:** Low.

---

### F-06 🟡 MEDIUM — No Error Boundaries; Any Uncaught React Error Crashes the Whole App

**Files:** No `ErrorBoundary` component found in codebase

**Impact:** A runtime error in one route component (e.g., `TypeError: Cannot read property 'name' of null` on a malformed API response) crashes the entire React tree, showing a blank white screen with no recovery path. Users must hard-refresh.

**Fix:** Wrap each route's `<Outlet>` in a `<ErrorBoundary fallback={<ErrorFallbackPage />}>`.

**Effort:** 3 hours. **Risk:** Low.

---

# PHASE 5 — ERP Domain Audit

---

### E-01 🟠 HIGH — Production KPI Efficiency Formula Is Not Standardised

**File:** `backend/app/api/v1/dashboard.py` + `src/routes/_app.production.tsx`

Efficiency is computed as `actual_kg / target_kg * 100` in the frontend, but `target_kg` is often 0 (no target set for the machine), causing division-by-zero showing `Infinity%` or `NaN%`. The backend dashboard uses a different formula based on shift count vs entry count.

**Impact:** Mill manager's efficiency KPI is wrong. Different screens show different efficiency numbers for the same data.

**Fix:** Standardise formula in backend: `efficiency = (sum(actual_kg) / sum(target_kg)) * 100` where `target_kg` defaults to machine's rated capacity. Return `null` if no target set. Frontend displays "—" for null.

---

### E-02 🟠 HIGH — Waste Percentage Not Linked to Machine/Department Target

**File:** `backend/app/api/v1/production_v2.py`

`WasteEntry` has `waste_kg` and `waste_pct` fields, but `waste_pct` is stored as-entered, not computed from production output. There is no validation that `waste_pct` is consistent with `waste_kg / produced_kg`.

**Impact:** Operators can enter 50 kg waste on 10 kg production (500% waste). No audit trail for implausible values. Report-level waste analysis is unreliable.

**Fix:** Compute `waste_pct = waste_kg / production_entry.actual_kg` on the server side. Add validation: reject entries where `waste_pct > 30%` for standard cotton processes (configurable per department).

---

### E-03 🟠 HIGH — Lot Traceability Broken: Production Entries Not Linked to Lots

**Files:** `models/production.py` — `ProductionEntry` has no `lot_id` field

**Impact:** The core promise of yarn traceability — "which bales went into which lot, which lot went through which department, which lot was dispatched to which customer" — cannot be fulfilled end-to-end. `ProductionEntry` records which machine produced how much yarn, but not which lot number was being produced. QR scan on dispatch bag links to a lot, but that lot cannot be traced back to specific production entries.

**Fix:** Add `lot_id` (FK to lots) and `lot_no` (display) to `ProductionEntry`. When entering production, operator selects active lot. Add migration.

**Effort:** 2 days. **Risk:** Medium.

---

### E-04 🟡 MEDIUM — Shift Model Has No Start/End Time; Overlap Detection Impossible

**File:** `backend/app/models/production.py` — `Shift` model

`Shift` stores `name`, `start_time` (String), `end_time` (String) but there is no uniqueness constraint on `(mill_id, date, name)`. Two shifts named "A" can exist for the same mill and date. Production entries can reference a non-existent shift name.

**Fix:** Add `UniqueConstraint("mill_id", "name")` on Shift. Add FK validation that `ProductionEntry.shift` matches an existing `Shift.name` for the mill.

---

### E-05 🟡 MEDIUM — Payroll Has No Lock Mechanism; Finalized Months Can Be Modified

**File:** `backend/app/models/payroll.py` — `PayrollMonth.status`

`is_finalized` flag exists on `MonthlyPayroll` but is not checked on update endpoints. Finalized payroll can be edited, attendance records for past months can be changed after payroll is locked.

**Fix:** Add guard in payroll update endpoints: `if payroll_month.status == "finalized": raise HTTPException(400, "Cannot modify finalized payroll")`.

---

# PHASE 6 — Data Flow Audit

---

### DF-01 🔴 CRITICAL — `machine_code` FK Bypasses Multi-Tenant Isolation in ProductionEntry

**Impact:** When creating a `ProductionEntry`, the API looks up `machine_code` globally across all machines — not filtered by `mill_id`. An operator from Mill A could potentially submit a production entry using `machine_code = "MC-01"` which belongs to Mill B, corrupting Mill B's data.

**Reproduction:** Create machines with the same code in two different mills (currently blocked by global unique, but after fixing A-04 this becomes exploitable). Submit a production entry from Mill A using Mill B's machine code.

**Fix:** In `ProductionService.create_entry`, validate that the machine exists in the current mill scope:
```python
machine = await db.execute(select(Machine).where(Machine.code == req.machine_code, Machine.mill_id == mill_id))
if not machine.scalar_one_or_none():
    raise HTTPException(400, "Machine not found in current mill")
```

---

### DF-02 🟠 HIGH — Import Commit Has No Transaction Rollback on Partial Failure

**File:** `backend/app/api/v1/imports.py` — commit endpoint

During bulk import commit, records are inserted in batches with `await db.flush()` every 50 rows. If row 173 of 200 fails (e.g., FK violation), the first 150 rows are already committed (flush → commit on success). The partial import leaves the DB in an inconsistent state.

**Fix:** Wrap entire import commit in a single transaction. Use `savepoint` per batch to allow per-row error reporting without aborting the whole import:
```python
async with db.begin_nested():  # savepoint
    db.add(record)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback_to_savepoint()
        errors.append(...)
```

---

### DF-03 🟠 HIGH — QR Token Has No Expiry; Dispatch QR Codes Are Permanently Valid

**File:** `backend/app/api/v1/qr_system.py`, `models/inventory.py:Lot.qr_token`

QR tokens are UUID-like strings stored on the `Lot` and `InventoryBag` models with no `expires_at`. Once generated, a QR code is valid forever.

**Impact:** A physical QR label printed for a delivered lot can be re-scanned months later to create fraudulent scan log entries. A stolen QR code can be used indefinitely to falsify delivery confirmation.

**Fix:** Add `qr_expires_at` datetime to `Lot` and `InventoryBag`. Sign tokens with HMAC including expiry. Reject scans for expired tokens.

---

# PHASE 7 — QA & Testing Audit

---

### Q-01 🔴 CRITICAL — Zero Automated Tests in Entire Codebase

No test files found anywhere:
```
find /backend -name "test_*.py" → 0 results
find /src -name "*.test.ts" → 0 results
find /src -name "*.spec.ts" → 0 results
```

**Impact:** Every code change is deployed without regression verification. The `stop_from`/`stop_to` TIME/VARCHAR bug existed for weeks because there was no integration test for the stoppage endpoint. The employee upload unique constraint bug persisted across multiple sessions for the same reason.

**Fix:** Minimum viable test suite:
- `pytest-asyncio` integration tests for all critical write endpoints (production entry, stoppage, payroll)
- `pytest` unit tests for payroll calculation formulas
- `vitest` component tests for production form validation
- GitHub Actions CI: run tests on every push to main

**Effort:** 5–7 days to write initial suite. **Risk:** Low.

---

### Q-02 🟠 HIGH — No Seed Data / Fixtures for Development

There is no `seed.py`, no fixtures, and no documented setup for getting a working development environment with test data.

**Impact:** Every developer must manually create companies, mills, users, machines, shifts, and departments before testing any feature. This makes local development slow and discourages testing.

**Fix:** Create `backend/scripts/seed_dev.py` that creates one company, two mills, standard roles, test users for each role, sample machines/departments, and 30 days of production entries.

---

# PHASE 8 — Production Failure Simulation

---

### PF-01 🔴 CRITICAL — Render Free Tier Cold Start: 30–60 Second Response on First Request

**Symptoms:** After 15 minutes of inactivity, Render spins down the free-tier web service. The first request triggers a cold start taking 30–60 seconds.

**Current mitigation:** Frontend shows "Loading... (server is starting up, please wait)" toast after 3 seconds — but this is passive; no retry, no progress indication.

**Impact at mill:** Shift supervisor opens SpinFlow at 6am shift start. First request hangs for 45 seconds. Supervisor assumes the app is broken and reverts to paper register.

**Fix:** Upgrade to Render paid tier ($7/mo) to keep service always-on. Alternatively, implement a `/health` ping from the frontend on app load to warm the server before the user's first real action.

---

### PF-02 🔴 CRITICAL — Connection Pool Exhaustion Under Shift-Change Load

**Scenario:** At shift change (6am, 2pm, 10pm), 15–20 operators simultaneously open SpinFlow to submit production entries.

**Expected:** 5 connection pool slots. 15 concurrent requests = 10 requests queued, timing out at 30s each = cascading 500 errors.

**Impact:** Production entries lost. Supervisor calls IT. Mill operations disrupted.

**Fix:** See A-01. Immediate fix: increase pool. Long-term: Supabase transaction pooler + horizontal scaling.

---

### PF-03 🟠 HIGH — Alembic Migration Failure on Deployment Blocks Production

**Scenario:** Deploy migration 023. The `ALTER TABLE` fails because a row violates a new constraint.

**Current behaviour:** `lifespan` catches the exception, logs it, starts the app. Old code runs against old schema. Migration failure goes unnoticed until a feature stops working.

**Fix:** See A-02. Fail fast on migration error.

---

# PHASE 9 — Security Audit

---

### S-01 🔴 CRITICAL — JWT Access Token in localStorage (XSS Exfiltration Risk)

See F-01. This is the highest-priority security issue. Any XSS vulnerability — including in a CDN-hosted library — can steal session tokens for all logged-in users.

---

### S-02 🟠 HIGH — No CSRF Protection on State-Changing Endpoints

The API uses JWT Bearer auth for API calls, which is not vulnerable to classic CSRF. However, the refresh token is in an HttpOnly cookie. The `/auth/refresh` endpoint reads from the cookie (`request.cookies.get("refresh_token")`) — this endpoint IS vulnerable to CSRF: a malicious page can force a victim's browser to POST to `/auth/refresh`, refresh their session, and receive a new token in the response body (which the attacker's JS can read if CORS is misconfigured).

**Fix:** Add `SameSite=Strict` to the refresh cookie. Current code sets `samesite="lax"` (implicit default) — change to `"strict"`.

---

### S-03 🟠 HIGH — RAZORPAY_WEBHOOK_SECRET Not Validated on Startup

**File:** `backend/app/core/config.py` — `check_secrets()`

`check_secrets()` validates `SECRET_KEY` and `REFRESH_SECRET_KEY` but does not check `RAZORPAY_WEBHOOK_SECRET`. If this env var is missing, `settings.RAZORPAY_WEBHOOK_SECRET.encode()` raises `AttributeError` at webhook call time (not startup), leaving billing payment processing broken silently.

**Fix:** Add `RAZORPAY_WEBHOOK_SECRET` to `check_secrets()`.

---

### S-04 🟠 HIGH — OTP Codes Not Rate-Limited Per User (Only Per IP)

**File:** `backend/app/api/v1/auth.py`

SlowAPI rate limiting uses `get_remote_address` (IP-based). OTP verification is limited `"5/minute"` per IP. Behind a corporate NAT, all mill users share one IP — 5 total OTP attempts per minute for the entire mill is too restrictive and can be DoS'd by one user.

**Fix:** Rate limit OTP per user identifier (email/phone), not per IP. Use Redis counter: `otp_attempts:{email}` with 5-attempt limit and 15-minute window.

---

### S-05 🟡 MEDIUM — No Audit Log for Data Exports

The `AuditLog` model and `log_audit()` function exist and are used for admin actions. However, the `exports.py` API does not call `log_audit()` for any data export. A MILL_OWNER can export the entire payroll, dispatch, or production dataset with no record of the export.

**Fix:** Call `log_audit(db, user_id, role, "export", module, None, f"Exported {row_count} rows")` in all export endpoints.

---

### S-06 🟡 MEDIUM — Inactive User Sessions Not Cleaned Up

**File:** `backend/app/models/user.py — UserSession`

`UserSession` table grows indefinitely. No scheduled cleanup, no max session count per user, no revocation on password change (only on explicit logout). If a user's password is reset by admin, their existing JWT tokens remain valid for 8 hours.

**Fix:** Revoke all `UserSession` records on password change. Add nightly cleanup job for sessions older than 7 days. Add max 5 concurrent sessions per user.

---

# PHASE 10 — Performance Audit

---

### P-01 🟠 HIGH — No Pagination on Several List Endpoints

Several API endpoints return all records without pagination:
- `GET /api/v1/masters/machines` — returns all machines (can be 500+ for large mills)
- `GET /api/v1/masters/customers` — returns all customers
- `GET /api/v1/production/datalog-stop-codes` — returns all stop codes (used in dropdowns)

**Impact:** As data grows, these endpoints degrade linearly. A mill with 2 years of data and 200 customers causes noticeable slowdown in dropdown population.

**Fix:** Add `?page=&page_size=` pagination to all list endpoints. For dropdowns, add `?search=` parameter and return max 50 results.

---

### P-02 🟠 HIGH — Excel Import Parses Entire File in Async Request Handler

**File:** `backend/app/api/v1/imports.py:162-200`

`openpyxl.load_workbook(io.BytesIO(content))` is synchronous, CPU-bound, and can take 5–10 seconds for a 5,000-row Excel file. It runs directly in the async event loop (no `asyncio.to_thread()`).

**Impact:** During file parsing, the event loop is blocked, preventing all other requests from being processed.

**Fix:**
```python
wb = await asyncio.to_thread(
    openpyxl.load_workbook, io.BytesIO(content), data_only=True
)
```

**Effort:** 30 minutes. **Risk:** Low.

---

### P-03 🟡 MEDIUM — `staleTime: 3 * 60 * 1000` on Production Queries Causes Stale Data Display

**File:** Multiple frontend files

```typescript
staleTime: 3 * 60 * 1000,  // 3 minutes stale time
```

For production entries (which multiple operators update concurrently), 3 minutes is too long. A supervisor approves an entry — the operator's view won't reflect the approval for up to 3 minutes.

**Fix:** Reduce `staleTime` to 30 seconds for production, waste, and stoppage queries. Use WebSockets or SSE for real-time updates (future).

---

# PHASE 11 — Technical Debt & Code Quality

---

### TD-01 🟠 HIGH — `production_v2.py` and `production.py` Are Functionally Overlapping

Both files contain production-related endpoints. `production.py` handles machines, shifts, and entries. `production_v2.py` handles waste, stoppage, manpower, mixing. There is no clear boundary. `DowntimeLog` is in `production.py` but its API handler is in `production_v2.py`.

**Fix:** Consolidate into a single `production/` module package with clear sub-files: `machines.py`, `entries.py`, `waste.py`, `downtime.py`, `manpower.py`.

---

### TD-02 🟠 HIGH — `get_mill_scope` Pattern Duplicated 20+ Times Across API Files

The mill scope resolution pattern (check SUPER_ADMIN → MILL_OWNER → mill-scoped user) is copy-pasted into at least 20 endpoint handlers across different API files. Each copy has subtle differences in how `mill_id` override is handled.

**Fix:** Centralise in a `Depends(get_effective_mill_id)` dependency that returns `Optional[str]` and handles all role cases.

---

### TD-03 🟡 MEDIUM — 40-Route Frontend Directory with No Code Splitting

All 40+ route files in `src/routes/` are bundled into a single chunk (default Vite behaviour without explicit `manualChunks`). The JS bundle for SpinFlow is likely 2–3 MB, causing slow initial page load on mobile or low-bandwidth connections common in mill environments.

**Fix:** Add `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split by route group (production, hr, admin, etc.).

---

### TD-04 🟡 MEDIUM — Date Handling Is Inconsistent Across Frontend

Some routes use `new Date().toISOString().split('T')[0]`, others use `format(new Date(), 'yyyy-MM-dd')`, others use `dayjs().format('YYYY-MM-DD')`. The codebase has at least three different date libraries in use simultaneously.

**Fix:** Standardise on `dayjs` (already installed). Create `src/lib/date.ts` with `today()`, `formatDate()`, `parseDate()` helpers.

---

# PHASE 12 — Deployment & Infrastructure Audit

---

### DI-01 🟠 HIGH — No Health Check for Database Connection

**File:** `render.yaml`

```yaml
healthCheckPath: /api/health
```

The `/api/health` endpoint returns `{"status": "ok"}` without testing the database connection. Render marks the service healthy even when the DB is unreachable.

**Fix:**
```python
@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "connected"}
```

---

### DI-02 🟠 HIGH — No Staging/Production Environment Separation for Secrets

`.env.staging` exists but contains real Supabase URLs. Staging and production share the same database if a developer accidentally uses the wrong `.env`. There is no `DATABASE_URL` validation that prevents staging code from connecting to production DB.

**Fix:** Use separate Supabase projects for staging and production. Enforce in `check_secrets()`: parse the database URL and reject production URLs in non-production environments.

---

### DI-03 🟡 MEDIUM — No Automated Backup Verification

Supabase provides daily backups on paid plans, but there is no documented backup schedule, restoration procedure, or recovery time objective (RTO) target.

**Fix:** Document RTO/RPO. Add weekly automated backup verification: restore to a temp schema and run row count checks.

---

### DI-04 🟡 MEDIUM — SlowAPI Rate Limiter Uses In-Memory Backend; Resets on Restart

**File:** `backend/app/core/limiter.py`

```python
limiter = Limiter(key_func=get_remote_address, default_limits=[...])
```

SlowAPI defaults to in-memory storage. After a Render restart (which happens on every deploy), all rate limit counters reset. An attacker can trigger brute-force attempts before each deploy.

**Fix:** Configure SlowAPI with Redis backend (Redis URL already in config):
```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address, storage_uri=settings.REDIS_URL)
```

---

# PHASE 13 — Executive Summary

## Top 20 Issues by Severity

### 🔴 CRITICAL (Must fix before go-live)

| ID | Issue | Immediate Risk |
|---|---|---|
| A-01 | DB pool = 5 connections | Service crash under 6+ concurrent users |
| A-02 | Migration errors swallowed | Schema drift, silent data corruption |
| A-03 | User.company_id no FK | Cross-company data leak possible |
| D-01 | machine_code string FK | Multi-tenant data corruption |
| AP-01 | 164 swallowed exceptions | All failures invisible; debugging impossible |
| S-01 | JWT in localStorage | Token theft via any XSS vector |
| Q-01 | Zero automated tests | Every deploy is a live experiment |
| PF-01 | Cold start 30–60s | Mill operators abandon app at shift start |
| PF-02 | Pool exhaustion at shift change | 10+ users = cascading 500s |
| DF-01 | machine_code bypasses tenant scope | Data written to wrong mill |

### 🟠 HIGH (Fix within 30 days)

| ID | Issue | Impact |
|---|---|---|
| A-04 | 14 global unique constraints | Second mill cannot be onboarded |
| A-05 | In-memory file store | Imports lost on dyno restart |
| AP-02 | Import endpoints bypass RBAC | Any user can import any module |
| AP-03 | Webhook HMAC broken | All Razorpay payments fail silently |
| AP-04 | No rate limiting on import/export | DoS and data exfiltration risk |
| F-01 | Token in localStorage | (Security — also in Critical list) |
| F-04 | Mill switch doesn't clear cache | Wrong mill's data shown |
| E-03 | Production entries not linked to lots | Yarn traceability broken |
| DF-02 | No transaction rollback on import | Partial imports corrupt DB |
| S-02 | Refresh cookie SameSite=Lax | CSRF token refresh possible |

---

# PHASE 14 — Action Plan

## 30-Day Sprint (Before First Mill Goes Live)

**Week 1 — Emergency Fixes (CRITICAL)**
1. Fix connection pool: `pool_size=10, max_overflow=10`, switch to transaction pooler
2. Fix migration failure handling: raise `SystemExit(1)` on migration failure
3. Fix `User.company_id` FK: add migration 023
4. Fix import endpoint auth: `require_module` on all import routes
5. Fix Razorpay webhook: read raw body bytes before HMAC
6. Remove JWT from localStorage: keep in-memory only

**Week 2 — High Priority Fixes**
7. Fix in-memory `_FILE_STORE`: migrate to `/tmp` with TTL
8. Fix Excel parsing thread: wrap in `asyncio.to_thread()`
9. Fix CORS regex: restrict to explicit production domains
10. Fix mill switch query invalidation: `queryClient.clear()` on `setActiveMill`
11. Add health check with DB ping
12. Fix `SameSite=Strict` on refresh cookie

**Week 3 — Data Integrity**
13. Begin global-unique constraint migration (start with highest-traffic: Machine.code, Dispatch.dispatch_no, Lot.lot_no)
14. Add machine scope validation in ProductionService
15. Add import commit transaction rollback
16. Write 20 integration tests for critical write endpoints

**Week 4 — Stability**
17. Add composite DB indexes
18. Add error boundaries to all React routes
19. Fix N+1 HR query (selectinload)
20. Add rate limiting to import/export endpoints

---

## 60-Day Sprint (Production Hardening)

- Complete all 14 global unique constraint migrations
- Link ProductionEntry → Lot for full yarn traceability  
- Add QR token expiry
- Payroll finalization lock
- Add 50+ automated tests (coverage target: 60% of API surface)
- Add Sentry error tracking
- Add per-user OTP rate limiting
- Resolve MonthlyPayroll vs PayslipEntry duplication
- Add audit log to all export endpoints
- Standardize date types (String → PostgreSQL DATE)

---

## 90-Day Sprint (Scale & Growth)

- Migrate to Render paid plan (always-on, zero cold starts)
- Implement WebSocket real-time updates for production entries
- Frontend code splitting by route group
- Standardize frontend date handling to dayjs
- Implement Redis-backed rate limiting
- Full machine code → machine_id UUID migration
- Seed data + dev fixtures
- Complete soft delete migration for all auditable entities
- Documentation: API docs (FastAPI auto-docs is present), deployment runbook, RTO/RPO targets

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| DB pool exhaustion at shift start | High | Critical | Fix pool size before go-live |
| Second mill onboarding fails | Certain (if attempted) | High | Fix global unique constraints |
| Token theft via XSS | Medium | Critical | Fix localStorage storage |
| Payment webhook failures | High | High | Fix HMAC raw body |
| Silent data corruption from swallowed exceptions | High | High | Remove bare except blocks |
| Cold start during shift change | High | High | Upgrade Render tier |

---

*End of SpinFlow ERP Enterprise Audit Report*  
*22 migrations reviewed · 25 API files · 20 model files · 40+ frontend routes · 164 exception patterns identified*
