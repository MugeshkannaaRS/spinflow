# User Module Access Override System — Report
*Updated through Step 5 (access_level 3-state upgrade, tests confirmed)*

## Architecture

Resolution order (highest priority first):

1. **CompanyModule.is_enabled** (hard gate — company must have module enabled)
2. **SUPER_ADMIN bypass** (SUPER_ADMIN always has all modules)
3. **UserModuleAccess** row (if row exists for user+module, `access_level` is FINAL — no fall-through)
4. **RoleModuleAccess** (company+role override table)
5. **ACCESS_MATRIX** role default in `access.ts` / `rbac.py`

Key rule: Removing a UserModuleAccess row (DELETE) means "inherit from role default." This ensures that later role-default changes propagate to users who never customized that module.

## 3-State access_level (vs old boolean)

The old system used `enabled=True/False` with a write-level cap: even if enabled=true, write was only possible if the role would normally have write. **This is removed.**

| access_level | Meaning | Behavior |
|---|---|---|
| `"write"` | Full access — read + write | Grants write even if role has zero default access to that module |
| `"read"` | Read-only access | Write is denied even if the role would normally grant write |
| `"none"` | Explicit denial | Overrides role grant — read+write both denied |

## Database

- **Migration 048**: Creates `user_module_access` table (original)
- **Migration 049**: `enabled` (bool) → `access_level` (varchar with CHECK constraint); backfills enabled=True→'read', enabled=False→'none'
- **Model**: `UserModuleAccess` in `backend/app/models/user.py`
  - `access_level` replaces `enabled`
  - FK→users (cascade delete)
  - `set_by` FK→users (SET NULL on delete)
  - `UniqueConstraint(user_id, module)`

## Backend

- `backend/app/core/access.py`: `resolve_access()` Layer 3 returns access_level as FINAL:
  - `'write'` → read+write full grant (even if role has zero)
  - `'read'` → read-only (capped even if role would give write)
  - `'none'` → explicit deny (overrides role grant)
  - No row → fall through to Layer 4/5
- `backend/app/api/v1/auth.py`: Login and `/auth/me` both query `UserModuleAccess` and merge `access_level` strings into `module_restrictions` dict (not booleans)
- `backend/app/api/v1/admin.py`:
  - `GET /admin/users/{user_id}/module-access` — returns `[{module, access_level}]`
  - `PUT /admin/users/{user_id}/module-access` — accepts `[{module, access_level}]`, produces INSERT/UPDATE/DELETE diff

## Frontend

- `src/lib/modules.ts`: Shared canonical `MODULE_GROUPS`, `ALL_MODULES`, `MODULE_LABELS`
- `src/lib/api-service.ts`: `getUserModuleAccess()` + `updateUserModuleAccess()` with `access_level` strings
- `src/lib/access.ts`: `finalAccess()` Layer 3:
  - `'none'` → deny outright
  - `'read'` → blocks write actions
  - `'write'` → grants both
  - Key absent → fall through to Layer 2 role default
- `src/stores/auth.ts`, `src/hooks/useRBAC.ts`, `src/routes/login.tsx`: `moduleRestrictions` type changed to `Record<string, string>`
- `src/routes/_app.admin.users.tsx`: `ModuleAccessDialog` component
  - Opens per-user via "Modules" button in table actions
  - Shows all 22 modules grouped by Core/Add-ons/System
  - Each module has a 3-button segmented control: None/Read/Write
  - Clicking already-selected state removes override (inherit)
  - "custom" badge on overridden modules
  - Role default shown per module via `roleDefaultLevel()` helper
  - Save produces INSERT/UPDATE/DELETE diff with access_level strings

## Grant Propagation Tests (Proven)

### Test 1: `test_uma_write_grants_full_access_beyond_role_default`

**Setup**: MACHINE_OPERATOR user (role has ZERO default access to "purchase") with company module enabled. Created `UserModuleAccess(access_level="write")`.

**Result (backend `resolve_access`)**:
```
read access  → granted=True, level="write"
write access → granted=True, level="write"
```

This proves the NEW behavior: `access_level='write'` gives FULL write even for roles with zero default access to that module.

### Test 2: `test_uma_read_caps_write_from_role`

**Setup**: PRODUCTION_MANAGER (role normally has production=write). Created `UserModuleAccess(access_level="read")`.

**Result**:
```
read access  → granted=True, level="read"
write access → granted=False
```

This proves `'read'` access_level caps write even when the role would normally allow it.

### Test 3: `test_uma_none_overrides_role_grant`

**Setup**: PRODUCTION_MANAGER (role normally has production=write). Created `UserModuleAccess(access_level="none")`.

**Result**:
```
read access  → granted=False
write access → granted=False
```

This proves `'none'` access_level explicitly denies even permissive roles.

### Fix Applied: `finalAccess()` in `src/lib/access.ts`

Previously, Layer 2 (role capability) was checked BEFORE Layer 3 (user module restrictions), so a module the role didn't have was denied before reaching the override check. **Fixed**: Layer 3 is now checked FIRST:
- `moduleRestrictions[key] === "none"` → deny immediately
- `moduleRestrictions[key] === "read"` → read-only regardless of role
- `moduleRestrictions[key] === "write"` → full grant, skip role check
- key absent → fall through to Layer 2 role default

## Frontend Bypasses — Categorized & Fixed

### Category A (migrated to `canAccess()`)

| File | Line | What changed |
|---|---|---|
| `src/routes/_app.purchase.tsx` | 82 | `isAdmin` replaced with `canEdit` (maps to `canAccess("purchase", true)`). ColumnConfigurator now respects per-user overrides. |
| `src/routes/_app.quality.tsx` | 73 | Dead `isAdmin` variable removed (was defined but never used). |
| `src/routes/_app.hr.tsx` | 2955 | `canFinalize` now uses `canAccess("payroll", true)` passed as a prop from parent. Payroll finalization respects per-user overrides. |
| `src/routes/_app.alerts.tsx` | 931 | `canManage` now uses `canAccess("alerts", true)`. Alert rule management respects per-user overrides. |

### Category B (intentional ownership/tier gate — commented)

| File | Line | Why intentional |
|---|---|---|
| `src/components/billing/BillingPortal.tsx` | 1506 | SUPER_ADMIN sees platform billing, MILL_OWNER sees company billing. This is a view-selection decision, not a module gate. Route-level guard already handles authorization. |
| `src/components/SetupGuide.tsx` | 102 | Setup guide is company onboarding UX — only the actual owner should see it regardless of module overrides. |
| `src/routes/_app.masters.tsx` | 351,353 | MILL_OWNER excluded from mill editing — mill CRUD is a platform-level operation done via the admin panel. `canEdit` already respects RBAC for non-owner roles. |
| `src/components/layout/Sidebar.tsx` | 267-268 | Billing nav and owner dashboard are company-level features, not module-access decisions. Only MILL_OWNER has a billing relationship or owner dashboard. |

## Final Verdict (Updated for 3-State)

**Is it now safe to tell a customer "yes, you can grant a user MORE modules than their role default, not just fewer"?**

**YES** — with full write support:

- **Backend**: Fully safe. `resolve_access()` handles 3-state access_level via Layer 3 (FINAL — no fall-through). `'write'` gives full read+write even if the role has zero default access. `'none'` explicitly denies even permissive roles.
- **Frontend**: Safe after the `finalAccess()` fix (Layer 3 checked before Layer 2). The four Category A bypasses have been migrated to `canAccess()`. The four Category B bypasses are deliberate ownership gates unrelated to module access.
- **Integration tests**: 6 UMA tests pass, including 3 new regression tests proving:
  - `'write'` on zero-default module → full write granted
  - `'read'` on high-default module → write capped at read
  - `'none'` on permissive role → explicitly denied
- **No write cap**: Unlike the old boolean system, `access_level='write'` now gives unconditional write. If a customer needs write for a module the role doesn't have, the per-user override with `'write'` is sufficient.
- **Verification**: `npx tsc --noEmit` passes (0 errors). 18/18 access matrix tests pass. Full suite: 324 passed, 30 skipped, 17 pre-existing failures (unrelated).
