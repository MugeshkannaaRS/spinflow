# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication & Access Control >> login with correct credentials reaches dashboard
- Location: tests/auth.spec.ts:5:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('nav')
Expected substring: "Dashboard"
Error: strict mode violation: locator('nav') resolved to 3 elements:
    1) <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">…</nav> aka getByRole('navigation')
    2) <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">…</nav> aka getByText('DashboardProductionQualityStockInventoryLoTracDispatchCotton').nth(1)
    3) <nav class="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 lg:hidden pb-safe">…</nav> aka locator('nav').filter({ hasText: 'DashboardLoTracProductionQualityMenu' })

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('nav')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e7]:
          - generic [ref=e8]: S
          - generic [ref=e9]:
            - generic [ref=e10]: SpinFlow ERP
            - generic [ref=e11]: SpinFlow Textiles Pvt. Ltd.
        - navigation [ref=e12]:
          - link "Dashboard" [ref=e13] [cursor=pointer]:
            - /url: /dashboard
            - img [ref=e14]
            - text: Dashboard
          - link "Production" [ref=e19] [cursor=pointer]:
            - /url: /production
            - img [ref=e20]
            - text: Production
          - link "Quality" [ref=e22] [cursor=pointer]:
            - /url: /quality
            - img [ref=e23]
            - text: Quality
          - link "Stock" [ref=e25] [cursor=pointer]:
            - /url: /stock
            - img [ref=e26]
            - text: Stock
          - link "Inventory" [ref=e29] [cursor=pointer]:
            - /url: /inventory
            - img [ref=e30]
            - text: Inventory
          - link "LoTrac" [ref=e40] [cursor=pointer]:
            - /url: /lotrac
            - img [ref=e41]
            - text: LoTrac
          - link "Dispatch" [ref=e44] [cursor=pointer]:
            - /url: /dispatch
            - img [ref=e45]
            - text: Dispatch
          - link "Cotton Purchase" [ref=e50] [cursor=pointer]:
            - /url: /purchase
            - img [ref=e51]
            - text: Cotton Purchase
          - link "Stores" [ref=e55] [cursor=pointer]:
            - /url: /stores
            - img [ref=e56]
            - text: Stores
          - link "HR" [ref=e59] [cursor=pointer]:
            - /url: /hr
            - img [ref=e60]
            - text: HR
          - link "Payroll" [ref=e65] [cursor=pointer]:
            - /url: /payroll
            - img [ref=e66]
            - text: Payroll
          - link "Accounts" [ref=e69] [cursor=pointer]:
            - /url: /accounts
            - img [ref=e70]
            - text: Accounts
          - link "Maintenance" [ref=e73] [cursor=pointer]:
            - /url: /maintenance
            - img [ref=e74]
            - text: Maintenance
          - link "Users & Roles" [ref=e76] [cursor=pointer]:
            - /url: /users
            - img [ref=e77]
            - text: Users & Roles
          - link "Audit Logs" [ref=e80] [cursor=pointer]:
            - /url: /audit
            - img [ref=e81]
            - text: Audit Logs
          - link "Masters" [ref=e84] [cursor=pointer]:
            - /url: /masters
            - img [ref=e85]
            - text: Masters
          - link "Reports" [ref=e89] [cursor=pointer]:
            - /url: /reports
            - img [ref=e90]
            - text: Reports
          - link "Admin Panel" [ref=e92] [cursor=pointer]:
            - /url: /admin
            - img [ref=e93]
            - text: Admin Panel
          - link "Column Config" [ref=e96] [cursor=pointer]:
            - /url: /admin/column-config
            - img [ref=e97]
            - text: Column Config
        - generic [ref=e100]:
          - generic [ref=e101]:
            - generic [ref=e102]: superadmin
            - generic [ref=e103]: Super Admin
          - button "Sign out" [ref=e104]:
            - img [ref=e105]
            - text: Sign out
    - main [ref=e108]:
      - generic [ref=e109]:
        - generic [ref=e111]:
          - heading "Dashboard" [level=1] [ref=e112]
          - paragraph [ref=e113]: Loading...
        - generic [ref=e114]:
          - button [ref=e116] [cursor=pointer]:
            - img
          - generic [ref=e117]: Super Admin
          - generic [ref=e118]: s
  - region "Notifications alt+T":
    - list:
      - listitem [ref=e161]:
        - img [ref=e163]
        - generic [ref=e166]: Welcome, superadmin
      - listitem [ref=e167]:
        - img [ref=e169]
        - generic [ref=e172]: Loading... (server is starting up, please wait)
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import users from '../fixtures/users';
  3  | 
  4  | test.describe('Authentication & Access Control', () => {
  5  |   test('login with correct credentials reaches dashboard', async ({ page }) => {
  6  |     await page.goto('/login');
  7  |     await page.fill('#email', users.super.email);
  8  |     await page.fill('#password', users.super.password);
  9  |     await Promise.all([
  10 |       page.waitForURL('**/dashboard', { timeout: 20000 }),
  11 |       page.click('button:has-text("Sign in")')
  12 |     ]);
  13 |     await expect(page).toHaveURL(/dashboard/);
> 14 |     await expect(page.locator('nav')).toContainText('Dashboard');
     |                                       ^ Error: expect(locator).toContainText(expected) failed
  15 |   });
  16 | 
  17 |   test('login with wrong password shows invalid credentials', async ({ page }) => {
  18 |     await page.goto('/login');
  19 |     await page.fill('#email', users.super.email);
  20 |     await page.fill('#password', 'wrongpass');
  21 |     await page.click('button:has-text("Sign in")');
  22 |     await expect(page.locator('text=Invalid credentials')).toBeVisible();
  23 |   });
  24 | 
  25 |   test('login with empty fields shows validation errors', async ({ page }) => {
  26 |     await page.goto('/login');
  27 |     await page.click('button:has-text("Sign in")');
  28 |     // Some apps show inline text, others show toast — we try a few common messages
  29 |     await expect(page.locator('text=Email is required')).toBeVisible({ timeout: 2000 }).catch(() => {});
  30 |     await expect(page.locator('text=Password is required')).toBeVisible().catch(() => {});
  31 |   });
  32 | 
  33 |   test('role sidebar shows correct modules for HR Manager', async ({ page }) => {
  34 |     await page.goto('/login');
  35 |     await page.fill('#email', users.hr.email);
  36 |     await page.fill('#password', users.hr.password);
  37 |     await Promise.all([
  38 |       page.waitForURL('**/dashboard', { timeout: 20000 }),
  39 |       page.click('button:has-text("Sign in")')
  40 |     ]);
  41 |     const sidebar = page.locator('nav');
  42 |     await expect(sidebar).toContainText('HR');
  43 |     await expect(sidebar).not.toContainText('Admin');
  44 |   });
  45 | });
  46 | 
```