# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication & Access Control >> login with wrong password shows invalid credentials
- Location: tests/auth.spec.ts:17:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Invalid credentials')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=Invalid credentials')

```

```yaml
- text: S SpinFlow ERP
- heading "Run your spinning mill in real time." [level=2]
- paragraph: Production, quality, dispatch, inventory and people — one platform, role-aware, audit-ready, QR-traceable.
- text: v1.0 · SpinFlow ERP
- heading "Sign in" [level=1]
- paragraph: Use a demo account or your mill credentials.
- text: Email
- textbox "Email": admin@mill.spinflow
- text: Password
- textbox "Password": Admin@1234
- button "Sign in"
- text: "DEMO ACCOUNTS (password: Admin@1234)"
- button "Super Admin admin@mill.spinflow"
- region "Notifications alt+T"
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
> 22 |     await expect(page.locator('text=Invalid credentials')).toBeVisible();
     |                                                            ^ Error: expect(locator).toBeVisible() failed
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