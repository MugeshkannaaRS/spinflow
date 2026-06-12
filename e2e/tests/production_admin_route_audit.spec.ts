import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { loginAs } from './helpers';

const routes = [
  '/admin/companies',
  '/admin/users',
  '/admin/billing',
  '/admin/subscriptions',
  '/admin/audit',
  '/masters',
  '/hr',
  '/payroll',
  '/inventory',
  '/stores',
  '/dispatch',
  '/maintenance',
  '/quality',
  '/lotrac',
];

test('authenticated production route audit', async ({ page }) => {
  await loginAs(page, 'super');

  const rootEvidence = path.resolve('e2e', 'prod-audit');
  fs.mkdirSync(rootEvidence, { recursive: true });

  for (const route of routes) {
    const sanitized = route.replace(/\//g, '_').replace(/^_/, '');
    const evidenceDir = path.join(rootEvidence, sanitized);
    fs.mkdirSync(evidenceDir, { recursive: true });

    const consoleMessages: Array<{ type: string; text: string }> = [];
    const pageErrors: Array<{ message: string; stack: string | null }> = [];
    const failedRequests: Array<{ url: string; method: string; failure: string | null }> = [];
    const responseErrors: Array<{ url: string; status: number; statusText: string; body: string }> = [];
    const networkRequests: Array<{ url: string; method: string; status: number | null; statusText: string | null }> = [];

    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    page.removeAllListeners('requestfailed');
    page.removeAllListeners('response');

    page.on('console', (message) => {
      const type = message.type();
      if (type === 'error' || type === 'warning') {
        consoleMessages.push({ type, text: message.text() });
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push({ message: error.message, stack: error.stack ?? null });
    });
    page.on('requestfailed', (request) => {
      failedRequests.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText ?? null });
      networkRequests.push({ url: request.url(), method: request.method(), status: null, statusText: null });
    });
    page.on('response', async (response) => {
      const status = response.status();
      const url = response.url();
      networkRequests.push({ url, method: response.request().method(), status, statusText: response.statusText() });
      if (status >= 400) {
        let body = '';
        try {
          body = await response.text();
        } catch (e) {
          body = `<failed to read body: ${e}>`;
        }
        responseErrors.push({ url, status, statusText: response.statusText(), body });
      }
    });

    await page.goto(route, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForLoadState('networkidle', { timeout: 120_000 });

    const currentRoute = await page.evaluate(() => window.location.href);
    const pageTitle = await page.title();
    const html = await page.content();
    fs.writeFileSync(path.join(evidenceDir, 'route.txt'), currentRoute);
    fs.writeFileSync(path.join(evidenceDir, 'title.txt'), pageTitle);
    fs.writeFileSync(path.join(evidenceDir, 'page.html'), html);
    const screenshotPath = path.join(evidenceDir, 'screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (consoleMessages.length) fs.writeFileSync(path.join(evidenceDir, 'console-errors.json'), JSON.stringify(consoleMessages, null, 2));
    if (pageErrors.length) fs.writeFileSync(path.join(evidenceDir, 'page-errors.json'), JSON.stringify(pageErrors, null, 2));
    if (failedRequests.length) fs.writeFileSync(path.join(evidenceDir, 'failed-requests.json'), JSON.stringify(failedRequests, null, 2));
    if (responseErrors.length) fs.writeFileSync(path.join(evidenceDir, 'response-errors.json'), JSON.stringify(responseErrors, null, 2));
    if (networkRequests.length) fs.writeFileSync(path.join(evidenceDir, 'network-requests.json'), JSON.stringify(networkRequests, null, 2));

    console.log(`${route}: title=${pageTitle} console=${consoleMessages.length} pageErrors=${pageErrors.length} failedRequests=${failedRequests.length} responseErrors=${responseErrors.length}`);

    expect(consoleMessages).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  }
});
