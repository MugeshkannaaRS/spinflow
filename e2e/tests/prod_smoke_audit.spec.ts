import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Production Smoke Audit', () => {
  const routes = [
    '/',
    '/dashboard',
    '/admin',
    '/admin/companies',
    '/admin/users',
    '/admin/archive',
    '/admin/billing',
    '/admin/subscriptions',
    '/admin/audit',
    '/masters',
    '/hr',
    '/payroll',
    '/stores',
    '/inventory',
    '/dispatch',
    '/maintenance',
    '/quality',
    '/lotrac',
  ];

  for (const route of routes) {
    test(`route ${route} loads without console or network failures`, async ({ page }, testInfo) => {
      const consoleMessages: Array<{ type: string; text: string }> = [];
      const failedRequests: Array<{ url: string; status: number | null; failure: string | null }> = [];
      const apiErrors: Array<{ url: string; status: number | null; text: string }> = [];

      page.on('console', (message) => {
        const type = message.type();
        if (type === 'error' || type === 'warning') {
          consoleMessages.push({ type, text: message.text() });
        }
      });

      page.on('requestfailed', (request) => {
        failedRequests.push({ url: request.url(), status: null, failure: request.failure()?.errorText ?? null });
      });

      page.on('response', async (response) => {
        const status = response.status();
        const url = response.url();
        if (status >= 400 && url.startsWith(page.url().split('?')[0].split('#')[0].replace(/\/$/, ''))) {
          apiErrors.push({ url, status, text: await response.text().catch(() => '') });
        }
      });

      await page.goto(route, { waitUntil: 'networkidle', timeout: 120_000 });

      const filename = path.join('e2e', 'prod-smoke', route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, ''), 'screenshot.png');
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      await page.screenshot({ path: filename, fullPage: true });

      const harPath = path.join('e2e', 'prod-smoke', route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, ''), 'network.har');
      await page.context().tracing.start({ screenshots: false, snapshots: false, sources: false });
      await page.context().tracing.stop({ path: harPath });

      if (consoleMessages.length > 0) {
        const logPath = path.join('e2e', 'prod-smoke', route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, ''), 'console.log');
        fs.writeFileSync(logPath, JSON.stringify(consoleMessages, null, 2));
      }
      if (failedRequests.length > 0) {
        const logPath = path.join('e2e', 'prod-smoke', route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, ''), 'failed-requests.json');
        fs.writeFileSync(logPath, JSON.stringify(failedRequests, null, 2));
      }
      if (apiErrors.length > 0) {
        const logPath = path.join('e2e', 'prod-smoke', route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, ''), 'api-errors.json');
        fs.writeFileSync(logPath, JSON.stringify(apiErrors, null, 2));
      }

      expect(consoleMessages.length, `console errors/warnings for ${route}`).toBe(0);
      expect(failedRequests.length, `failed network requests for ${route}`).toBe(0);
      expect(apiErrors.length, `API 4xx/5xx responses for ${route}`).toBe(0);
    });
  }
});
