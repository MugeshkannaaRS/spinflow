# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication & Access Control >> role sidebar shows correct modules for HR Manager
- Location: tests/auth.spec.ts:37:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('navigation').first()
Expected substring: "HR"
Received string:    "OverviewDashboardOperationsProductionQualityMaintenancePeopleHuman ResourcesPayrollSupply ChainDispatchFinanceAccountsSettingsMastersUsers & RolesAudit Logs"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for getByRole('navigation').first()
    6 × locator resolved to <nav class="flex-1 py-3 px-2">…</nav>
      - unexpected value ""
    8 × locator resolved to <nav class="flex-1 overflow-y-auto py-3 px-2">…</nav>
      - unexpected value "OverviewDashboardOperationsProductionQualityMaintenancePeopleHuman ResourcesPayrollSupply ChainDispatchFinanceAccountsSettingsMastersUsers & RolesAudit Logs"

```

```yaml
- navigation:
  - text: Overview
  - link "Dashboard":
    - /url: /dashboard
  - text: Operations
  - link "Production":
    - /url: /production
  - link "Quality":
    - /url: /quality
  - link "Maintenance":
    - /url: /maintenance
  - text: People
  - link "Human Resources":
    - /url: /hr
  - link "Payroll":
    - /url: /payroll
  - text: Supply Chain
  - link "Dispatch":
    - /url: /dispatch
  - text: Finance
  - link "Accounts":
    - /url: /accounts
  - text: Settings
  - link "Masters":
    - /url: /masters
  - link "Users & Roles":
    - /url: /users
  - link "Audit Logs":
    - /url: /audit
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import users from '../fixtures/users';
  3  | 
  4  | test.describe('Authentication & Access Control', () => {
  5  |   test('login with correct credentials reaches dashboard', async ({ page }) => {
  6  |     await page.goto('/login', { waitUntil: 'networkidle' });
  7  |     await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
  8  |     await page.fill('#email', users.super.email);
  9  |     await page.fill('#password', users.super.password);
  10 |     await Promise.all([
  11 |       page.waitForURL('**/dashboard', { timeout: 20000 }),
  12 |       page.click('button:has-text("Sign in")')
  13 |     ]);
  14 |     await expect(page).toHaveURL(/dashboard/);
  15 |     await expect(page.getByRole('navigation').first()).toContainText('Dashboard');
  16 |   });
  17 | 
  18 |   test('login with wrong password shows invalid credentials', async ({ page }) => {
  19 |     await page.goto('/login', { waitUntil: 'networkidle' });
  20 |     await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
  21 |     await page.fill('#email', users.super.email);
  22 |     await page.fill('#password', 'wrongpass');
  23 |     await Promise.all([
  24 |       page.waitForResponse(resp => resp.url().includes('/api/v1/auth/login') && resp.status() === 401),
  25 |       page.click('button:has-text("Sign in")')
  26 |     ]);
  27 |     await expect(page).toHaveURL(/login/);
  28 |   });
  29 | 
  30 |   test('login with empty fields shows validation errors', async ({ page }) => {
  31 |     await page.goto('/login', { waitUntil: 'networkidle' });
  32 |     await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
  33 |     await page.click('button:has-text("Sign in")');
  34 |     await expect(page.locator('text=/required/i')).toBeVisible({ timeout: 5000 }).catch(() => {});
  35 |   });
  36 | 
  37 |   test('role sidebar shows correct modules for HR Manager', async ({ page }) => {
  38 |     await page.goto('/login', { waitUntil: 'networkidle' });
  39 |     await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
  40 |     await page.fill('#email', users.hr.email);
  41 |     await page.fill('#password', users.hr.password);
  42 |     await Promise.all([
  43 |       page.waitForURL('**/dashboard', { timeout: 20000 }),
  44 |       page.click('button:has-text("Sign in")')
  45 |     ]);
  46 |     const sidebar = page.getByRole('navigation').first();
> 47 |     await expect(sidebar).toContainText('HR');
     |                           ^ Error: expect(locator).toContainText(expected) failed
  48 |     await expect(sidebar).not.toContainText('Admin');
  49 |   });
  50 | });
  51 | 
```