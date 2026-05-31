import { Page, expect } from '@playwright/test';
import users from '../fixtures/users';

export async function loginAs(page: Page, role: keyof typeof users) {
  const user = users[role];
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 60000, state: 'visible' });
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 20000 }),
    page.click('button:has-text("Sign in")')
  ]);
}

export async function expectKpiCards(page: Page) {
  // generic check: at least one KPI card exists and contains a number or 'kg' or '₹'
  const cards = page.locator('.kpi-card, .kpi', { hasText: /\d|kg|₹/ });
  await expect(cards.first()).toBeVisible();
}
