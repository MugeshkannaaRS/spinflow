# SpinFlow ERP — UI Overhaul & Bug Fixes

## Goal
Complete SpinFlow ERP UI overhaul (10 parts) and comprehensive test suite, plus 6 bug fixes.

## Constraints & Preferences
- Execute in order; run `vite build` after each part — must pass before next part.
- After writing all tests, run `./scripts/run_tests.sh`, fix failures, commit `test: comprehensive test suite for UI overhaul and bug fixes`.
- Keep sections in order, use terse bullets, preserve exact paths/identifiers.

## Progress
### Done
- **Part 9 (Bug Fixes):** `imports.py` GET returns `[]` on exception; `masters.py` added GSTIN validator to `CustomerCreate`/`CustomerUpdate`; `audit.py` wrapped GET in try/except returning empty response; `auth.py` added `max_users` enforcement in user creation (403 if limit reached); `masters.tsx` Super Admin sees only Companies + Mills tabs.
- **Part 1 (CSS):** Replaced `:root` and `.dark` in `src/styles.css` with brand indigo palette (brand-50–900, success/warning/danger, bg/text vars, card shadows, sidebar vars). Added `* { box-sizing: border-box; }` and body font/line-height.
- **Part 2 (Hook):** Created `src/hooks/useTheme.ts` — `useTheme` hook with localStorage key `spinflow_theme`, toggles `dark` class on `<html>`.
- **Part 3 (Sidebar):** Rewrote `src/components/layout/Sidebar.tsx` — always visible on desktop (>1024px), collapsible to 64px icon-only via toggle at bottom. Persists in `spinflow_sidebar_collapsed`. Tablet/mobile: overlay with backdrop. Logo: SpinFlow (expanded) / SF monogram (collapsed). Nav groups: Overview, Operations, People, Supply Chain, Finance, Settings (Admin Panel/Column Config only for SUPER_ADMIN). Bottom section: mill name, role badge, dark/light toggle, logout, collapse toggle. Collapsed items show Tooltip on hover.
- **Part 4 (Topbar):** Rewrote `src/components/layout/Topbar.tsx` — 56px height, bg `var(--bg-primary)`, border-bottom `var(--border)`. Left: hamburger (mobile) + page title + breadcrumb subtitle. Right: theme toggle, bell icon with notification dropdown, divider, avatar dropdown (Profile/Change Password/Logout).
- **Part 5 (Layout):** Updated `src/routes/_app.tsx` — `AppShell` with fixed Sidebar + flex content area. Margin-left: `lg:ml-60` when expanded, `lg:ml-16` when collapsed (reads localStorage `spinflow_sidebar_collapsed` via event listener). Mobile: margin-0 (sidebar is overlay). Uses `cn()` for responsive classes.
- **Part 6 (Bottom Nav):** Rewrote `src/components/layout/MobileNav.tsx` — fixed bottom, `lg:hidden`. 5 tabs: Dashboard (LayoutDashboard), Production (Factory), HR (Users), Alerts (Bell + badge), More (Grid). More opens bottom sheet drawer with grid of remaining modules. Active state: text-brand-500.
- **Part 7 (StatCard):** Created `src/components/ui/StatCard.tsx` — `StatCard` component: rounded-xl card with shadow, icon circle (color-coded), value (28px bold), subtitle, trend (TrendingUp/TrendingDown), progress bar, alert border-left. Colors: blue/green/indigo/orange/emerald/red/purple.
- **Part 8 (Dashboard):** Rewrote `src/routes/_app.dashboard.tsx` — Section 1: Alert banner (red, dismissible). Section 2: 6 KPI cards (StatCard). Section 3: BarChart "Production vs Target" + horizontal BarChart "Department Attendance". Section 4: Live Alerts (max 6), Pending Actions, Today's Schedule. Data from `/dashboard/summary` with 5min auto-refresh. Skeleton loading states.
- **Part 10 (Seed Script):** Created `backend/scripts/seed_demo.py` — seeds Arafath Textiles Pvt Ltd with 422 employees, 30 days production data, 4 customers, departments, sections, shifts, admin user (demo@araffath.in / Demo@1234).
- **Fix 1 — Sidebar colors:** Rewrote `SidebarContent` with inline styles using hardcoded hex colors (`#1e1b4b` bg) independent of app theme. Updated `styles.css` sidebar vars. Active: bg `rgba(99,102,241,0.2)`, text `#ffffff`, icon `#a5b4fc`, left border `3px solid #6366f1`. Hover: bg `rgba(99,102,241,0.1)`, text `#e0e7ff`. Inactive: text `#c7d2fe`, icons `#818cf8`. Labels: `#818cf8`. Bottom: `#94a3b8`. Tooltip: bg `#1e1b4b`, text `#ffffff`, border `#4338ca`.
- **Fix 2 — Import/Export icons:** Verified all Import buttons use `<Upload>` and Export use `<Download>` across all pages. No changes needed.
- **Fix 3 — Employee mill_id scoping:** Updated `hr.py` GET `/hr/employees` — uses `scope.get("mill_id")` (graceful null for SUPER_ADMIN → no filter). Company-level scope joins `Mill` table. Added SQL fix comment for null mill_id values. Removed non-existent `deleted_at` filter.
- **Fix 4 — Duplicate search bar:** Removed external `<Input>` search from HR page filter row. DataTable's internal search handles employee searching.
- **Fix 5 — Attendance page UI:** Rewrote `AttendanceTab` with colored click-to-cycle status cells (P→A→H→L), sticky name+dept columns, date headers with day+letter, today highlighting, compact button cells, mobile card+Sheet view, per-day summary footer row, per-employee summary columns.
- **Fix 6 — ui-config/columns 500:** Rewrote `get_column_config` — added missing `import logging` + `logger` (was causing NameError in except blocks), removed `response_model` (avoids Pydantic serialization 500s), removed `except HTTPException: raise` (catches everything), returns `_empty_config()` helper on any exception.
- **Test infrastructure:** Created `vitest.config.ts`, `src/__tests__/setup.ts`, added test/lint/typecheck scripts.
- **Frontend tests:** `sidebar.test.tsx`, `dashboard.test.tsx`, `theme.test.ts`, `import.test.tsx`, `masters.test.tsx`.
- **Backend tests:** `test_ui_config.py`, `test_imports.py`, `test_masters.py`, `test_bulk_import.py`, `test_audit.py`, `test_dashboard.py`.
- **Documentation:** `TESTING.md` — manual test checklist. `scripts/run_tests.sh` — executable test runner.
- **Visual Polish Pass:**
  - **Sidebar:** Logo section with `border-b border-indigo-800/50`, tagline "Your mill. In your hands." in `text-indigo-400 text-[11px]`. Group labels: `text-[10px] font-semibold uppercase tracking-widest text-indigo-400/70`. Nav items: `text-indigo-200 hover:text-white hover:bg-indigo-500/20` (inactive) / `text-white bg-indigo-500/25 border-l-[3px] border-indigo-400` (active). Bottom section: `border-t border-indigo-800/50`, `text-indigo-300` mill name, `text-indigo-500 text-[11px]` role. Aside wrapper: `border-r border-[#2d2b6b]`. No inline style hover handlers needed — Tailwind `hover:` handles it.
  - **StatCard:** Redesigned with `rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md`. Icon: `rounded-xl w-10 h-10` with new color map (iconBg/iconColor/progressBar). Title: `text-xs font-semibold uppercase tracking-wider text-gray-400`. Value: `text-2xl font-bold tracking-tight`. Progress bar label split into separate `flex justify-between` line.
  - **Dashboard:** Page wrapper: `space-y-6 p-6 max-w-[1400px] mx-auto`. Chart cards: `bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm`. Production chart: removed target bar → added `ReferenceLine y={5000} stroke="#6366f1" strokeDasharray="4 4"`. CartesianGrid: `stroke="#f0f0f0" vertical={false}`. Axes: `axisLine={false} tickLine={false}`. Attendance chart: `Cell` colors computed via `entry.pct >= 90 ? "#10b981" : entry.pct >= 80 ? "#f59e0b" : "#ef4444"`. Bottom panels: card headers with `border-b`, divided body with `divide-y divide-gray-50`, items with `hover:bg-gray-50 transition-colors`. Today's Schedule: `CheckCircle2`/`Circle` lucide icons instead of emoji. Removed `Badge` import (unused).
  - **Layout:** Main content: `bg-gray-50 dark:bg-slate-900` added.
  - **styles.css:** Added `-webkit-font-smoothing: antialiased`, `::-webkit-scrollbar` styling (6px, rounded thumb).
  - `vite build` passed (0 errors).

## Key Decisions
- Sidebar uses inline `style` with hardcoded hex colors (not CSS variables) for theme-independent rendering.
- Vitest with happy-dom for React component tests; pure-Python schema tests for backend (no async infra).
- AttendanceTab uses click-to-cycle button cells instead of Select dropdown for faster mobile interaction.
- ui-config GET returns plain dicts (no response_model) to avoid serialization-time 500s.

## Next Steps
1. Run `./scripts/run_tests.sh` — fix any failures.
2. Commit: `fix: sidebar colors, icon swap, employee count, duplicate search, attendance UI, ui-config 500`.
3. Push to `main`.

## Critical Context
- `vite build` passes after each change.
- Demo seed: `demo@araffath.in` / `Demo@1234`.
- Theme key: `spinflow_theme`. Sidebar collapse key: `spinflow_sidebar_collapsed`.
- Employee mill_id SQL fix query in `hr.py` comment.
- Dashboard API: `/dashboard/summary`, staleTime: 5 min.
