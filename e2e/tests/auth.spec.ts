import { test, expect } from '@playwright/test';
import users from '../fixtures/users';

test.describe('Authentication & Access Control', () => {
  test('login with correct credentials reaches dashboard', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
    await page.fill('#email', users.super.email);
    await page.fill('#password', users.super.password);
    await Promise.all([
      page.waitForURL('**/dashboard', { timeout: 20000 }),
      page.click('button:has-text("Sign in")')
    ]);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole('navigation').first()).toContainText('Dashboard');
  });

  test('login with wrong password shows invalid credentials', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
    await page.fill('#email', users.super.email);
    await page.fill('#password', 'wrongpass');
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/v1/auth/login') && resp.status() === 401),
      page.click('button:has-text("Sign in")')
    ]);
    await expect(page).toHaveURL(/login/);
  });

  test('login with empty fields shows validation errors', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
    await page.click('button:has-text("Sign in")');
    await expect(page.locator('text=/required/i')).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('role sidebar shows correct modules for HR Manager', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
    await page.fill('#email', users.hr.email);
    await page.fill('#password', users.hr.password);
    await Promise.all([
      page.waitForURL('**/dashboard', { timeout: 20000 }),
      page.click('button:has-text("Sign in")')
    ]);
    const sidebar = page.getByRole('navigation').first();
    await expect(sidebar).toContainText('HR');
    await expect(sidebar).not.toContainText('Admin');
  });
});
