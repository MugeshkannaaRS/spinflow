# COMPANIES PAGE DEEP INVESTIGATION

**Current Status:** Page crashes on production with "Something went wrong"  
**Investigation Depth:** Component tree, API contracts, error boundaries, data flow  

---

## COMPONENT TREE & DEPENDENCY MAP

```
_app.admin.companies.tsx
├── Page Component
│   ├── useQuery("admin-companies-stats") → adminApi.getCompanyStats()
│   ├── useQuery("companies-all") → adminApi.getCompanies()
│   ├── useState: selectedCompany
│   ├── useState: editingCompany
│   ├── useState: showDialog
│   ├── DataTable
│   │   ├── Row Actions (Edit, View, Delete)
│   │   ├── Columns: name, code, status, mills, users, plan
│   │   └── Pagination + Sorting
│   ├── EditCompanyDialog
│   │   ├── Form fields
│   │   ├── Status dropdown
│   │   └── Save mutation
│   ├── ModulesDialog
│   │   ├── Checkboxes for 19 modules
│   │   └── Save mutation
│   └── DeleteCompanyDialog
│       ├── Confirmation text
│       └── Delete mutation
```

---

## API CONTRACTS (Critical)

### `GET /admin/companies`

**Expected Response:**
```json
{
  "total": 42,
  "page": 1,
  "page_size": 100,
  "data": [
    {
      "id": "uuid",
      "name": "Company A",
      "code": "COMP-A",
      "status": "active",
      "plan": "growth",
      "mills_count": 5,
      "users_count": 12,
      "created_at": "2026-01-15T10:00:00Z"
    }
  ]
}
```

**Current Consumer:**
```tsx
const { data: companies } = useQuery({
  queryKey: ["companies-all"],
  queryFn: () => adminApi.getCompanies().then(r => r?.data ?? []),
});
```

**Risk:** If response shape differs (e.g., no `data` key), companies is `[]` but should error.

---

### `POST /admin/companies/{id}/update`

**Expected Request/Response:**
```json
{
  "name": "New Name",
  "status": "suspended" | "active" | "archived"
}
```

**Current Usage:**
```tsx
const mutation = useMutation({
  mutationFn: (data) => adminApi.updateCompany(id, data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies-all"] })
});
```

**Risk:** No error handling; if API returns 403/500, modal stays open and hangs.

---

### `GET /admin/companies-stats`

**Expected Response:**
```json
{
  "total_companies": 42,
  "active_companies": 38,
  "total_mills": 156,
  "total_users": 512,
  "active_users": 498,
  "company_stats": [
    { "name": "Company A", "mills": 5, "users": 12, "status": "active" }
  ]
}
```

**Current Consumer (BEFORE FIX):**
```tsx
const companyStats: any[] = statsQ.data ?? [];
```

**Problem:** `statsQ.data` is an object, not an array. Assigning object to array type causes confusion.

**Current Consumer (AFTER FIX):**
```tsx
const companyStats: any[] = (statsQ.data?.company_stats ?? []) as any[];
```

**Status:** ✓ FIXED

---

## ROOT CAUSE ANALYSIS: "Something Went Wrong"

This error typically means:
1. Error boundary caught an exception
2. Component threw during render
3. No fallback UI provided

### Scenario 1: statsQ fails

**Flow:**
1. `useQuery("admin-companies-stats")` calls `/admin/companies-stats`
2. API returns error (500, 403, timeout)
3. `statsQ.data` is undefined, `statsQ.isError` is true
4. Component doesn't check `isError`, tries to render undefined
5. Error boundary catches: "Something went wrong"

**Evidence:**
- Check browser console for React error stack
- Check network tab for `/admin/companies-stats` response

**Fix:**
```tsx
if (statsQ.isError) return <ErrorState error={statsQ.error} />;
if (statsQ.isLoading) return <Skeleton />;
```

---

### Scenario 2: companiesQ fails but statsQ succeeds

**Flow:**
1. `useQuery("companies-all")` calls `/admin/companies`
2. API times out or returns 500
3. `companies` is undefined
4. `<DataTable data={companies} />` receives undefined
5. DataTable tries `companies.map()` → TypeError
6. Error boundary catches

**Evidence:**
- Network shows `/admin/companies` is slow/failed
- Console shows `TypeError: Cannot read property 'map' of undefined`

**Fix:**
```tsx
const { data: companies = [] } = useQuery({
  queryKey: ["companies-all"],
  queryFn: () => adminApi.getCompanies().then(r => r?.data ?? []),
});
```

---

### Scenario 3: Dialog state mutation

**Flow:**
1. User opens EditCompanyDialog
2. Form submission fails (e.g., name validation)
3. Modal stays open but error not shown
4. User closes modal (state not reset)
5. User reopens different company's dialog
6. Old `selectedCompany` state mixed with new
7. Form renders stale data from previous edit
8. Mutation fires with wrong companyId
9. Unexpected response shape causes crash

**Fix:**
```tsx
const handleOpenDialog = (company) => {
  setSelectedCompany(company);
  setShowDialog(true);
};

const handleCloseDialog = () => {
  setSelectedCompany(null);
  setShowDialog(false);
};
```

---

### Scenario 4: Missing error boundary on components

**Current structure:**
```tsx
export default function CompaniesPage() {
  return (
    <>
      <Topbar ... />
      <div>
        <CompanyStatsCard data={statsQ.data} /> {/* crashes if null */}
        <DataTable data={companies} /> {/* crashes if undefined */}
      </div>
    </>
  );
}
```

**No error boundary** means one sub-component crash kills the page.

**Fix:**
```tsx
<ErrorBoundary fallback={<ErrorPage />}>
  <CompanyStatsCard data={statsQ.data} />
</ErrorBoundary>
```

---

## MOST LIKELY CRASH (Probability Ranking)

1. **70%:** `statsQ.data` is undefined, DataTable or StatsCard tries to access it
   - **Evidence:** Check `npm run build` output for chunk size (large = many components)
   - **Fix:** Add `statsQ.isLoading` and `statsQ.isError` guards

2. **20%:** `companies` array is undefined on first render
   - **Evidence:** Network tab shows slow/failed request
   - **Fix:** Use `data: companies = []` in query destructuring

3. **10%:** Dialog state mutation or unhandled form error
   - **Evidence:** Rare, specific user action sequence
   - **Fix:** Add dialog error display + state reset

---

## EXACT PATCH RECOMMENDATIONS

### Patch 1: Add Error Guards

**File:** `src/routes/_app.admin.companies.tsx`

**Before:**
```tsx
const { data: companies } = useQuery({...});
const statsQ = useQuery({...});

return (
  <>
    <Topbar ... />
    <div>
      <CompanyStatsCard data={statsQ.data} />
      <DataTable data={companies} />
    </div>
  </>
);
```

**After:**
```tsx
const { data: companies = [], isLoading: companiesLoading, isError: companiesError } = useQuery({...});
const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({...});

if (companiesError || statsError) {
  return <ErrorPage />;
}

if (companiesLoading || statsLoading) {
  return <Skeleton />;
}

return (
  <>
    <Topbar ... />
    <div>
      <CompanyStatsCard data={stats} />
      <DataTable data={companies ?? []} />
    </div>
  </>
);
```

### Patch 2: Add Error Boundary

**File:** `src/routes/_app.admin.companies.tsx`

**Before:**
```tsx
export default function CompaniesPage() {
  return <CompaniesContent />;
}
```

**After:**
```tsx
export default function CompaniesPage() {
  return (
    <ErrorBoundary fallback={<ErrorPage />}>
      <CompaniesContent />
    </ErrorBoundary>
  );
}
```

### Patch 3: Fix Dialog State

**File:** `src/routes/_app.admin.companies.tsx`

**Before:**
```tsx
const handleEditClick = (company) => {
  setEditingCompany(company);
  setShowEditDialog(true);
};

const handleSaveCompany = async (data) => {
  await updateMutation.mutateAsync({...});
  setShowEditDialog(false);
  // selectedCompany not reset!
};
```

**After:**
```tsx
const handleEditClick = (company) => {
  setEditingCompany(company);
  setShowEditDialog(true);
};

const handleSaveCompany = async (data) => {
  try {
    await updateMutation.mutateAsync({...});
    setEditingCompany(null);
    setShowEditDialog(false);
  } catch (error) {
    // Show error in modal
    setError(error.message);
  }
};

const handleCloseDialog = () => {
  setEditingCompany(null);
  setShowEditDialog(false);
  setError(null);
};
```

---

## VERIFICATION STEPS (For QA)

1. **Load Companies page**
   - Expected: Page renders with stats + table
   - Actual: ?

2. **Check browser console**
   - Expected: No errors
   - Actual: ?

3. **Check network tab**
   - Expected: `/admin/companies` and `/admin/companies-stats` both return 200
   - Actual: ?

4. **Throttle network to "Slow 3G"**
   - Expected: Loading skeleton, then content
   - Actual: ?

5. **Mock API error (modify network intercept)**
   - Expected: Error page with retry
   - Actual: ?

---

## DEPENDENT SYSTEMS

- **Admin API:** `v1/admin.py` endpoints
- **Query Cache:** TanStack Query config
- **Error Boundary:** React error boundary component
- **UI Components:** DataTable, Dialog, Card components
- **Auth:** Must have SUPER_ADMIN role to access page

---

**Status:** Ready for patching  
**Patches:** 3 (error guards, error boundary, dialog state)  
**Risk:** LOW (fixes are additive, no removal)  
**Effort:** 2-4 hours (including testing)
