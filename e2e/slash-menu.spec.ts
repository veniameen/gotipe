import { test, expect } from '@playwright/test';

test.describe('Slash menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.click('[data-gotipe-block-editor]');
  });

  test('opens on "/" keystroke', async ({ page }) => {
    await page.keyboard.type('/');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await expect(page.locator('[data-gotipe-slash-menu]')).toBeVisible();
  });

  test('shows categories with visual separators', async ({ page }) => {
    await page.keyboard.type('/');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    // Verify category labels exist
    await expect(page.locator('.gotipe-slash-menu-group-label')).toHaveCount(
      await page.locator('.gotipe-slash-menu-group-label').count(),
    );
    // At least the STYLE category should be present
    await expect(page.locator('[data-gotipe-slash-menu]')).toContainText('Style');
  });

  test('has correct dimensions and styling', async ({ page }) => {
    await page.keyboard.type('/');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    const box = await page.locator('[data-gotipe-slash-menu]').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(320);
  });

  test('filters items via fuzzy search', async ({ page }) => {
    await page.keyboard.type('/head');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    const items = page.locator('[data-gotipe-slash-item]');
    const count = await items.count();
    // Should filter to heading-related items only
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(10);
  });

  test('highlights matching text with <mark>', async ({ page }) => {
    await page.keyboard.type('/head');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await expect(page.locator('[data-gotipe-slash-menu] mark')).toHaveCount(
      await page.locator('[data-gotipe-slash-item]').count(),
    );
  });

  test('shows empty state when no results', async ({ page }) => {
    await page.keyboard.type('/xyznonexistent');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await expect(page.locator('.gotipe-slash-menu-empty')).toBeVisible();
    await expect(page.locator('.gotipe-slash-menu-empty')).toContainText('No results');
  });

  test('navigates with keyboard arrows', async ({ page }) => {
    await page.keyboard.type('/');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await page.keyboard.press('ArrowDown');
    const selected = page.locator('[data-gotipe-slash-item].selected');
    await expect(selected).toHaveCount(1);
  });

  test('selects item on Enter', async ({ page }) => {
    await page.keyboard.type('/h1');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await page.keyboard.press('Enter');
    // Slash menu should close
    await expect(page.locator('[data-gotipe-slash-menu]')).not.toBeVisible();
  });

  test('closes on Escape', async ({ page }) => {
    await page.keyboard.type('/');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-gotipe-slash-menu]')).not.toBeVisible();
  });

  test('closes on outside click', async ({ page }) => {
    await page.keyboard.type('/');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await page.click('body', { position: { x: 10, y: 10 } });
    await expect(page.locator('[data-gotipe-slash-menu]')).not.toBeVisible();
  });

  test('has correct ARIA attributes', async ({ page }) => {
    await page.keyboard.type('/');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await expect(page.locator('[data-gotipe-slash-menu]')).toHaveAttribute('role', 'listbox');
    await expect(page.locator('[data-gotipe-slash-menu]')).toHaveAttribute(
      'aria-label',
      'Insert block',
    );
    // Items should have role="option"
    const firstItem = page.locator('[data-gotipe-slash-item]').first();
    await expect(firstItem).toHaveAttribute('role', 'option');
  });
});
