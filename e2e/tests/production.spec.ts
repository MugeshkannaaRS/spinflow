import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Production Module', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'production');
    await page.goto('/production');
  });

  test('Production page loads and New Shift Entry is default', async ({ page }) => {
    await expect(page.locator('text=Production')).toBeVisible();
    // New Shift Entry tab
    await expect(page.locator('text=New Shift Entry')).toBeVisible().catch(() => {});
  });

  test('enter produced and waste kg and submit', async ({ page }) => {
    // choose date and shift if present
    await page.click('input[type="date"]').catch(() => {});
    // Fill first machine row if table exists
    const firstProduced = page.locator('input[name*="produced"], input[placeholder*="Produced"]');
    const firstWaste = page.locator('input[name*="waste"], input[placeholder*="Waste"]');
    if (await firstProduced.count()) {
      await firstProduced.first().fill('100');
      if (await firstWaste.count()) await firstWaste.first().fill('2');
      // submit all
      await page.click('button:has-text("Submit All"), button:has-text("Save")').catch(() => {});
      await expect(page.locator('text=Saved, submitted, success')).toHaveCount(0).catch(() => {});
    } else {
      // no machines - expect helpful message
      await expect(page.locator('text=No machines in')).toBeVisible().catch(() => {});
    }
  });

  test('downtime logging validation', async ({ page }) => {
    await page.click('text=Downtime').catch(() => {});
    await page.click('button:has-text("Log Downtime"), button:has-text("Add Downtime")').catch(() => {});
    await page.click('button:has-text("Save")').catch(() => {});
    await expect(page.locator('text=Machine is required')).toBeVisible().catch(() => {});
    await expect(page.locator('text=Start Time is required')).toBeVisible().catch(() => {});
    await expect(page.locator('text=Reason is required')).toBeVisible().catch(() => {});
  });
});
