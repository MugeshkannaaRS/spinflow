# Per-Mill Customization — Audit, Architecture & Implementation Plan

**Date:** 2026-06-21
**Scope:** How far does SpinFlow ERP's per-mill customization go today, and what's needed to support genuinely different workflows per mill without forking code.

---

## Phase 1 — Current Customization Capability: Gap Table

### Gap Table

| # | Capability | Exists today? | How far does it go? | Gap vs full vision | Effort |
|---|-----------|---------------|---------------------|--------------------|--------|
| **1** | **Field label renaming** | ⚠️ Skeleton only | Labels stored in `ColumnConfig.label` DB JSON blob; returned by `GET /ui-config/columns`. **Zero consuming surfaces actually use them** — DataTable CSV/PDF exports use hardcoded `ColDef.label`, backend `excel_export.py` uses `data[0].keys()`, `pdf_export.py` uses `h.replace("_", " ").title()`, import_mapper.py uses `field_aliases.py` not labels. The column-configurator UI (`column-configurator.tsx`) cannot edit labels — only `is_visible` and `display_order`. | Labels stored but never reach a single user-facing surface | **L** |
| **2** | **Dropdown/option customization** | ⚠️ Partial (4/10) | **Configurable:** Departments (`MillSettings.dept_names` JSONB), Shift names (`MillSettings.shift_names`), Column-specific dropdown options (`ColumnDropdownOption` model — SUPER_ADMIN only). **Inferred (read-only):** Designations, Grades, Machine types. **Hardcoded:** Leave types, Payment modes, Quality grades, Yarn counts (not per-mill scoped). | No management UI for MILL_OWNER on ColumnDropdownOption; 4 dropdowns hardcoded with no per-mill override | **M** |
| **3** | **Module toggles** | ✅ **COMPLETE** | All 8 enforcement layers work end-to-end: login response → Zustand store → `useModuleAccess` hook → sidebar filter → route guard `ModuleAccessGuard` → backend `require_module()` → `resolve_access()` company subscription check → `RoleModuleAccess` override. Admin UI for toggling exists. | No gap — this is the most mature customization feature | **S** |
| **4** | **Custom fields** | ⚠️ Partial (2/10 modules) | **Supported:** Employees + Machines have full custom field pipelines (DB storage, API, list rendering, form edit, import auto-detection). **Not supported:** Attendance, Payroll, Dispatch, Stores, Quality, Production, Stock, Inventory, Accounts, Maintenance. **Data integrity risk:** TWO parallel systems exist — `EmployeeCustomField`/`EmployeeCustomValue` (older, company-wide) AND `MillCustomField`/`MillRecordValue` (newer, per-mill). | Dual-system debt; 8 modules without custom field support; no field-placement UI | **L** |
| **5** | **Role customization** | ⚠️ Partial (configurable but not extensible) | 14 roles are hardcoded in `rbac.py:14-20`. Companies can disable roles (`CompanyRoleConfig.is_enabled`) and override per-module access (`RoleModuleAccess`). SUPER_ADMIN-only UI. MILL_OWNER cannot self-manage. **Cannot create new role archetypes.** | No role extensibility — a mill that needs "Compliance Officer" or "Lab Technician" must reuse an existing role | **L** |
| **6** | **Workflow variation** | ❌ **Minimal** | Dispatch has a hardcoded 5-state machine (pending→loading→ready→dispatched→cancelled). LoTrac has an independent QR-flow. **No configurable state transitions, no configurable approval steps, no per-mill workflow paths.** A mill that wants simple manual dispatch without QR has no alternate path. | No workflow engine; dispatch and LoTrac are hardcoded flows | **XL** |
| **7** | **KPI/dashboard customization** | ❌ **Minimal** | 7 role-fixed dashboard layouts in `RoleDashboards.tsx`. MILL_OWNER sees ALL sections; others see a fixed subset. **No per-mill KPI selection, no widget picker, no drag-and-drop layout.** KPI thresholds partially configurable (quality CV%, CSP min via `MillSettings`). | No per-mill dashboard customization — Mill A and Mill B with the same role see identical KPIs | **XL** |
| **8** | **Numbering/format customization** | ⚠️ Partial (1/5) | **Configurable:** Employee code (prefix + digits via `MillSettings` — migration 045). Currency (per subscription). **Hardcoded:** Invoice number (`INV-YYYYMM-NNNN` in `billing_invoice_service.py`), Dispatch number (`DSP-YYYYMMDD-HHMMSS`), Date format (IN locale, YYYY-MM-DD). | Invoice/dispatch/document numbering not configurable; date format global | **M** |

---

## Phase 2 — Architecture for Full Per-Mill Differentiation

### 2.1 Design Principles

1. **One config profile per mill** — a single JSON document (or DB record) that determines enabled modules, field labels, dropdowns, numbering, locale, and dashboard layout
2. **Config changes == no code changes** — the common case requires zero deploys
3. **No branching in components** — frontend rendering reads config, not `if millId === x`
4. **Excel/PDF read from same config** — imports and exports consume `MillConfig`, not local hardcoded strings
5. **Security rules stay uniform** — multi-tenant isolation, audit logging, and permission matrix are NEVER made configurable

### 2.2 Proposed Schema

#### `mill_configuration_profiles` (new table)
```sql
CREATE TABLE mill_configuration_profiles (
    id VARCHAR(36) PRIMARY KEY DEFAULT generate_uuid(),
    mill_id VARCHAR(36) NOT NULL REFERENCES mills(id) ON DELETE CASCADE,
    -- Enabled modules (overrides CompanyModule for this mill — subset only)
    enabled_modules TEXT[] NOT NULL DEFAULT '{}',
    disabled_roles TEXT[] NOT NULL DEFAULT '{}',
    -- Locale
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    date_format VARCHAR(20) NOT NULL DEFAULT 'YYYY-MM-DD',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    -- Numbering formats (Python format strings with {year}{month}{seq} etc.)
    employee_code_format VARCHAR(100) NOT NULL DEFAULT '{prefix}-{padded_seq}',
    invoice_number_format VARCHAR(100) NOT NULL DEFAULT 'INV-{year}{month}-{seq}',
    dispatch_number_format VARCHAR(100) NOT NULL DEFAULT 'DSP-{prefix}{ymd}-{seq}',
    -- Dashboard KPI selection
    dashboard_kpis TEXT[] NOT NULL DEFAULT '{}', -- empty = all enabled for role
    -- Dashboard widget layout (JSON)
    dashboard_layout JSONB NOT NULL DEFAULT '{}',
    -- Custom field labels (overrides ColumnConfig for this mill)
    -- Key = "module.field", Value = label string
    field_labels JSONB NOT NULL DEFAULT '{}',
    -- Dropdown overrides (overrides defaults)
    -- Key = dropdown_name (e.g., "leave_types", "payment_modes")
    -- Value = array of option objects
    dropdown_options JSONB NOT NULL DEFAULT '{}',
    -- Created/Updated
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(mill_id)
);
```

#### `field_label_overrides` (normalized alternative to JSONB if query performance matters)
```sql
CREATE TABLE field_label_overrides (
    id VARCHAR(36) PRIMARY KEY DEFAULT generate_uuid(),
    mill_id VARCHAR(36) NOT NULL REFERENCES mills(id) ON DELETE CASCADE,
    module VARCHAR(50) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    UNIQUE(mill_id, module, field_name)
);
```

#### `numbering_sequences` (per-mill sequence state)
```sql
CREATE TABLE numbering_sequences (
    id VARCHAR(36) PRIMARY KEY DEFAULT generate_uuid(),
    mill_id VARCHAR(36) NOT NULL REFERENCES mills(id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL,  -- 'invoice', 'dispatch', 'employee', ...
    year_month VARCHAR(6) NOT NULL, -- '202606'
    sequence INTEGER NOT NULL DEFAULT 0,
    UNIQUE(mill_id, doc_type, year_month)
);
```

### 2.3 API Contract Changes

#### New endpoint
```
GET    /mill-config/profile          → returns full MillConfigProfile for current mill
PUT    /mill-config/profile          → updates profile (MILL_OWNER or SUPER_ADMIN)
```

#### Existing endpoint changes
- `GET /ui-config/columns` — already returns JSONB; add `display_label` field that applies override from `mill_configuration_profiles.field_labels`
- `GET /hr/employees` — already includes `custom_fields`; add `display_labels` with resolved field names
- `POST /import/hub` — `import_mapper.py` should read `profile.field_labels` for column matching, not just `field_aliases.py`

### 2.4 Frontend Architecture

```
[MilleConfigProvider]           // React context, fetches GET /mill-config/profile once
    ↓
[CustomLabel(module, field)]    // component: renders label from profile or falls back to default
[CustomDropdown(name)]          // component: renders dropdown from profile options or falls back to default
[NumberingPreview(format)]      // component: shows live preview of numbering format
[DashboardWidgetGrid]           // component: reads profile.dashboard_layout for widget placement
```

**Key rule:** Every label in every component must go through `CustomLabel`. Every dropdown must go through `CustomDropdown`. No hardcoded `"Leave Type"` or `"Payment Mode"` strings — they must be wrapped:
```tsx
// Before (hardcoded):
<Label>Leave Type</Label>

// After (configurable):
<CustomLabel module="hr" field="leave_type" fallback="Leave Type" />
```

### 2.5 What Stays Non-Configurable

- **Multi-tenant isolation** — `mill_id`/`company_id` scoping is NEVER bypassable per mill
- **Role permission matrix** — `Super Admin` always has full access; backend `require_module()` is always enforced
- **Audit logging** — all mutations are always logged, regardless of mill config
- **Rate limiting** — consistent across all mills
- **Upload validation** — file type/size limits are global
- **QR signing** — security-critical path, uniform across all mills
- **DB schema** — column types, constraints, indexes are code-defined, not per-mill

### 2.6 What the "Common Case" Covers

A new mill with different needs requires only config changes for:
- Different shift names (e.g., 2-shift vs 3-shift operation)
- Different department names
- Different field labels (e.g., "Count" vs "Ne" vs "English Count")
- Different dropdown options (leave types, payment modes, quality grades)
- Different document numbering formats
- Different currency/date format (Bangladesh, Turkey, Vietnam expansion)
- Enabled/disabled modules and roles
- Selected KPI cards on dashboard

**Still requires custom code for:**
- New workflow paths (e.g., a new dispatch state machine)
- Custom business logic (e.g., mill-specific overtime calculation rules)
- New field types beyond text/number/date/dropdown/boolean
- Integration with external systems unique to one mill

---

## Phase 3 — Implementation Plan

### P0 — Must have (blocks any customer differentiation)

#### P0-1: Unify field label consumption
- **Files:**
  - `src/components/ui/DataTable.tsx` — replace `col.label` with `getColumnLabel(module, col.key)`
  - `backend/app/services/excel_export.py` — read `field_label_overrides` for export headers
  - `backend/app/services/pdf_export.py` — read overrides for PDF headings
  - `backend/app/core/import_mapper.py` — add label overrides to column matching
- **Risk:** Medium (touches 4+ files, needs fallback logic when label is missing)
- **Validation:** `curl -X PUT /mill-config/profile -d '{"field_labels": {"hr.leave_type": "Holiday Type"}}'` → Excel export should show "Holiday Type" not "leave_type"

#### P0-2: Build `mill_configuration_profiles` table + CRUD
- **Files:** New migration `047_mill_config_profiles.py`, `backend/app/models/mill_config.py` (new model), `backend/app/api/v1/mill_config.py` (new `GET/PUT /mill-config/profile`)
- **Risk:** Low (new table, no migration of existing data)
- **Validation:** `curl -X PUT /mill-config/profile -d '{"date_format": "DD/MM/YYYY"}'` → returns updated profile

#### P0-3: Add `CustomLabel` component and provider
- **Files:** `src/hooks/useMillConfig.ts` (already exists — extend), new `src/components/ui/CustomLabel.tsx`, modify `src/components/layout/SidebarContext.tsx` to include MillConfigProvider
- **Risk:** Low (wrapping component, no logic changes)
- **Validation:** Render a form with `<CustomLabel module="hr" field="leave_type" />` → shows label from config or fallback

### P1 — Important (needed for meaningful differentiation)

#### P1-1: Portable dropdown config with MILL_OWNER UI
- **Files:**
  - Migration to add `dropdown_options` to `mill_configuration_profiles`
  - `backend/app/api/v1/mill_config.py` — add dropdown options to profile
  - `src/routes/_app.company.settings.tsx` — add "Dropdown Options" section with add/remove UI for MILL_OWNER
  - Migrate existing hardcoded dropdowns: `leave_types` (hr.py), `payment_modes` (payroll.py), `quality_grades` (quality.py) to read from profile
- **Risk:** Medium (4 hardcoded dropdowns need to be replaced with dynamic reads)
- **Validation:** MILL_OWNER adds a new leave type → HR leave form shows it as selectable option

#### P1-2: Numbering format configuration
- **Files:**
  - Migration to add `numbering_format` columns to `mill_configuration_profiles`
  - `backend/app/services/billing_invoice_service.py` — replace hardcoded `INV-YYYYMM-NNNN` with format string from profile
  - `backend/app/services/dispatch_service.py` — same for dispatch numbers
  - `src/routes/_app.company.settings.tsx` — add "Numbering" section with format preview
- **Risk:** Low (format string substitution, existing sequence logic can stay)
- **Validation:** Set dispatch format to `DSP-{seq}` → new dispatch order gets `DSP-1` not `DSP-20260621-143022`

#### P1-3: Resolve dual custom-field system
- **Files:**
  - Migration: merge `EmployeeCustomField` → `MillCustomField` for existing data
  - `backend/app/services/deletion_service.py` — delete references to old system
  - `backend/app/api/v1/hr.py` — remove `EmployeeCustomField` endpoints
  - `backend/app/models/` — drop `EmployeeCustomField`/`EmployeeCustomValue` models (or deprecate)
- **Risk:** HIGH (data migration — existing custom field data in old system must be preserved)
- **Validation:** Employee custom fields created before migration still appear after migration, with correct mill scoping

#### P1-4: Extend custom fields to all 10 modules
- **Files:**
  - `backend/app/api/v1/production.py` — add custom fields to machine GET/POST
  - `backend/app/api/v1/dispatch.py` — add custom fields to dispatch order GET/POST
  - `backend/app/api/v1/stores.py` — add custom fields to spare item GET/POST
  - `backend/app/api/v1/quality.py` — add custom fields to tests
  - Frontend: add custom field rendering to each module's create/edit form
- **Risk:** Medium (repetitive work across many files, but pattern is well-established)
- **Validation:** Add a custom field to "dispatch" module → appears in dispatch order create/edit form

### P2 — Nice to have (polish after P0/P1)

#### P2-1: Dashboard KPI selection
- **Files:**
  - `backend/app/services/command_center_service.py` — accept KPI filter from profile
  - `src/components/dashboard/RoleDashboards.tsx` — read `dashboard_kpis` from profile
  - `src/routes/_app.company.settings.tsx` — KPI picker checklist
- **Risk:** Medium (dashboard layout is complex)
- **Validation:** Mill Owner deselects "attendance" KPI → dashboard hides attendance card

#### P2-2: Extensible role creation
- **Files:**
  - Migration: new `company_roles` table (custom roles per company)
  - `backend/app/core/rbac.py` — merge custom roles with hardcoded 14
  - `backend/app/api/v1/admin.py` — CRUD for custom roles
  - `src/routes/_app.admin.roles.tsx` — role management UI
- **Risk:** HIGH (ACCESS_MATRIX becomes dynamic instead of static dict — major refactor)
- **Validation:** Create a custom role "Lab Technician" with quality read access → assign to user → user sees quality module

#### P2-3: Workflow configuration engine
- **Files:** Entirely new subsystem — workflow definitions DB table, state machine config, transition guards
- **Risk:** XL (major architectural addition)
- **Validation:** A mill configures dispatch as "pending → dispatched → delivered" (skip loading+ready) → dispatch module obeys the simplified flow

---

## What This Unlocks — Business Terms

| Scenario | Before (current) | After (with config system) |
|----------|-----------------|---------------------------|
| Mill A operates 2 shifts (A/B); Mill B operates 3 (Morning/Evening/Night) | Both mills see A/B/C hardcoded; Mill B's third shift is labeled "C" | Each mill configures their own shift names |
| Mill A calls it "Count Ne"; Mill B calls it "English Count"; Mill C exports to Bangladesh and needs "BD Count" | All see "Count Ne" — confusing for Mill B and C | Each mill renames the field label independently |
| Mill A has "Casual Leave" and "Sick Leave"; Mill B adds "Privilege Leave" and "Maternity Leave" | Hardcoded leave types — Mill B's extra types don't exist | MILL_OWNER adds leave types per mill |
| Mill A invoices as `INV-0001`; Mill B needs `MFG/2026/06/001` | Hardcoded `INV-YYYYMM-NNNN` — neither mill satisfied | Each mill sets their own format |
| Mill A uses all 14 roles; Mill B is a small mill with no dedicated Quality Manager or Dispatch Manager | Mill B sees empty modules they don't use | Mill B disables unused roles from company settings |
| Mill A tracks employee "Aadhaar Number"; Mill B doesn't need it | No custom field — Mill A has no place to store it | Each mill adds their own custom fields per module |
| Mill A's dashboard should show production + quality; Mill B cares about dispatch + inventory | Both see identical role-fixed dashboard | Each mill selects their own KPI cards |

---

## Open Questions (Need Your Decision)

1. **Single config per mill or per company?** — Should `mill_configuration_profiles` be at the mill level (each mill can differ) or company level (all mills in a company share one config)? Per-mill is more flexible; per-company is simpler. I recommend **per-mill** since the whole goal is "Mill A ≠ Mill B."

2. **How to handle JSONB vs normalized tables?** — `field_labels` and `dropdown_options` could be JSONB blobs (simple, one query) or normalized tables (queryable, indexable). I recommend **JSONB for labels/dropdowns** (rarely queried independently) and **normalized tables for numbering_sequences** (need atomic increments).

3. **Should labels apply to ALL modules or opt-in?** — Should `field_label_overrides` affect every DataTable/form in every module, or should modules opt in? I recommend **global by default** (every label goes through `CustomLabel`), with `getColumnLabel()` as a no-op when no override exists.

4. **Dropdown options: override or extend?** — When a mill configures leave types, should they *replace* the system defaults (override) or *add to* them (extend)? I recommend **extend** for dropdowns — the system defaults act as a base, and mills add their own. Override mode can be a toggle.

5. **Workflow engine: build or wait?** — Workflow configuration (P2-3) is an XL effort. Should we invest now, or let the module-toggle system handle workflow variation (e.g., if a mill doesn't need LoTrac, they disable the `lotrac` module)? I recommend **deferring workflow configuration** — module toggles + custom per-mill process documentation cover 80% of use cases without building a workflow engine.

6. **How opinionated should the frontend config provider be?** — Should `MillConfigProvider` block rendering until config is loaded (skeleton state), or should it render with defaults immediately and update when config arrives? I recommend **render with defaults immediately** (no flash of missing UI) and update labels/options reactively when config loads.

7. **Extensible roles: priority?** — Custom role creation (P2-2) requires making the ACCESS_MATRIX dynamic. Is this a Phase 4 goal or backlog item? I recommend **Phase 5** — the current 14-role system with disable/override covers most practical needs.

---

## Summary: Single Biggest Architectural Decision

**The single biggest decision you need to make is: per-mill or per-company configuration profiles.**

- **Per-mill** (recommended): Each mill has its own `mill_configuration_profiles` record. Mill A can have "A/B/C" shifts while Mill B has "Morning/Evening/Night". This requires a migration to create profile records for existing mills (with defaults), and the frontend `useMillConfig` hook must resolve the current active mill.
- **Per-company**: All mills under the same company share one configuration. Simpler to implement (one record per company, not per mill), but cannot differentiate Mill A from Mill B.

If you choose per-mill, the frontend config provider needs the `activeMill` from Zustand to fetch the correct profile. If per-company, it needs `companyId`. **This choice affects every downstream decision** — schema design, API contract, frontend context, and migration strategy.

My recommendation: **per-mill**. The entire product vision is "genuinely different needs per mill." Per-company would only move the problem up one level.
