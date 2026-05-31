# SpinFlow ERP — Manual Test Checklist
Run these before every deployment. Check each box.

## AUTH
- [ ] Login with admin@mill.spinflow / Admin@1234 -> lands on Dashboard
- [ ] Wrong password -> shows error, does not crash
- [ ] Token expires -> redirected to login, not blank screen
- [ ] Must-change-password flow -> forced to change before seeing app

## SIDEBAR
- [ ] Desktop: sidebar visible expanded by default
- [ ] Desktop: click collapse toggle -> shrinks to icons only
- [ ] Desktop: hover icon in collapsed mode -> tooltip shows label
- [ ] Desktop: collapsed state survives page refresh
- [ ] Tablet (resize to 900px): sidebar hidden, hamburger visible
- [ ] Tablet: click hamburger -> sidebar slides in with backdrop
- [ ] Tablet: click backdrop -> sidebar closes
- [ ] Mobile (resize to 375px): sidebar hidden
- [ ] Mobile: hamburger opens full-width overlay sidebar
- [ ] SUPER_ADMIN: Admin Panel + Column Config visible in sidebar
- [ ] MILL_OWNER: Admin Panel + Column Config NOT visible
- [ ] Active route highlighted correctly

## DARK MODE
- [ ] Click moon icon in topbar -> switches to dark mode
- [ ] Dark mode: all backgrounds dark, text readable, no white flashes
- [ ] Refresh page -> dark mode persists
- [ ] Click sun icon -> back to light mode
- [ ] Sidebar toggle and topbar toggle stay in sync

## MOBILE BOTTOM NAV
- [ ] Resize to 375px -> bottom nav appears
- [ ] Dashboard tab -> navigates to dashboard
- [ ] Production tab -> navigates to production
- [ ] HR tab -> navigates to HR
- [ ] Alerts tab -> shows badge with count
- [ ] More tab -> opens sheet with remaining items
- [ ] Bottom nav hidden on desktop

## DASHBOARD
- [ ] Opens without crash or 500 error
- [ ] 6 KPI cards render with values
- [ ] Skeleton loaders show during data fetch (test on slow network)
- [ ] Alert banner shows if critical alerts exist
- [ ] Production chart renders (7 days bars)
- [ ] Attendance chart renders (by department)
- [ ] Live Alerts panel renders
- [ ] Pending Actions panel renders
- [ ] Today's Schedule panel renders
- [ ] All data is mill-scoped (not from other mills)
- [ ] Page auto-refreshes every 5 minutes (check network tab)

## MASTERS
- [ ] Navigate to Masters -> no 500 errors in console
- [ ] All tabs load without error
- [ ] SUPER_ADMIN: only Companies + Mills tabs visible
- [ ] MILL_OWNER: all tabs visible
- [ ] Add Company with empty GSTIN -> saves successfully
- [ ] Add Company with valid GSTIN -> saves successfully
- [ ] Add Company with invalid GSTIN "ABC" -> shows error message
- [ ] Button text says "Add Company" not "Add Companie"
- [ ] Add Department -> saves with mill's own department
- [ ] Add Machine -> saves successfully
- [ ] All numeric fields accept empty -> no validation crash

## HR IMPORT
- [ ] Click Import Excel -> modal opens
- [ ] Upload .xlsx file -> headers detected, mapping shown
- [ ] Upload .txt file -> rejected with error
- [ ] Column mapping step loads without 500 error
- [ ] Import 422 employees -> progress bar moves
- [ ] Result shows correct imported count (not 0)
- [ ] Department warnings show in yellow (not red)
- [ ] Hard errors show in red
- [ ] Re-import same file -> upserts, no duplicate error
- [ ] Imported employees appear in employee list

## USER MANAGEMENT
- [ ] Create user under limit -> success
- [ ] Create user at limit -> shows "upgrade plan" warning (403)
- [ ] User list loads without 500

## AUDIT LOGS
- [ ] Navigate to Audit Logs -> loads without 500
- [ ] Shows log entries with readable timestamps
- [ ] Empty state handled gracefully

## RESPONSIVENESS (resize browser while on each page)
- [ ] Dashboard -> readable at 375px, 768px, 1024px, 1440px
- [ ] HR page -> table scrolls horizontally on mobile
- [ ] Import modal -> usable on mobile
- [ ] Forms -> inputs full width on mobile
- [ ] Charts -> resize and reflow correctly

## PERFORMANCE
- [ ] Dashboard loads in < 3 seconds on first visit
- [ ] Page navigation feels instant (< 500ms)
- [ ] No memory leaks (navigate between pages 10 times, no slowdown)
- [ ] Network tab: no duplicate API calls on page load

## CONSOLE ERRORS
- [ ] Open console -> zero red errors on Dashboard
- [ ] Zero red errors on HR page
- [ ] Zero red errors on Masters page
- [ ] Zero red errors on Production page
- [ ] Only acceptable: WebSocket warnings (Render free tier limitation)
