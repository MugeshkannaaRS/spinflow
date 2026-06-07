import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { loginAs } from './helpers';

const routes = [
  '/dashboard',
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
  '/production',
];

test('authenticated route audit for SUPER_ADMIN', async ({ page }) => {
  const evidenceBase = path.resolve('e2e', 'auth-route-evidence');
  fs.mkdirSync(evidenceBase, { recursive: true });

  await loginAs(page, 'super');

  for (const route of routes) {
    const evidenceDir = path.join(evidenceBase, route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, ''));
    fs.mkdirSync(evidenceDir, { recursive: true });

    const consoleMessages: Array<{ type: string; text: string }> = [];
    const pageErrors: Array<{ message: string; stack: string | null }> = [];
    const failedRequests: Array<{ url: string; method: string; failure: string | null }> = [];
    const responseErrors: Array<{ url: string; status: number; statusText: string; body: string }> = [];

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
    });
    page.on('response', async (response) => {
      const status = response.status();
      if (status >= 400) {
        let body = '';
        try {
          body = await response.text();
        } catch (e) {
          body = `<failed to read body: ${e}>`;
        }
        responseErrors.push({ url: response.url(), status, statusText: response.statusText(), body });
      }
    });

    await page.goto(route, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(1000);

    const currentRoute = await page.evaluate(() => window.location.href);
    const pageTitle = await page.title();
    const html = await page.content();
    fs.writeFileSync(path.join(evidenceDir, 'route.txt'), currentRoute);
    fs.writeFileSync(path.join(evidenceDir, 'title.txt'), pageTitle);
    fs.writeFileSync(path.join(evidenceDir, 'page.html'), html);

    const screenshotPath = path.join(evidenceDir, 'screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    fs.writeFileSync(path.join(evidenceDir, 'console-errors.json'), JSON.stringify(consoleMessages, null, 2));
    fs.writeFileSync(path.join(evidenceDir, 'page-errors.json'), JSON.stringify(pageErrors, null, 2));
    fs.writeFileSync(path.join(evidenceDir, 'failed-requests.json'), JSON.stringify(failedRequests, null, 2));
    fs.writeFileSync(path.join(evidenceDir, 'response-errors.json'), JSON.stringify(responseErrors, null, 2));

    console.log('route:', route);
    console.log('currentRoute:', currentRoute);
    console.log('title:', pageTitle);
    console.log('console errors:', consoleMessages.length);
    console.log('page errors:', pageErrors.length);
    console.log('failed requests:', failedRequests.length);
    console.log('response errors:', responseErrors.length);
    console.log('screenshot:', screenshotPath);
  }
});
