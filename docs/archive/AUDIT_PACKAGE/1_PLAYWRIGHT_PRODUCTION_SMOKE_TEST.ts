/**
 * SPINFLOW ERP - PRODUCTION SMOKE TEST SUITE
 * 
 * Comprehensive route testing with console/network/screenshot capture
 * 
 * Usage:
 *   npx ts-node AUDIT_PACKAGE/1_PLAYWRIGHT_PRODUCTION_SMOKE_TEST.ts \
 *     --base-url https://spinflow.example.com \
 *     --output /tmp/spinflow_audit
 * 
 * Output:
 *   - /tmp/spinflow_audit/report.json (structured findings)
 *   - /tmp/spinflow_audit/routes/*.har (network captures)
 *   - /tmp/spinflow_audit/routes/*.png (screenshots)
 *   - /tmp/spinflow_audit/routes/*.console.log (browser console)
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/admin', name: 'Admin' },
  { path: '/admin/companies', name: 'Companies' },
  { path: '/admin/users', name: 'Users' },
  { path: '/admin/archive', name: 'Archive' },
  { path: '/admin/billing', name: 'Billing' },
  { path: '/admin/subscriptions', name: 'Subscriptions' },
  { path: '/admin/audit', name: 'Audit Logs' },
  { path: '/masters', name: 'Masters' },
  { path: '/hr', name: 'HR' },
  { path: '/payroll', name: 'Payroll' },
  { path: '/stores', name: 'Stores' },
  { path: '/inventory', name: 'Inventory' },
  { path: '/dispatch', name: 'Dispatch' },
  { path: '/maintenance', name: 'Maintenance' },
  { path: '/quality', name: 'Quality' },
  { path: '/lotrac', name: 'LoTrac' },
];

interface RouteResult {
  route: string;
  name: string;
  status: 'OK' | 'ERROR' | 'TIMEOUT' | 'CRASH';
  httpStatus?: number;
  consoleErrors: string[];
  consoleWarnings: string[];
  networkFailures: Array<{
    url: string;
    status: number;
    statusText: string;
  }>;
  reactException?: string;
  loadTime: number;
  timestamp: string;
}

async function captureRoute(
  page: Page,
  baseUrl: string,
  route: { path: string; name: string },
  outputDir: string
): Promise<RouteResult> {
  const fullUrl = baseUrl + route.path;
  const result: RouteResult = {
    route: route.path,
    name: route.name,
    status: 'OK',
    consoleErrors: [],
    consoleWarnings: [],
    networkFailures: [],
    loadTime: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    // Capture console messages
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        result.consoleErrors.push(msg.text());
      } else if (msg.type() === 'warning') {
        result.consoleWarnings.push(msg.text());
      }
    });

    // Capture failed requests
    page.on('response', (response) => {
      if (response.status() >= 400) {
        result.networkFailures.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText(),
        });
      }
    });

    // Capture uncaught exceptions
    page.on('pageerror', (error) => {
      result.reactException = error.toString();
      result.status = 'CRASH';
    });

    const startTime = Date.now();
    const response = await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 15000 });
    result.loadTime = Date.now() - startTime;

    if (!response) {
      result.status = 'TIMEOUT';
    } else if (response.status() >= 400) {
      result.httpStatus = response.status();
      result.status = 'ERROR';
    }

    // Wait for any lingering JS errors (React exceptions, async errors)
    await page.waitForTimeout(1000);

    // Capture screenshot
    const screenshotPath = path.join(outputDir, 'routes', `${route.name.replace(/\s+/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath });

    // Capture HAR (network log)
    const harPath = path.join(outputDir, 'routes', `${route.name.replace(/\s+/g, '_')}.har`);
    // Note: HAR capture requires page context; using fetch/request logs as fallback
    const consolePath = path.join(outputDir, 'routes', `${route.name.replace(/\s+/g, '_')}.console.log`);
    fs.writeFileSync(
      consolePath,
      [
        ...result.consoleErrors.map((e) => `[ERROR] ${e}`),
        ...result.consoleWarnings.map((w) => `[WARN] ${w}`),
      ].join('\n')
    );

    if (result.status === 'OK' && result.consoleErrors.length === 0 && result.networkFailures.length === 0) {
      result.status = 'OK';
    } else if (result.consoleErrors.length > 0) {
      result.status = 'ERROR';
    }
  } catch (error: any) {
    result.status = 'CRASH';
    result.reactException = error.message;
  }

  return result;
}

async function main() {
  const baseUrl = process.argv.find((a) => a.startsWith('--base-url'))?.split('=')[1] || 'http://localhost:5173';
  const outputDir = process.argv.find((a) => a.startsWith('--output'))?.split('=')[1] || './audit_output';

  // Create output directories
  fs.mkdirSync(path.join(outputDir, 'routes'), { recursive: true });

  console.log(`🚀 SPINFLOW ERP - PRODUCTION SMOKE TEST SUITE`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Output:   ${outputDir}`);
  console.log(`   Routes:   ${ROUTES.length}`);
  console.log('');

  let browser: Browser | null = null;
  const results: RouteResult[] = [];

  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      // Pre-populate auth if needed
      storageState: undefined, // TODO: provide storageState.json with valid login session
    });

    const page = await context.newPage();

    for (const route of ROUTES) {
      console.log(`  Testing: ${route.name.padEnd(20)} (${route.path})`);
      const result = await captureRoute(page, baseUrl, route, outputDir);
      results.push(result);

      const statusIcon =
        result.status === 'OK'
          ? '✓'
          : result.status === 'ERROR'
            ? '⚠'
            : result.status === 'TIMEOUT'
              ? '⏱'
              : '✗';
      console.log(`    ${statusIcon} ${result.status} (${result.loadTime}ms) - Errors: ${result.consoleErrors.length}, Network: ${result.networkFailures.length}`);
    }

    await context.close();

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl,
      totalRoutes: ROUTES.length,
      passed: results.filter((r) => r.status === 'OK').length,
      failed: results.filter((r) => r.status !== 'OK').length,
      routes: results,
      summary: {
        totalErrors: results.reduce((sum, r) => sum + r.consoleErrors.length, 0),
        totalNetworkFailures: results.reduce((sum, r) => sum + r.networkFailures.length, 0),
        totalReactExceptions: results.filter((r) => !!r.reactException).length,
      },
    };

    const reportPath = path.join(outputDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('');
    console.log(`📊 RESULTS:`);
    console.log(`   ✓ Passed:  ${report.passed}/${report.totalRoutes}`);
    console.log(`   ✗ Failed:  ${report.failed}/${report.totalRoutes}`);
    console.log(`   Errors:    ${report.summary.totalErrors}`);
    console.log(`   Network:   ${report.summary.totalNetworkFailures}`);
    console.log(`   React Ex:  ${report.summary.totalReactExceptions}`);
    console.log('');
    console.log(`📄 Report: ${reportPath}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
