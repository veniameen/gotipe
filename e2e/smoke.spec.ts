import { test, expect } from '@playwright/test';

test.describe('Playground Smoke Tests', () => {
  test('loads basic editor', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-gotipe-example="basic"]')).toBeVisible();
  });

  test('navigates between examples', async ({ page }) => {
    await page.goto('/');

    // Verify nav exists
    await expect(page.locator('[data-gotipe-nav="basic"]')).toBeVisible();
    await expect(page.locator('[data-gotipe-nav="basic"]')).toHaveClass(/active/);

    // Navigate to custom (no backend deps)
    await page.locator('[data-gotipe-nav="custom"]').click();
    await expect(page.locator('[data-gotipe-nav="custom"]')).toHaveClass(/active/);
    await expect(page.locator('[data-gotipe-example="custom"]')).toBeVisible();

    // Navigate back to basic
    await page.locator('[data-gotipe-nav="basic"]').click();
    await expect(page.locator('[data-gotipe-nav="basic"]')).toHaveClass(/active/);
    await expect(page.locator('[data-gotipe-example="basic"]')).toBeVisible();
  });

  test('custom extension renders', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-gotipe-nav="custom"]').click();
    await expect(page.locator('[data-gotipe-example="custom"]')).toBeVisible();
  });

  test('i18n locale switching', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-gotipe-nav="i18n"]').click();
    await expect(page.locator('[data-gotipe-example="i18n"]')).toBeVisible();

    // Switch to Russian
    await page.locator('[data-gotipe-locale="ru"]').click();
    await expect(page.locator('[data-gotipe-locale="ru"]')).toHaveClass(/active/);
  });
});
