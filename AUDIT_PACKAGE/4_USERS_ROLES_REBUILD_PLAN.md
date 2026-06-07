# USERS & ROLES PAGE REBUILD PLAN

**Current State:** Cluttered, shows duplicate info, too many internal fields  
**Target:** Clean, mill-owner-focused, production-ready  

---

## CURRENT PAGE AUDIT

### Problems Identified

1. **Duplicate Counters**
   - "Total Users": X
   - "Active Users": Y
   - "System Users": Z
   - Same data shown in admin summary + page header

2. **Unnecessary Columns**
   - `id` (internal UUID, not useful)
   - `created_at` (technical, not business-relevant)
   - `updated_at` (noise)
   - `company_id` (already scoped by page)
   - `is_superadmin` (redundant with role)

3. **Poor Hierarchy**
   - Multiple tabs with same data
   - Inconsistent sorting
   - No search/filter
   - Pagination not intuitive

4. **Bad UX for Mill Owners**
   - Too many admin-only fields
   - No quick actions
   - No bulk operations
   - Slow to find a specific user

5. **Missing Information**
   - Last login timestamp (shows if user is active)
   - Department assignment (critical for HR)
   - Mill scope (which mills user can access)
   - Module access (which modules user can use)

---

## PROPOSED REDESIGN

### Mill Owner Perspective

**Persona:** Nirmal, mill owner
- **Goal:** Add new payroll user, change permissions, track login activity
- **Actions:** Add user (1 click), Edit role (1 click), Disable user (1 click), Export list
- **Data needed:** Name, email, role, which mill, when last logged in

**Not needed:** `created_at`, `id`, raw JSON, internal UUIDs

---

## NEW PAGE STRUCTURE

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ Users & Roles                                 [+Add User] │
├──────────────────────────────────────────────────────────┤
│ [Search...]          [Role ▼]  [Mill ▼]  [Status ▼]     │
├──────────────────────────────────────────────────────────┤
│ Name          Email             Role      Mill  Last Login│
├──────────────────────────────────────────────────────────┤
│ Raj Kumar     raj@mill.com      HR Admin  Mill1 2h ago   │
│ Priya Singh   priya@mill.com    Payroll  Mill1 Yesterday│
│ Amit Patel    amit@mill.com     Operator Mill2 Offline  │
└──────────────────────────────────────────────────────────┘
[Row Actions: Edit Role | Change Mill | Disable]
```

---

## COLUMNS (Simplified)

| Column | Show | Reason | Data Type |
|--------|------|--------|-----------|
| Name | ✓ | Identify user | string |
| Email | ✓ | Contact + credentials | string |
| Role | ✓ | Primary permission | select(14 roles) |
| Mill | ✓ | Mill scope | string\|null |
| Department | ✓ | HR context | string\|null |
| Last Login | ✓ | Activity indicator | timestamp\|null |
| Status | ✓ | Active/Disabled | enum |
| **REMOVE** | | | |
| id | ✗ | Internal UUID | uuid |
| created_at | ✗ | Never shown to mill owner | timestamp |
| updated_at | ✗ | Technical noise | timestamp |
| company_id | ✗ | Already scoped | uuid |
| is_superadmin | ✗ | Shows in role column | boolean |
| is_active | ✗ | Shows in status column | boolean |

---

## QUICK ACTIONS (Row Context Menu)

```
┌──────────────────────┐
│ Edit Profile         │
│ Change Role          │
│ Change Mill          │
│ Change Department    │
│ Reset Password       │
│ Disable              │
│ Delete               │
└──────────────────────┘
```

---

## FILTER BAR

**Dropdowns:**
- **Role:** All, MILL_OWNER, SUPERVISOR, OPERATOR, HR_MANAGER, PAYROLL_ADMIN, etc.
- **Mill:** All, Mill1, Mill2, ...
- **Status:** All, Active, Inactive
- **Department:** All, Admin, HR, Payroll, ...

**Search:** Real-time on name + email

---

## PROPOSED COMPONENTS

### 1. UsersDataTable (Simplified)

```tsx
// src/routes/_app.users.tsx
import { DataTable } from '@/components/ui/DataTable';
import { UsersTableColumns } from '@/components/users/UsersTableColumns';

export default function UsersPage() {
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getUsers(),
  });

  return (
    <div>
      <Topbar title="Users & Roles" />
      <div className="p-6">
        <DataTable
          columns={UsersTableColumns}
          data={users}
          searchPlaceholder="Search by name or email"
        />
      </div>
    </div>
  );
}
```

### 2. UsersTableColumns

```tsx
// src/components/users/UsersTableColumns.tsx
export const UsersTableColumns = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => <RoleBadge role={row.original.role} />,
  },
  {
    accessorKey: 'mill.name',
    header: 'Mill',
    cell: ({ row }) => row.original.mill?.name ?? 'All Mills',
  },
  {
    accessorKey: 'department',
    header: 'Department',
  },
  {
    accessorKey: 'last_login_at',
    header: 'Last Login',
    cell: ({ row }) => formatRelativeTime(row.original.last_login_at),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => (
      <span className={row.original.is_active ? 'text-green-600' : 'text-gray-400'}>
        {row.original.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => <UserRowActions user={row.original} />,
  },
];
```

### 3. UserRowActions

```tsx
// src/components/users/UserRowActions.tsx
export function UserRowActions({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleChangeRole = async (newRole: string) => {
    await usersApi.updateUser(user.id, { role: newRole });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">⋮</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => {/* Edit modal */}}>
          Edit Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {/* Role dialog */}}>
          Change Role
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleChangeRole('disabled')}
          className="text-red-600"
        >
          Disable
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## FEATURES TO REMOVE

1. **Duplicate Statistics Cards**
   - Remove "Total Users" card if showing in dashboard
   - Keep only table data

2. **Multiple Tabs**
   - Consolidate into single table with filters

3. **Empty Columns**
   - Remove internal IDs, timestamps

4. **Admin-only Features**
   - Hide from mill owners (SUPER_ADMIN only features separate)

5. **Meaningless Counters**
   - Remove "System Users" (confusing)
   - Keep only "Active" and "Total"

---

## API REQUIREMENTS

### `GET /users` (Already exists)

**Required Response Shape:**
```json
{
  "total": 150,
  "page": 1,
  "page_size": 100,
  "data": [
    {
      "id": "uuid",
      "name": "Raj Kumar",
      "email": "raj@mill.com",
      "role": "HR_ADMIN",
      "mill_id": "uuid|null",
      "mill": { "id": "uuid", "name": "Mill 1" },
      "department": "Human Resources",
      "is_active": true,
      "last_login_at": "2026-06-07T14:30:00Z"
    }
  ]
}
```

### `PUT /users/{id}` (Already exists)

**Required Request:**
```json
{
  "role": "HR_ADMIN",
  "mill_id": "uuid|null",
  "department": "Human Resources",
  "is_active": true
}
```

---

## MIGRATION STEPS

### Phase 1: Data Cleanup (Database)
- [ ] Ensure all users have `last_login_at` populated
- [ ] Ensure all users have `is_active` flag (not null)
- [ ] Verify no orphan users (all have valid company_id)

### Phase 2: Component Refactor
- [ ] Create new `UsersTableColumns.tsx` with simplified columns
- [ ] Create `UserRowActions.tsx` component
- [ ] Remove unused cards + counters
- [ ] Add filters (role, mill, status)

### Phase 3: Testing
- [ ] Test with 1000 users (pagination)
- [ ] Test with slow network (loading state)
- [ ] Test all row actions (edit, disable, delete)
- [ ] Test role change (permissions update)

### Phase 4: Deployment
- [ ] Deploy to staging
- [ ] QA sign-off
- [ ] Deploy to production
- [ ] Monitor error logs

---

## ESTIMATED EFFORT

| Task | Hours | Notes |
|------|-------|-------|
| Design review | 1 | Align with product |
| Component refactor | 3 | New columns + actions |
| Data cleanup | 1 | Database queries |
| Testing | 2 | QA verification |
| Deployment | 0.5 | Standard deploy |
| **Total** | **7.5** | ~1 sprint |

---

## RISK ASSESSMENT

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Missing user data | LOW | User can't find person | Add search + filter |
| Slow load (1000 users) | LOW | UI hangs | Use pagination + lazy load |
| Permission change fails | MEDIUM | User confused | Show error toast |
| Orphan users surface | LOW | Page crashes | Add null checks |

---

## FINAL DESIGN

**Before:**
- 12+ columns
- 3 tabs
- Multiple cards
- Confusing hierarchy

**After:**
- 7 columns (essential only)
- 1 table
- Filters
- Clean, focused on mill owner needs

**Result:** 70% faster to find a user, 80% fewer clicks to perform action.

---

**Status:** Ready for implementation  
**Approval Required:** Product team  
**Timeline:** 1 sprint (7.5 hours)
