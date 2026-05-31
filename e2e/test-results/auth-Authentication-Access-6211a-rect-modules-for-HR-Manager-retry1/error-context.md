# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication & Access Control >> role sidebar shows correct modules for HR Manager
- Location: tests/auth.spec.ts:33:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('nav')
Expected substring: "HR"
Error: strict mode violation: locator('nav') resolved to 3 elements:
    1) <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">…</nav> aka getByRole('navigation')
    2) <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">…</nav> aka getByText('DashboardHRPayrollReports').nth(1)
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
            - generic [ref=e11]: SpinFlow Coimbatore Unit-1
        - navigation [ref=e12]:
          - link "Dashboard" [ref=e13] [cursor=pointer]:
            - /url: /dashboard
            - img [ref=e14]
            - text: Dashboard
          - link "HR" [ref=e19] [cursor=pointer]:
            - /url: /hr
            - img [ref=e20]
            - text: HR
          - link "Payroll" [ref=e25] [cursor=pointer]:
            - /url: /payroll
            - img [ref=e26]
            - text: Payroll
          - link "Reports" [ref=e29] [cursor=pointer]:
            - /url: /reports
            - img [ref=e30]
            - text: Reports
        - generic [ref=e32]:
          - generic [ref=e33]:
            - generic [ref=e34]: HR Manager Demo
            - generic [ref=e35]: HR Manager
          - button "Sign out" [ref=e36]:
            - img [ref=e37]
            - text: Sign out
    - main [ref=e40]:
      - generic [ref=e41]:
        - generic [ref=e43]:
          - heading "Dashboard" [level=1] [ref=e44]
          - paragraph [ref=e45]: Loading...
        - generic [ref=e46]:
          - button [ref=e48] [cursor=pointer]:
            - img
          - generic [ref=e49]: HR Manager
          - generic [ref=e50]: HM
  - region "Notifications alt+T":
    - list:
      - listitem [ref=e93]:
        - img [ref=e95]
        - generic [ref=e98]: Welcome, HR Manager Demo
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
  14 |     await expect(page.locator('nav')).toContainText('Dashboard');
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
> 42 |     await expect(sidebar).toContainText('HR');
     |                           ^ Error: expect(locator).toContainText(expected) failed
  43 |     await expect(sidebar).not.toContainText('Admin');
  44 |   });
  45 | });
  46 | 
```