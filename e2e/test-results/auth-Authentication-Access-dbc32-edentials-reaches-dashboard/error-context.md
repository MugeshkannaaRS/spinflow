# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication & Access Control >> login with correct credentials reaches dashboard
- Location: tests/auth.spec.ts:5:7

# Error details

```
TimeoutError: page.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('#email')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - link "Render Logo" [ref=e5] [cursor=pointer]:
      - /url: https://render.com/?utm_source=free_interstitialv2
      - img "Render Logo" [ref=e6]
    - generic [ref=e7]:
      - generic [ref=e8]: 21:41:05 Incoming HTTP request detected ...
      - generic [ref=e9]: 21:41:08 Service waking up ...
      - generic [ref=e12]: __| |______________________________________________________________________________________________________________________________| |__ __ ______________________________________________________________________________________________________________________________ __ | | | | | | | | | | | | | | ___ __ _______ ___ ________ ________ _____ ______ _______ | | | | |\ \ |\ \ |\ ___ \ |\ \ |\ ____\ |\ __ \ |\ _ \ _ \ |\ ___ \ | | | | \ \ \ \ \ \ \ \ __/| \ \ \ \ \ \___| \ \ \|\ \ \ \ \\\__\ \ \ \ \ __/| | | | | \ \ \ __\ \ \ \ \ \_|/__ \ \ \ \ \ \ \ \ \\\ \ \ \ \\|__| \ \ \ \ \_|/__ | | | | \ \ \|\__\_\ \ \ \ \_|\ \ \ \ \____ \ \ \____ \ \ \\\ \ \ \ \ \ \ \ \ \ \_|\ \ | | | | \ \____________\ \ \_______\ \ \_______\ \ \_______\ \ \_______\ \ \__\ \ \__\ \ \_______\ | | | | \|____________| \|_______| \|_______| \|_______| \|_______| \|__| \|__| \|_______| | | | | | | | | | | | | | | | | _________ ________ ________ _______ ________ ________ _______ ________ | | | | |\___ ___\ |\ __ \ |\ __ \ |\ ___ \ |\ ___ \ |\ ___ \ |\ ___ \ |\ __ \ | | | | \|___ \ \_| \ \ \|\ \ \ \ \|\ \ \ \ __/| \ \ \\ \ \ \ \ \_|\ \ \ \ __/| \ \ \|\ \ | | | | \ \ \ \ \ \\\ \ \ \ _ _\ \ \ \_|/__ \ \ \\ \ \ \ \ \ \\ \ \ \ \_|/__ \ \ _ _\ | | | | \ \ \ \ \ \\\ \ \ \ \\ \| \ \ \_|\ \ \ \ \\ \ \ \ \ \_\\ \ \ \ \_|\ \ \ \ \\ \| | | | | \ \__\ \ \_______\ \ \__\\ _\ \ \_______\ \ \__\\ \__\ \ \_______\ \ \_______\ \ \__\\ _\ | | | | \|__| \|_______| \|__|\|__| \|_______| \|__| \|__| \|_______| \|_______| \|__|\|__| | | | | | | | | | | __| |______________________________________________________________________________________________________________________________| |__ __ ______________________________________________________________________________________________________________________________ __ | | | |
      - generic [ref=e13]: 21:41:12 Allocating compute resources ...
      - generic [ref=e14]: 21:41:15 Preparing instance for initialization ...
      - generic [ref=e15]: 21:41:19 Starting the instance ...
      - generic [ref=e16]: 21:41:25 Environment variables injected ...
      - generic [ref=e17]: 21:41:27 Finalizing startup ...
      - generic [ref=e18]: 21:41:29 Optimizing deployment ...
      - generic [ref=e19]: 21:41:31 Steady hands. Clean logs. Your app is almost live ...
  - generic [ref=e20]:
    - link "Start building on Render today" [ref=e22] [cursor=pointer]:
      - /url: https://render.com/?utm_source=free_interstitialv2
      - text: Start building on Render today
      - img [ref=e24]
    - generic [ref=e27]:
      - img [ref=e28]
      - generic [ref=e31]: Application loading
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import users from '../fixtures/users';
  3  | 
  4  | test.describe('Authentication & Access Control', () => {
  5  |   test('login with correct credentials reaches dashboard', async ({ page }) => {
  6  |     await page.goto('/login');
> 7  |     await page.fill('#email', users.super.email);
     |                ^ TimeoutError: page.fill: Timeout 30000ms exceeded.
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
  42 |     await expect(sidebar).toContainText('HR');
  43 |     await expect(sidebar).not.toContainText('Admin');
  44 |   });
  45 | });
  46 | 
```