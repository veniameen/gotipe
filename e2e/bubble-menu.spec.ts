import { test, expect } from '@playwright/test';

test.describe('Bubble menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.click('[data-gotipe-block-editor]');
  });

  test('appears on text selection', async ({ page }) => {
    await page.keyboard.type('Hello World');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await expect(page.locator('[data-gotipe-bubble-menu]')).toBeVisible();
  });

  test('hides when selection is collapsed', async ({ page }) => {
    await page.keyboard.type('Some text');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.keyboard.press('ArrowRight'); // collapse selection
    await expect(page.locator('[data-gotipe-bubble-menu]')).not.toBeVisible();
  });

  test('formats text via Bold button', async ({ page }) => {
    await page.keyboard.type('Bold text');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('[data-gotipe-bubble-menu] [data-mark="bold"]');
    await expect(page.locator('strong')).toContainText('Bold text');
  });

  test('formats text via Italic button', async ({ page }) => {
    await page.keyboard.type('Italic text');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('[data-gotipe-bubble-menu] [data-mark="italic"]');
    await expect(page.locator('em')).toContainText('Italic text');
  });

  test('shows active state for applied marks', async ({ page }) => {
    await page.keyboard.type('Bold text');
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+b'); // Apply bold via keyboard
    // Re-select to show bubble menu
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    const boldBtn = page.locator('[data-gotipe-bubble-menu] [data-mark="bold"]');
    await expect(boldBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('changes block type via dropdown', async ({ page }) => {
    await page.keyboard.type('Heading text');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    // Open block type dropdown
    await page.click('.gotipe-block-type-trigger');
    await page.waitForSelector('[data-gotipe-block-type-dropdown]');
    // Select Heading 2
    await page.click('[data-block-type="heading"][data-level="2"]');
    await expect(page.locator('h2')).toContainText('Heading text');
  });

  test('block type dropdown closes on Escape', async ({ page }) => {
    await page.keyboard.type('Text');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('.gotipe-block-type-trigger');
    await page.waitForSelector('[data-gotipe-block-type-dropdown]');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-gotipe-block-type-dropdown]')).not.toBeVisible();
  });

  test('text color picker opens and shows swatches', async ({ page }) => {
    await page.keyboard.type('Colored text');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('[aria-label="Text color"]');
    await page.waitForSelector('[data-gotipe-color-picker]');
    // Should show 5 highlight color swatches
    const swatches = page.locator('.gotipe-text-color-swatch');
    expect(await swatches.count()).toBeGreaterThanOrEqual(5);
    // Should have a reset button
    await expect(page.locator('.gotipe-text-color-reset')).toBeVisible();
  });

  test('more menu opens with additional options', async ({ page }) => {
    await page.keyboard.type('More menu text');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('[aria-label="More formatting options"]');
    await page.waitForSelector('.gotipe-block-more-menu');
    await expect(page.locator('.gotipe-block-more-menu')).toContainText('Superscript');
    await expect(page.locator('.gotipe-block-more-menu')).toContainText('Clear Formatting');
    await expect(page.locator('.gotipe-block-more-menu')).toContainText('Copy as Markdown');
  });

  test('has correct ARIA attributes', async ({ page }) => {
    await page.keyboard.type('ARIA text');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await expect(page.locator('[data-gotipe-bubble-menu]')).toHaveAttribute('role', 'toolbar');
    await expect(page.locator('[data-gotipe-bubble-menu]')).toHaveAttribute(
      'aria-label',
      'Text formatting',
    );
    // Format buttons should have aria-pressed
    const boldBtn = page.locator('[data-mark="bold"]');
    await expect(boldBtn).toHaveAttribute('aria-pressed');
  });

  test('separator elements are visible between groups', async ({ page }) => {
    await page.keyboard.type('Separator test');
    await page.keyboard.press('Meta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    const separators = page.locator('.gotipe-bubble-menu-separator');
    expect(await separators.count()).toBeGreaterThanOrEqual(3);
  });
});
