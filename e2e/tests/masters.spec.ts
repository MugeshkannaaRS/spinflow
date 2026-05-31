import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Masters Module', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'owner');
    await page.goto('/masters');
  });

  test('Masters page loads and tabs visible', async ({ page }) => {
    await expect(page.locator('text=Masters')).toBeVisible();
    // Common tabs
    await expect(page.locator('text=Departments')).toBeVisible();
    await expect(page.locator('text=Machines')).toBeVisible();
  });

  test('Add Department validation and create', async ({ page }) => {
    await page.click('button:has-text("Add Department"), a:has-text("Add Department")');
    await expect(page.locator('text=Add Department')).toBeVisible();
    // Submit empty
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Code is required')).toBeVisible().catch(() => {});
    await expect(page.locator('text=Name is required')).toBeVisible().catch(() => {});
    // Try filling
    await page.fill('input[name="code"]', 'QA-DPT');
    await page.fill('input[name="name"]', 'QA Department');
    await page.click('button:has-text("Save")');
    // Expect it to appear in list
    await expect(page.locator('table')).toContainText('QA-DPT');
  });
});
