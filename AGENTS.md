# SpinFlow ERP

## Goal
- Build and fix SpinFlow ERP, a spinning mill ERP with role-based access and multi-tenant data isolation.

## Constraints & Preferences
- Consistent dark navy sidebar (#0f1923 bg, #1e2d3d active) with bright text (#94a3b8)
- Clean white topbar with teal avatar (#0d9488) and role badge
- Per-query error logging with fallbacks in admin summary
- All frontend + backend tests must pass
- Auth token persisted via zustand persist (`spinflow-auth`)
- Keep-alive pings every 90s + visibility change listener
- Seed credentials must match login page defaults: `admin@mill.spinflow` / `Admin@1234`

## Progress
### Done
- Admin summary: per-query try/except with `print(f"DEBUG ...")` and fallback queries without `deleted_at`
- Admin summary: `refetchOnMount: true`, `gcTime: 0` added to SuperAdminDashboard query
- Dashboard: `is_active = true` filter for companies, mills, users counts in `get_admin_summary`
- Dashboard: stale leftover code from old `get_admin_summary` removed (indentation fix)
- Keep-alive: interval 90s + `visibilitychange` listener to ping on tab return
- Sidebar: dark navy theme (#0f1923 bg, #1e2d3d active, rounded-lg active items, no left border)
- Sidebar text brightness: inactive `#94a3b8`, group labels `#64748b`, hover `#1a2d42`, icons `#94a3b8`
- Topbar: white bg, border-gray-100, teal avatar, role badge, theme toggle in avatar dropdown
- Login: frontend 15s timeout via `api.post(..., { timeout: 15000 })`, backend try/except wrapper
- Login: seed script fixed to create `admin@mill.spinflow` / `Admin@1234` (was `demo@araffath.in` / `Demo@1234`)
- Login: error message extraction from `e.response?.data?.detail` (was raw Axios "401" text)
- Login: token field names fixed (`r.token`→`r.access_token`, `r.refreshToken`→`r.refresh_token`) + `mapUser()` to convert snake_case user fields to camelCase (`AuthUser` interface)
- Profile page: route tree regenerated via `TanStackRouterVite()` plugin in vite config
- Masters SA scope: verified companies endpoint returns all companies when `company_id` is None
- Purchase route: already registered in route tree
- Auth store: already uses zustand `persist` with key `spinflow-auth`
- Material tests: 4 tests for sidebar/topbar color tokens; 73 frontend + 177 backend tests pass
- Mills scoping: all masters list endpoints use `_resolve_role_code()` + `_resolve_company_id()` helpers (explicit Role DB query + company_id fallback from Mill table)
- Module access: `require_module` in `deps.py` rewritten with explicit role-module mapping + CompanyModule plan check + SYSTEM_MODULES bypass
- RBAC frontend: `useRBAC.ts` updated — removed `analytics` from PRODUCTION_MANAGER; `canAccess` returns `false` when companyModules is null (no fallthrough); added `!== undefined` guard
- Admin Panel: Plan column with color-coded badges (starter/grey, growth/blue, business/indigo, enterprise/purple, unlimited/amber)
- Admin Panel: EditCompanyDialog includes plan dropdown (5 tiers) and max_employees input
- Admin Panel: ModulesDialog separates Core Modules (grid, included) vs Add-On Modules (dashed border, blue bg, pricing badges)
- Admin Panel: AddCompanyDialog Step 3 uses radio-button card plan selector with auto-fill max_users/max_employees
- Pricing SQL: `backend/sql/001_pricing_plan_fields.sql` — adds plan, max_employees, licence_fee, maintenance_fee, billing_cycle, plan_started_at, plan_expires_at, addons columns

### In Progress
- *(none)*

### Blocked
- *(none)*

## Key Decisions
- Query errors must print `DEBUG` prefix for server log visibility, not `admin-summary` generic prefix
- Fallback queries omit `deleted_at` for tables where column may not exist
- Login timeout: 15s on frontend (vs 60s default axios) to fail fast on cold start
- Material ui tests: only test sidebar/topbar custom color attributes, not shadcn colors
- AuthUser uses camelCase in frontend; API returns snake_case; `mapUser()` converts on login
- System modules (dashboard, masters, users, column_config, admin, audit) bypass company_modules check
- Sidebar colors hardcoded inline (not via CSS variables) to prevent dark mode interference
- Masters list endpoints use `_resolve_role_code()` + `_resolve_company_id()` helpers for explicit role DB query + fallback from mill

## Next Steps
- Run SQL migration `backend/sql/001_pricing_plan_fields.sql` in Supabase
- Verify dashboard counts match Admin Panel (is_active filter)
- Verify test mill owner company_id is set correctly in DB
- Verify dark mode card colors use slate-800, not sidebar dark navy

## Critical Context
- Demo credentials (login page defaults): `admin@mill.spinflow` / `Admin@1234`
- Theme key: `spinflow_theme`, Sidebar collapse key: `spinflow_sidebar_collapsed`
- Sidebar color CSS custom props defined in `styles.css` (`--sidebar-*`)
- `vite build` runs `TanStackRouterVite()` plugin to regenerate `routeTree.gen.ts`
- Topbar `_app.tsx` layout renders `<Topbar />`; pages that need action buttons pass them via `children`
- Keep-alive pings `https://spinflow.onrender.com/api/health`
- Backend `User.role` is a `@property` returning `role_rel.code` (not a DB column)
- Backend `LoginResponse` returns snake_case: `access_token`, `refresh_token`, `user.{mill_id, company_id, must_change_password}`
- Dark mode CSS: `.dark { --card: #1e293b; --bg-secondary: #1e293b; --bg-primary: #0f172a }`
- Dashboard `get_admin_summary` had stale leftover code causing `IndentationError` on deploy — fixed
- Masters list endpoints use helper functions `_resolve_role_code()` and `_resolve_company_id()` for explicit DB queries

## Relevant Files
- `src/styles.css`: CSS variables for sidebar colors, brand, content backgrounds, dark mode tokens
- `src/components/layout/Sidebar.tsx`: Dark navy sidebar with hardcoded `#0f1923` bg, loading skeletons, nav groups filtered by `canAccess()`
- `src/components/layout/Topbar.tsx`: White topbar with hamburger, bell, role badge, teal avatar dropdown
- `src/routes/_app.tsx`: Layout rendering Sidebar, Topbar, AlertBanner, Outlet; content has `dark:bg-slate-900`
- `src/routes/_app.profile.tsx`: Profile page with user info, theme toggle, change password, logout
- `src/routes/_app.purchase.tsx`: Cotton Purchase module page (1572 lines)
- `src/routes/_app.admin.tsx`: Admin Panel with Companies/Mills tabs, EditCompanyDialog (plan + max_employees), ModulesDialog (core/add-on split), AddCompanyDialog (plan radio cards)
- `src/routes/login.tsx`: Login page with 15s timeout, `mapUser()` snake→camel conversion, `getApiError()` extraction
- `src/lib/keepAlive.ts`: Keep-alive ping to Render with 90s interval + visibility change
- `src/lib/api.ts`: Axios instance, auth header from `useAuth.getState().token`, 401 auto-refresh interceptor
- `src/stores/auth.ts`: Zustand store with `persist` key `spinflow-auth`; `login()` calls `setAuthHeader()`
- `src/hooks/useRBAC.ts`: Role-module mapping, `companyModules` query, `canAccess()` with system module bypass, strict null/undefined check
- `src/components/ui/StatCard.tsx`: Dashboard stat cards using `dark:bg-slate-800`
- `src/components/dashboard/SuperAdminDashboard.tsx`: SA dashboard with `gcTime: 0` admin-summary query
- `src/__tests__/sidebar.test.tsx`, `topbar.test.tsx`: Color token assertions
- `backend/app/core/deps.py`: `get_current_user` (selectinloads `role_rel`), `require_module` (role mapping + CompanyModule check), `get_mill_scope`
- `backend/app/api/v1/dashboard.py`: `get_admin_summary` with per-query `SELECT COUNT(*)` (no deleted_at), `admin-summary-result` print
- `backend/app/api/v1/auth.py`: Login endpoint with try/except wrapper, `LoginResponse` with snake_case fields
- `backend/app/api/v1/masters.py`: All list endpoints use `_resolve_role_code()` + `_resolve_company_id()` helpers
- `backend/app/api/v1/users.py`: Uses `require_module("users")`
- `backend/app/api/v1/quality.py`: Paginated tests endpoint with SQL index comments
- `backend/app/schemas/auth.py`: `LoginResponse(access_token, refresh_token, user: UserResponse)` — snake_case
- `backend/scripts/seed_demo.py`: Seeds `admin@mill.spinflow` / `Admin@1234`
- `backend/sql/001_pricing_plan_fields.sql`: Migration for plan, max_employees, pricing columns
- `routeTree.gen.ts`: Auto-generated by TanStackRouterVite plugin on build
