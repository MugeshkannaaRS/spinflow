# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production_admin_route_audit.spec.ts >> authenticated production route audit
- Location: tests/production_admin_route_audit.spec.ts:23:5

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.goto: Test timeout of 120000ms exceeded.
Call log:
  - navigating to "https://spinflow-f.onrender.com/admin/billing", waiting until "networkidle"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - link "S SpinFlow ERP Vendor" [ref=e7] [cursor=pointer]:
          - /url: /dashboard
          - generic [ref=e8]: S
          - generic [ref=e9]:
            - generic [ref=e10]: SpinFlow ERP
            - generic [ref=e11]: Vendor
        - navigation [ref=e12]:
          - generic [ref=e13]:
            - generic [ref=e14]: Overview
            - link "Dashboard" [ref=e15] [cursor=pointer]:
              - /url: /dashboard
              - img [ref=e16]
              - generic [ref=e21]: Dashboard
          - generic [ref=e22]:
            - generic [ref=e23]: Settings
            - link "Users & Roles" [ref=e24] [cursor=pointer]:
              - /url: /users
              - img [ref=e25]
              - generic [ref=e37]: Users & Roles
            - link "Audit Logs" [ref=e38] [cursor=pointer]:
              - /url: /audit
              - img [ref=e39]
              - generic [ref=e42]: Audit Logs
            - link "Admin Panel" [ref=e43] [cursor=pointer]:
              - /url: /admin
              - img [ref=e44]
              - generic [ref=e46]: Admin Panel
            - link "Column Config" [ref=e47] [cursor=pointer]:
              - /url: /admin/column-config
              - img [ref=e48]
              - generic [ref=e49]: Column Config
            - link "Billing" [ref=e50] [cursor=pointer]:
              - /url: /admin/billing
              - img [ref=e51]
              - generic [ref=e53]: Billing
          - generic [ref=e54]:
            - generic [ref=e55]: Company
            - link "Billing" [ref=e56] [cursor=pointer]:
              - /url: /company/billing
              - img [ref=e57]
              - generic [ref=e59]: Billing
        - generic [ref=e60]:
          - link "S superadmin SUPER ADMIN" [ref=e61] [cursor=pointer]:
            - /url: /profile
            - generic [ref=e62]: S
            - generic [ref=e63]:
              - generic [ref=e64]: superadmin
              - generic [ref=e65]: SUPER ADMIN
          - button "Logout" [ref=e66]:
            - img [ref=e67]
            - generic [ref=e70]: Logout
          - button "Collapse sidebar" [ref=e71]:
            - img [ref=e72]
    - generic [ref=e74]:
      - banner [ref=e75]:
        - generic [ref=e76]:
          - heading "Admin Panel" [level=1] [ref=e77]
          - paragraph [ref=e78]: System administration
        - generic [ref=e79]:
          - button "Notifications" [ref=e81]:
            - img [ref=e82]
          - generic [ref=e85]: SUPER ADMIN
          - button "User menu" [ref=e87]: S
      - main [ref=e88]:
        - generic [ref=e89]:
          - generic [ref=e90]:
            - heading "Billing" [level=1] [ref=e91]
            - paragraph [ref=e92]: Commercial control center — subscriptions, invoicing, and revenue analytics.
          - generic [ref=e124]:
            - button "Subscriptions View and manage company subscriptions" [ref=e125]:
              - img [ref=e127]
              - heading "Subscriptions" [level=3] [ref=e131]
              - paragraph [ref=e132]: View and manage company subscriptions
            - button "Invoices All invoices across companies" [ref=e133]:
              - img [ref=e135]
              - heading "Invoices" [level=3] [ref=e138]
              - paragraph [ref=e139]: All invoices across companies
            - button "Payments Payment records and history" [ref=e140]:
              - img [ref=e142]
              - heading "Payments" [level=3] [ref=e144]
              - paragraph [ref=e145]: Payment records and history
            - button "Plans Manage subscription plans and pricing" [ref=e146]:
              - img [ref=e148]
              - heading "Plans" [level=3] [ref=e150]
              - paragraph [ref=e151]: Manage subscription plans and pricing
            - button "Analytics Revenue metrics, MRR, ARR, churn" [ref=e152]:
              - img [ref=e154]
              - heading "Analytics" [level=3] [ref=e157]
              - paragraph [ref=e158]: Revenue metrics, MRR, ARR, churn
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test } from '@playwright/test';
  2  | import path from 'path';
  3  | import fs from 'fs';
  4  | import { loginAs } from './helpers';
  5  | 
  6  | const routes = [
  7  |   '/admin/companies',
  8  |   '/admin/users',
  9  |   '/admin/billing',
  10 |   '/admin/subscriptions',
  11 |   '/admin/audit',
  12 |   '/masters',
  13 |   '/hr',
  14 |   '/payroll',
  15 |   '/inventory',
  16 |   '/stores',
  17 |   '/dispatch',
  18 |   '/maintenance',
  19 |   '/quality',
  20 |   '/lotrac',
  21 | ];
  22 | 
  23 | test('authenticated production route audit', async ({ page }) => {
  24 |   await loginAs(page, 'super');
  25 | 
  26 |   const rootEvidence = path.resolve('e2e', 'prod-audit');
  27 |   fs.mkdirSync(rootEvidence, { recursive: true });
  28 | 
  29 |   for (const route of routes) {
  30 |     const sanitized = route.replace(/\//g, '_').replace(/^_/, '');
  31 |     const evidenceDir = path.join(rootEvidence, sanitized);
  32 |     fs.mkdirSync(evidenceDir, { recursive: true });
  33 | 
  34 |     const consoleMessages: Array<{ type: string; text: string }> = [];
  35 |     const pageErrors: Array<{ message: string; stack: string | null }> = [];
  36 |     const failedRequests: Array<{ url: string; method: string; failure: string | null }> = [];
  37 |     const responseErrors: Array<{ url: string; status: number; statusText: string; body: string }> = [];
  38 |     const networkRequests: Array<{ url: string; method: string; status: number | null; statusText: string | null }> = [];
  39 | 
  40 |     page.removeAllListeners('console');
  41 |     page.removeAllListeners('pageerror');
  42 |     page.removeAllListeners('requestfailed');
  43 |     page.removeAllListeners('response');
  44 | 
  45 |     page.on('console', (message) => {
  46 |       const type = message.type();
  47 |       if (type === 'error' || type === 'warning') {
  48 |         consoleMessages.push({ type, text: message.text() });
  49 |       }
  50 |     });
  51 |     page.on('pageerror', (error) => {
  52 |       pageErrors.push({ message: error.message, stack: error.stack ?? null });
  53 |     });
  54 |     page.on('requestfailed', (request) => {
  55 |       failedRequests.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText ?? null });
  56 |       networkRequests.push({ url: request.url(), method: request.method(), status: null, statusText: null });
  57 |     });
  58 |     page.on('response', async (response) => {
  59 |       const status = response.status();
  60 |       const url = response.url();
  61 |       networkRequests.push({ url, method: response.request().method(), status, statusText: response.statusText() });
  62 |       if (status >= 400) {
  63 |         let body = '';
  64 |         try {
  65 |           body = await response.text();
  66 |         } catch (e) {
  67 |           body = `<failed to read body: ${e}>`;
  68 |         }
  69 |         responseErrors.push({ url, status, statusText: response.statusText(), body });
  70 |       }
  71 |     });
  72 | 
> 73 |     await page.goto(route, { waitUntil: 'networkidle', timeout: 120_000 });
     |                ^ Error: page.goto: Test timeout of 120000ms exceeded.
  74 |     await page.waitForLoadState('networkidle', { timeout: 120_000 });
  75 | 
  76 |     const currentRoute = await page.evaluate(() => window.location.href);
  77 |     const pageTitle = await page.title();
  78 |     const html = await page.content();
  79 |     fs.writeFileSync(path.join(evidenceDir, 'route.txt'), currentRoute);
  80 |     fs.writeFileSync(path.join(evidenceDir, 'title.txt'), pageTitle);
  81 |     fs.writeFileSync(path.join(evidenceDir, 'page.html'), html);
  82 |     const screenshotPath = path.join(evidenceDir, 'screenshot.png');
  83 |     await page.screenshot({ path: screenshotPath, fullPage: true });
  84 | 
  85 |     if (consoleMessages.length) fs.writeFileSync(path.join(evidenceDir, 'console-errors.json'), JSON.stringify(consoleMessages, null, 2));
  86 |     if (pageErrors.length) fs.writeFileSync(path.join(evidenceDir, 'page-errors.json'), JSON.stringify(pageErrors, null, 2));
  87 |     if (failedRequests.length) fs.writeFileSync(path.join(evidenceDir, 'failed-requests.json'), JSON.stringify(failedRequests, null, 2));
  88 |     if (responseErrors.length) fs.writeFileSync(path.join(evidenceDir, 'response-errors.json'), JSON.stringify(responseErrors, null, 2));
  89 |     if (networkRequests.length) fs.writeFileSync(path.join(evidenceDir, 'network-requests.json'), JSON.stringify(networkRequests, null, 2));
  90 | 
  91 |     console.log(`${route}: title=${pageTitle} console=${consoleMessages.length} pageErrors=${pageErrors.length} failedRequests=${failedRequests.length} responseErrors=${responseErrors.length}`);
  92 |   }
  93 | });
  94 | 
```