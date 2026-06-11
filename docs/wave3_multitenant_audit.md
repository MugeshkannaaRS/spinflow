# SpinFlow ERP — Wave 3 Multi-Tenant Readiness Audit

**Date:** 2026-06-11  
**Auditor:** Principal Database Architect  
**Scope:** All 24 SQLAlchemy model files + 22 Alembic migrations (001–022)  
**Basis:** READ ONLY — no code modified, no migrations created, no schema changed

---

## Executive Summary

SpinFlow's tenant hierarchy is `companies → mills → data`. The `mill_id FK → mills.id` pattern is the correct isolation primitive. As of migration 022 (HEAD), the implementation is **partially complete**:

- **14 tables** have correct `mill_id` with composite unique constraints ✅
- **21 tables** are missing `mill_id` entirely or have globally-unique business keys that are multi-tenant blockers ❌
- **9 tables** carry `mill_id` but their natural-key unique constraints are still global ❌
- **9 tables** reference `machines.code` via bare string column with no FK — will become ambiguous once `machines.code` becomes mill-scoped ❌
- **1 critical model/DB discrepancy**: `shifts.code` is `UNIQUE` globally in the DB (migration 001), but the Python model declares `UniqueConstraint("mill_id", "code")` — no migration ever converted it

**Bottom line:** SpinFlow cannot safely onboard a second company until at minimum the 20 critical unique constraints are converted to composite and the 7 highest-priority missing-mill_id tables are fixed. Estimated migration wave: 3 targeted ALTER TABLE migrations and 1 data-backfill migration.

---

## Report 1 — Tables Requiring mill_id or company_id

### 1A. Tables Missing mill_id — CRITICAL (cannot isolate tenants)

| # | Table | Problem | Current Isolation | Required Fix |
|---|-------|---------|-------------------|--------------|
| 1 | `dispatches` | No `mill_id` column at all; `dispatch_no` globally UNIQUE | None | Add `mill_id FK → mills.id NOT NULL`; composite unique |
| 2 | `inventory_items` | No `mill_id`; `code` globally UNIQUE | None | Add `mill_id`; composite unique |
| 3 | `cotton_bales` | No `mill_id`; `bale_number` globally UNIQUE | None | Add `mill_id FK → mills.id`; composite unique |
| 4 | `grn_entries` | No `mill_id`; `grn_no` globally UNIQUE | Via `cotton_purchase.mill_id` JOIN | Add `mill_id`; composite unique |
| 5 | `suppliers` | No `mill_id`; `code` globally UNIQUE | None | Add `mill_id`; composite unique |
| 6 | `vendors` | No `mill_id`; `code` globally UNIQUE | None | Add `mill_id`; composite unique |
| 7 | `technicians` | No `mill_id`; `code` globally UNIQUE | None | Add `mill_id`; composite unique |
| 8 | `quality_tests` | No `mill_id` | Via equipment/lot JOIN (fragile) | Add `mill_id FK → mills.id` |
| 9 | `lab_reports` | No `mill_id` | Via quality_test JOIN | Add `mill_id` |
| 10 | `quality_approvals` | No `mill_id` | Via quality_test JOIN | Add `mill_id` |
| 11 | `invoices` | `mill_id` is nullable; `invoice_no` globally UNIQUE | Partially enforced | Make `mill_id NOT NULL`; composite unique |
| 12 | `payments` | No `mill_id` | Via invoice JOIN | Add `mill_id` |
| 13 | `gst_entries` | No `mill_id` | Via invoice JOIN | Add `mill_id` |
| 14 | `maintenance_logs` | No `mill_id`; uses string `machine_code` | Via `machine_code → machines.code` JOIN (global) | Add `mill_id`; convert to UUID FK |
| 15 | `maintenance_schedule` | No `mill_id`; uses string `machine_code` | Same as above | Add `mill_id` |
| 16 | `machine_parameters` | No `mill_id`; uses string `machine_code` | Same | Add `mill_id` |
| 17 | `attendance` | No `mill_id` | Via `employee.mill_id` JOIN | Add `mill_id` |
| 18 | `leaves` | No `mill_id` | Via employee JOIN | Add `mill_id` |
| 19 | `employee_shifts` | No `mill_id` | Via employee JOIN | Add `mill_id` |
| 20 | `qr_scans` | No `mill_id` | Via entity JOIN | Add `mill_id` |
| 21 | `document_attachments` | No `mill_id`; entity-type pattern | Via entity JOIN | Add `mill_id` (nullable OK for cross-entity) |

### 1B. Tables with mill_id but Broken Unique Key — HIGH

| # | Table | Problem | Fix |
|---|-------|---------|-----|
| 1 | `production_entries` | No `mill_id` column; isolation via `machine_code → machines.mill_id` string join | Add `mill_id` directly; eliminate JOIN dependency |
| 2 | `shifts` | `mill_id` present; but DB has `UNIQUE(code)` globally (migration 001); Python model declares composite but no migration was created | Drop global unique; add `UNIQUE(mill_id, code)` |
| 3 | `warehouses` | `mill_id` present; DB has `UNIQUE(code)` globally (migration 001) | Drop global unique; add `UNIQUE(mill_id, code)` |
| 4 | `monthly_payroll` | `mill_id` present (migration 001); but unique constraint is `(employee_id, month, year)` — no `mill_id` in the key | Replace with `(mill_id, employee_id, month, year)` |
| 5 | `cotton_purchases` | `mill_id` present but **nullable** | Backfill and make NOT NULL |
| 6 | `spares` | `mill_id` present; `code` is `UNIQUE` globally | Drop global unique; add `UNIQUE(mill_id, code)` |

### 1C. Correctly Isolated Tables — Already Multi-Tenant Safe ✅

`employees` (fixed migration 021), `payroll_months`, `payslip_entries`, `lots`, `inventory_bags`, `stock_ledger`, `stock_balance`, `sales_orders` (mill_id ✓, but so_no global — see Report 2), `stock_transfers` (mill_id ✓, transfer_no global), `trips` (mill_id ✓, trip_no global), `mixing_recipes`, `mixing_change_log`, `laydown_records`, `bale_consumption_log`, `jcp_clearances`, `utility_breakdowns`, `waste_stock`, `waste_transfers`, `splice_quality_log`, `shift_manpower_plan`, `waste_entries`, `rf_manpower_plan`, `spare_issues`, `downtime_logs` (mill_id added in migration 019).

Platform-level (correctly scoped to company, not mill): `companies`, `mills`, `billing_invoices`, `billing_payments`, `company_subscriptions`, `subscription_plans`, `deletion_log`, `audit_logs`, `users`, `user_sessions`, `roles`.

---

## Report 2 — Broken Unique Constraints

All constraints below exist in the **live database**. The Python model may say otherwise; the migration DDL is the source of truth.

### 2A. CRITICAL — Block multi-company onboarding immediately

| Table | Column | DB Constraint | Action Required | Migration? |
|-------|--------|---------------|-----------------|------------|
| `machines` | `code` | `UNIQUE INDEX ix_machines_code` (migration 001) | Drop; add `UNIQUE(mill_id, code)` | New migration |
| `dispatches` | `dispatch_no` | `UNIQUE INDEX ix_dispatches_dispatch_no` (migration 001) | Drop; add `mill_id` column; add `UNIQUE(mill_id, dispatch_no)` | New migration |
| `invoices` | `invoice_no` | `UNIQUE` (model definition, confirmed globally unique) | Make `mill_id` NOT NULL; add `UNIQUE(mill_id, invoice_no)` | New migration |
| `shifts` | `code` | `UNIQUE (code)` inline in CREATE TABLE (migration 001); **model/DB discrepancy** | Drop global; add `UNIQUE(mill_id, code)` | New migration |
| `inventory_items` | `code` | `UNIQUE INDEX ix_inventory_items_code` (migration 001); no `mill_id` | Add `mill_id`; drop global; add `UNIQUE(mill_id, code)` | New migration |

### 2B. HIGH — Block second mill onboarding within same company

| Table | Column | DB Constraint | Action Required |
|-------|--------|---------------|-----------------|
| `mills` | `code` | `UNIQUE INDEX ix_mills_code` (migration 001) | Drop; add `UNIQUE(company_id, code)` |
| `warehouses` | `code` | `UNIQUE (code)` inline DDL (migration 001) | Drop; add `UNIQUE(mill_id, code)` |
| `customers` | `code` | `unique=True` inline (migration 003) | Drop; add `UNIQUE(mill_id, code)` |
| `master_vehicles` | `vehicle_no` | `unique=True` inline (migration 003) | Drop; add `UNIQUE(mill_id, vehicle_no)` |
| `master_routes` | `code` | `unique=True` inline (migration 003) | Drop; add `UNIQUE(mill_id, code)` |
| `lots` | `lot_no` | `unique=True` inline (model) | Drop; add `UNIQUE(mill_id, lot_no)` |
| `sales_orders` | `so_no` | `unique=True` inline (migration 004) | Drop; add `UNIQUE(mill_id, so_no)` |
| `stock_transfers` | `transfer_no` | `unique=True` inline (migration 004) | Drop; add `UNIQUE(mill_id, transfer_no)` |
| `trips` | `trip_no` | `unique=True` inline (migration 005) | Drop; add `UNIQUE(mill_id, trip_no)` |
| `cotton_bales` | `bale_number` | `UNIQUE INDEX ix_cotton_bales_bale_number` (migration 001); no `mill_id` | Add `mill_id`; drop global; add `UNIQUE(mill_id, bale_number)` |
| `grn_entries` | `grn_no` | `UNIQUE (grn_no)` inline DDL (migration 001) | Add `mill_id`; drop global; add `UNIQUE(mill_id, grn_no)` |
| `suppliers` | `code` | `UNIQUE (code)` inline DDL (migration 001); no `mill_id` | Add `mill_id`; drop global; add `UNIQUE(mill_id, code)` |
| `spares` | `code` | `unique=True` inline (model); `mill_id` present but unused in constraint | Drop global; add `UNIQUE(mill_id, code)` |
| `vendors` | `code` | `unique=True` inline (model); no `mill_id` | Add `mill_id`; drop global; add `UNIQUE(mill_id, code)` |
| `technicians` | `code` | `UNIQUE (code)` inline (model); no `mill_id` | Add `mill_id`; drop global; add `UNIQUE(mill_id, code)` |
| `monthly_payroll` | `(employee_id, month, year)` | `uq_payroll_emp_month_year` (migration 009) | Replace with `(mill_id, employee_id, month, year)` |

### 2C. MEDIUM — Audit logs and config tables (intentionally global, OK)

`roles.code`, `subscription_plans.code`, `companies.code`, `users.email` — these are platform-scoped and globally unique by design. No action needed.

---

## Report 3 — Foreign Key Review

### 3A. String FKs (no DB constraint, will break under composite machine codes)

All 9 tables below reference `machines.code` as a bare `VARCHAR(50)` column. There is no `FOREIGN KEY` constraint in the database. Once `machines.code` is made mill-scoped (composite unique), these string references become **ambiguous** — the same code can exist in two mills.

| Table | Column | Current Pattern | Required Fix |
|-------|--------|-----------------|-------------|
| `production_entries` | `machine_code` | `VARCHAR(50)`, no FK | Add `machine_id VARCHAR(36) FK → machines.id` |
| `downtime_logs` | `machine_code` | `VARCHAR(50)`, no FK | Add `machine_id FK → machines.id` |
| `maintenance_logs` | `machine_code` | `VARCHAR(50)`, no FK | Add `machine_id FK → machines.id` |
| `maintenance_schedule` | `machine_code` | `VARCHAR(50)`, no FK | Add `machine_id FK → machines.id` |
| `waste_entries` | `machine_code` | `VARCHAR(50)`, no FK | Add `machine_id FK → machines.id` |
| `machine_parameters` | `machine_code` | `VARCHAR(50)`, no FK | Add `machine_id FK → machines.id` |
| `splice_quality_log` | `machine_code` | `VARCHAR(50)`, nullable, no FK | Add `machine_id FK → machines.id` |
| `laydown_records` | `machine_code` | `VARCHAR(50)`, nullable, no FK | Add `machine_id FK → machines.id` |
| `bale_consumption_log` | `machine_code` | `VARCHAR(50)`, nullable, no FK | Add `machine_id FK → machines.id` |

**Migration strategy:** Add `machine_id` column alongside `machine_code`; backfill via `UPDATE t SET machine_id = m.id FROM machines m WHERE m.code = t.machine_code AND m.mill_id = t.mill_id`; make NOT NULL; keep `machine_code` as denormalized cache (read-only, not used for joins). Do not drop `machine_code` yet — it's used in serializers and display logic throughout the frontend.

### 3B. Missing FK Constraints on Existing Columns

| Table | Column | Model Declaration | DB FK Constraint | Risk |
|-------|--------|------------------|-----------------|------|
| `users` | `company_id` | `String(36), nullable` | **No FK constraint** | Orphaned users if company deleted |
| `users` | `mill_id` | `String(36), nullable` | **No FK constraint** | Orphaned users if mill deleted |
| `downtime_logs` | `mill_id` | `String(36), nullable` | No FK constraint | Dirty data on mill delete |
| `import_mappings` | `mill_id` | `String(36), nullable` | No FK constraint | Orphaned mappings |
| `column_configs` | `mill_id` | `String(36), nullable` | No FK constraint | Orphaned configs |
| `mill_record_values` | `mill_id` | `String(36), no FK` | No FK constraint | Orphaned values |
| `bale_consumption_log` | `lot_id` | `String(36), nullable` | No FK constraint | No referential integrity |

### 3C. Nullable FKs That Must Become NOT NULL

| Table | Column | Currently | Should Be |
|-------|--------|-----------|-----------|
| `cotton_purchases` | `mill_id` | Nullable FK | NOT NULL |
| `invoices` | `mill_id` | Nullable FK | NOT NULL |
| `production_entries` | (no mill_id) | N/A | NOT NULL after add |

### 3D. Cascade-Delete Gaps

Tables that reference parent records but have no `ON DELETE CASCADE` or `ON DELETE RESTRICT`:
- `maintenance_logs → machines` (string ref, no FK at all — no cascade possible)
- `quality_tests → employees/lots` (model uses nullable FKs with no cascade declared)
- `attendance → employees` (FK exists, but no explicit cascade in migration DDL)
- `monthly_payroll → employees` (same)

---

## Report 4 — Data Audit SQL Queries

Run these against the live Supabase database to quantify the current state before writing any migration.

```sql
-- =========================================================
-- 4A. Count rows in tables missing mill_id
--     (all of these need backfill before adding NOT NULL)
-- =========================================================

SELECT 'dispatches'      AS tbl, COUNT(*) FROM dispatches
UNION ALL
SELECT 'inventory_items',           COUNT(*) FROM inventory_items
UNION ALL
SELECT 'cotton_bales',              COUNT(*) FROM cotton_bales
UNION ALL
SELECT 'grn_entries',               COUNT(*) FROM grn_entries
UNION ALL
SELECT 'suppliers',                 COUNT(*) FROM suppliers
UNION ALL
SELECT 'vendors',                   COUNT(*) FROM vendors
UNION ALL
SELECT 'technicians',               COUNT(*) FROM technicians
UNION ALL
SELECT 'quality_tests',             COUNT(*) FROM quality_tests
UNION ALL
SELECT 'lab_reports',               COUNT(*) FROM lab_reports
UNION ALL
SELECT 'quality_approvals',         COUNT(*) FROM quality_approvals
UNION ALL
SELECT 'invoices',                  COUNT(*) FROM invoices
UNION ALL
SELECT 'payments',                  COUNT(*) FROM payments
UNION ALL
SELECT 'gst_entries',               COUNT(*) FROM gst_entries
UNION ALL
SELECT 'maintenance_logs',          COUNT(*) FROM maintenance_logs
UNION ALL
SELECT 'maintenance_schedule',      COUNT(*) FROM maintenance_schedule
UNION ALL
SELECT 'machine_parameters',        COUNT(*) FROM machine_parameters
UNION ALL
SELECT 'production_entries',        COUNT(*) FROM production_entries
ORDER BY tbl;


-- =========================================================
-- 4B. How many distinct mills exist?
--     (If > 1, global unique constraints already VIOLATED)
-- =========================================================

SELECT c.name AS company, m.id AS mill_id, m.code AS mill_code, m.name AS mill_name
FROM mills m
JOIN companies c ON c.id = m.company_id
ORDER BY c.name, m.code;


-- =========================================================
-- 4C. Identify duplicate machine codes across mills
--     (would break composite unique on machines)
-- =========================================================

SELECT code, COUNT(DISTINCT mill_id) AS mills_using_code, COUNT(*) AS total_rows
FROM machines
GROUP BY code
HAVING COUNT(DISTINCT mill_id) > 1
ORDER BY total_rows DESC;


-- =========================================================
-- 4D. Identify duplicate shift codes across mills
--     (migration 001 has UNIQUE(code) globally)
-- =========================================================

SELECT code, COUNT(DISTINCT mill_id) AS mill_count, array_agg(DISTINCT mill_id) AS mills
FROM shifts
GROUP BY code
HAVING COUNT(DISTINCT mill_id) > 1;


-- =========================================================
-- 4E. Identify duplicate warehouse codes across mills
-- =========================================================

SELECT code, COUNT(DISTINCT mill_id) AS mill_count
FROM warehouses
GROUP BY code
HAVING COUNT(DISTINCT mill_id) > 1;


-- =========================================================
-- 4F. Verify cotton_purchases.mill_id null coverage
-- =========================================================

SELECT
    mill_id IS NULL AS is_null,
    COUNT(*) AS row_count
FROM cotton_purchases
GROUP BY (mill_id IS NULL);


-- =========================================================
-- 4G. Production entries — current isolation via machine join
--     (all entries must resolve to a single mill)
-- =========================================================

SELECT
    m.mill_id,
    COUNT(pe.id) AS entry_count,
    MIN(pe.date)  AS earliest_date,
    MAX(pe.date)  AS latest_date
FROM production_entries pe
JOIN machines m ON m.code = pe.machine_code
GROUP BY m.mill_id
ORDER BY entry_count DESC;


-- =========================================================
-- 4H. Orphaned production entries
--     (machine_code references a machine that no longer exists)
-- =========================================================

SELECT COUNT(*) AS orphaned_entries
FROM production_entries pe
WHERE NOT EXISTS (
    SELECT 1 FROM machines m WHERE m.code = pe.machine_code
);


-- =========================================================
-- 4I. Duplicate lot_no across mills
-- =========================================================

SELECT lot_no, COUNT(DISTINCT mill_id) AS mill_count
FROM lots
GROUP BY lot_no
HAVING COUNT(DISTINCT mill_id) > 1;


-- =========================================================
-- 4J. Global unique constraint violation check
--     (run each before dropping global unique)
-- =========================================================

-- machines.code
SELECT code, COUNT(*) FROM machines GROUP BY code HAVING COUNT(*) > 1;

-- dispatches.dispatch_no
SELECT dispatch_no, COUNT(*) FROM dispatches GROUP BY dispatch_no HAVING COUNT(*) > 1;

-- lots.lot_no
SELECT lot_no, COUNT(*) FROM lots GROUP BY lot_no HAVING COUNT(*) > 1;

-- shifts.code
SELECT code, COUNT(*) FROM shifts GROUP BY code HAVING COUNT(*) > 1;

-- warehouses.code
SELECT code, COUNT(*) FROM warehouses GROUP BY code HAVING COUNT(*) > 1;

-- sales_orders.so_no
SELECT so_no, COUNT(*) FROM sales_orders GROUP BY so_no HAVING COUNT(*) > 1;

-- trips.trip_no
SELECT trip_no, COUNT(*) FROM trips GROUP BY trip_no HAVING COUNT(*) > 1;


-- =========================================================
-- 4K. Verify monthly_payroll unique constraint gap
--     (same employee+month+year in two mills would violate
--      the intended per-mill uniqueness)
-- =========================================================

SELECT employee_id, month, year, COUNT(DISTINCT mill_id) AS mill_count
FROM monthly_payroll
GROUP BY employee_id, month, year
HAVING COUNT(DISTINCT mill_id) > 1;


-- =========================================================
-- 4L. String FK integrity — machine_code orphans per table
-- =========================================================

SELECT 'production_entries' AS tbl,
       COUNT(*) AS orphaned
FROM production_entries pe
WHERE pe.machine_code NOT IN (SELECT code FROM machines)

UNION ALL

SELECT 'downtime_logs',
       COUNT(*)
FROM downtime_logs dl
WHERE dl.machine_code NOT IN (SELECT code FROM machines)

UNION ALL

SELECT 'maintenance_logs',
       COUNT(*)
FROM maintenance_logs ml
WHERE ml.machine_code NOT IN (SELECT code FROM machines);


-- =========================================================
-- 4M. invoices — null mill_id count
-- =========================================================

SELECT mill_id IS NULL AS null_mill, COUNT(*) FROM invoices GROUP BY (mill_id IS NULL);


-- =========================================================
-- 4N. List all existing DB unique indexes/constraints
--     (cross-reference with what the Python models declare)
-- =========================================================

SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
    AND kcu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'UNIQUE'
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
ORDER BY tc.table_name, tc.constraint_name;
```

---

## Report 5 — Migration Dependency Graph

All 22 migrations are **strictly linear** (single-chain, no branches):

```
001_initial_schema
    └─ 002_deferred_fixes          (users: login lockout columns)
        └─ 003_sprint1_masters     (customers, yarn_counts, master_departments, master_routes, master_vehicles)
            └─ 004_sprint2_stock_ledger  (stock_ledger, stock_balance, sales_orders, stock_transfers)
                └─ 005_sprint3_lotrac    (lots, inventory_bags, trips, trip_items, trip_scan_logs)
                    └─ 006_sprint5_payroll  (employees.mill_id, payroll_months, payslip_entries)
                        └─ 007_ui_config     (column_configs unique constraint)
                            └─ 008_company_structure  (company_modules, mill_settings, re-adds users.company_id)
                                └─ 009_hr_employee_columns  (employees: 20+ columns, monthly_payroll unique)
                                    └─ 010_missing_columns  (spares.mill_id, spare_issues.mill_id, machine_parameters)
                                        └─ 011_column_config_enhance  (column_dropdown_options)
                                            └─ 012_import_mappings  (import_mappings table)
                                                └─ 013_employee_custom_fields  (employee_custom_fields)
                                                    └─ 014_user_module_restrictions  (users.module_restrictions)
                                                        └─ 015_billing_tables  (subscription_plans, company_subscriptions, billing_invoices)
                                                            └─ 016_mill_masters  (mill_masters, mill_custom_fields, mill_record_values)
                                                                └─ 017_billing_commerce  (billing_payments, overage_pricing)
                                                                    └─ 018_deletion_log_table  (deletion_log)
                                                                        └─ 019_production_module_v2  (mixing_*, laydown_*, jcp_clearances, utility_breakdowns, waste_stock, waste_transfers, splice_quality_log, shift_manpower_plan; downtime_logs.mill_id ADDED)
                                                                            └─ 020_waste_entries_stopcode_manpower  (datalog_stop_codes, waste_entries, rf_manpower_plan, mixing_change_fibre_rows)
                                                                                └─ 021_fix_employee_code_unique  (employees.code: global → composite mill_id)
                                                                                    └─ 022_fix_stop_time_columns
                                                                                        └─ [HEAD — 023+ pending]
```

**Key observations:**
- Migration 003 added `mill_id` to machines and shifts in upgrade, then drops them in downgrade — suggesting these columns were added mid-sprint and the downgrade is stale. However, migration 001 already created machines and shifts with `mill_id` columns, so migration 003's add was a no-op (it used `IF NOT EXISTS`).
- Migration 006 adds `mill_id` to employees in upgrade and drops it in downgrade. Same pattern.
- Migration 021 is the only migration that correctly fixes a global → composite unique constraint (employees.code). It serves as the template for all future constraint migrations.
- **No migration has ever fixed**: machines.code, shifts.code, warehouses.code, dispatches.dispatch_no, lots.lot_no, or any of the other globally-unique business keys.

---

## Report 6 — Rollback Plan for Future Wave 3 Migrations

When Wave 3 migrations are authorized, each must be independently reversible. Below is the rollback strategy for each category of change.

### 6A. Global-Unique → Composite-Unique (template from migration 021)

```python
def upgrade():
    # Step 1: Drop the old global unique index
    op.execute("DROP INDEX IF EXISTS ix_machines_code")
    # or for inline constraints:
    # op.drop_constraint("machines_code_key", "machines", type_="unique")

    # Step 2: Add composite unique constraint
    op.execute("""
        ALTER TABLE machines
        ADD CONSTRAINT uq_machines_mill_code UNIQUE (mill_id, code)
    """)
    # Step 3: Re-create non-unique index for fast lookup
    op.execute("CREATE INDEX IF NOT EXISTS ix_machines_code ON machines (code)")

def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_machines_code")
    op.execute("ALTER TABLE machines DROP CONSTRAINT IF EXISTS uq_machines_mill_code")
    op.execute("CREATE UNIQUE INDEX ix_machines_code ON machines (code)")
```

**Risk on rollback:** If the upgrade ran with duplicate codes across mills, the downgrade will fail with a unique violation. Pre-migration data audit (Report 4 section 4C) must confirm zero duplicates first.

### 6B. Add mill_id to Tables Without It

```python
def upgrade():
    # 1. Add nullable column first (never lock the table on large datasets)
    op.add_column("dispatches",
        sa.Column("mill_id", sa.String(36),
                  sa.ForeignKey("mills.id"), nullable=True, index=True))

    # 2. Backfill — strategy depends on available parent FK:
    #    a) Direct: table has customer_id or lot_id that resolves to a mill
    op.execute("""
        UPDATE dispatches d
        SET mill_id = l.mill_id
        FROM lots l
        WHERE d.lot_id = l.id
          AND d.mill_id IS NULL
    """)
    #    b) For tables with no resolvable parent: set to the single existing mill
    #       (only safe when there is exactly ONE mill in the DB — verify first)
    op.execute("""
        UPDATE dispatches
        SET mill_id = (SELECT id FROM mills LIMIT 1)
        WHERE mill_id IS NULL
    """)

    # 3. Make NOT NULL after backfill
    op.execute("ALTER TABLE dispatches ALTER COLUMN mill_id SET NOT NULL")

    # 4. Swap unique constraint
    op.execute("DROP INDEX IF EXISTS ix_dispatches_dispatch_no")
    op.execute("""
        ALTER TABLE dispatches
        ADD CONSTRAINT uq_dispatches_mill_dispatch_no UNIQUE (mill_id, dispatch_no)
    """)

def downgrade():
    op.execute("ALTER TABLE dispatches DROP CONSTRAINT IF EXISTS uq_dispatches_mill_dispatch_no")
    op.execute("CREATE UNIQUE INDEX ix_dispatches_dispatch_no ON dispatches (dispatch_no)")
    op.drop_index("ix_dispatches_mill_id", "dispatches")
    op.drop_column("dispatches", "mill_id")
```

### 6C. String FK → UUID FK (machine_code → machine_id)

```python
def upgrade():
    # 1. Add new UUID FK column alongside old string column (keep both)
    op.add_column("production_entries",
        sa.Column("machine_id", sa.String(36),
                  sa.ForeignKey("machines.id"), nullable=True, index=True))

    # 2. Backfill using existing mill_id join when available
    op.execute("""
        UPDATE production_entries pe
        SET machine_id = m.id
        FROM machines m
        WHERE m.code = pe.machine_code
    """)
    # Note: if machine codes are ambiguous (duplicates across mills), this query
    # must include a mill_id join. Fix global unique on machines FIRST.

    # 3. Do NOT drop machine_code yet — frontend still uses it for display
    # Set NOT NULL only after confirming 100% backfill rate
    -- op.execute("ALTER TABLE production_entries ALTER COLUMN machine_id SET NOT NULL")

def downgrade():
    op.drop_column("production_entries", "machine_id")
```

**Critical dependency:** The `machine_code → machine_id` migration MUST run AFTER `machines.code` is made mill-scoped. If machines.code is still globally unique, the `UPDATE ... WHERE m.code = pe.machine_code` join is unambiguous and safe to run now.

### 6D. Rollback Priority and Risk Table

| Migration Category | Rollback Risk | Precondition Query | Estimated Downtime |
|-------------------|---------------|--------------------|-------------------|
| machines.code global → composite | LOW (zero duplicates expected) | 4C | < 1s |
| shifts.code global → composite | LOW | 4D | < 1s |
| warehouses.code global → composite | LOW | 4E | < 1s |
| Add mill_id to dispatches | MEDIUM (backfill needed) | 4A row count | < 5s |
| Add mill_id to inventory_items | MEDIUM | 4A row count | < 5s |
| string machine_code → UUID FK | MEDIUM | 4L orphan check | < 30s |
| monthly_payroll unique swap | LOW (mill_id already in row) | 4K | < 1s |
| cotton_purchases.mill_id NOT NULL | LOW (already populated) | 4F | < 1s |
| invoices.mill_id NOT NULL | MEDIUM (may have nulls) | 4M | < 5s |

---

## Prioritized Execution Plan (for when Wave 3 is authorized)

### Phase A — Zero-downtime constraint fixes (no data migration needed)
Requires: all 4J queries return 0 rows

1. `023_fix_machines_code_unique`: `machines.code` global → `(mill_id, code)` composite
2. `024_fix_shifts_warehouses_unique`: `shifts.code` and `warehouses.code` global → composite
3. `025_fix_lot_so_trip_unique`: `lots.lot_no`, `sales_orders.so_no`, `stock_transfers.transfer_no`, `trips.trip_no` global → composite
4. `026_fix_mills_code_unique`: `mills.code` global → `(company_id, code)` composite

### Phase B — Add mill_id to high-impact tables (data migration)
Requires: Phase A complete, backfill queries verified

5. `027_add_mill_id_dispatches`: add + backfill + NOT NULL + composite unique
6. `028_add_mill_id_inventory_items`: add + backfill + NOT NULL + composite unique
7. `029_add_mill_id_suppliers_vendors_technicians`: batch of smaller tables
8. `030_fix_monthly_payroll_unique`: replace `(employee_id, month, year)` with `(mill_id, employee_id, month, year)`

### Phase C — UUID FK migration (most invasive)
Requires: Phase A complete (machines.code is now mill-scoped)

9. `031_add_machine_id_fk`: Add `machine_id UUID FK` alongside `machine_code` in all 9 affected tables; backfill; leave `machine_code` in place
10. After frontend migrated to use `machine_id`: `032_drop_machine_code` (separate sprint)

### Phase D — Remaining missing mill_ids
11. `033_add_mill_id_quality`: quality_tests, lab_reports, quality_approvals
12. `034_add_mill_id_accounts`: invoices (NOT NULL), payments, gst_entries
13. `035_add_mill_id_maintenance`: maintenance_logs, maintenance_schedule, machine_parameters

### Phase E — FK constraints (cleanup, no downtime)
14. `036_add_missing_fk_constraints`: users.company_id, users.mill_id, import_mappings.mill_id, etc.

---

## Model/Migration Discrepancies Found

These are places where the Python model declares a constraint that does not exist in the database:

| Model | Model Declares | DB Reality | Discrepancy |
|-------|---------------|------------|-------------|
| `Shift.__table_args__` | `UniqueConstraint("mill_id", "code")` | `UNIQUE (code)` globally (migration 001) | Model is aspirational — DB has global unique |
| `Machine.code` | `unique=True` in column def | `UNIQUE INDEX ix_machines_code` globally | Consistent — both are global, both wrong |
| `Warehouse.code` | `unique=True` in column def | `UNIQUE (code)` inline DDL | Consistent — both global, both need fix |
| `downtime_logs.mill_id` | `String(36), nullable, no FK` | Column exists (added migration 019) | Model missing FK annotation — minor |
| `import_mappings` | Old-style `Column()` API | New-style `Mapped[]` used elsewhere | Style inconsistency only, not a bug |

---

*End of Wave 3 Multi-Tenant Readiness Audit. All findings are read-only observations. No code was modified. Authorize Wave 3 execution plan before running any migration.*
