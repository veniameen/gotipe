import { test, expect } from '@playwright/test';

test.describe('Editor basic operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
  });

  test('loads editor with empty document', async ({ page }) => {
    await expect(page.locator('[data-gotipe-block-editor]')).toBeVisible();
  });

  test('types text in editor', async ({ page }) => {
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('Hello GoTipe');
    await expect(page.locator('[data-gotipe-block-editor]')).toContainText('Hello GoTipe');
  });

  test('creates new paragraph on Enter', async ({ page }) => {
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('First paragraph');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second paragraph');
    await expect(page.locator('[data-gotipe-block-editor]')).toContainText('First paragraph');
    await expect(page.locator('[data-gotipe-block-editor]')).toContainText('Second paragraph');
  });

  test('creates heading via slash command', async ({ page }) => {
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('/heading');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await page.keyboard.press('Enter');
    await page.keyboard.type('My Heading');
    await expect(page.locator('h1')).toContainText('My Heading');
  });

  test('toggles bold with Cmd+B', async ({ page }) => {
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('Hello World');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.press('Meta+b');
    await expect(page.locator('strong')).toContainText('Hello World');
  });

  test('toggles italic with Cmd+I', async ({ page }) => {
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('Italic text');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.press('Meta+i');
    await expect(page.locator('em')).toContainText('Italic text');
  });

  test('undo/redo with Cmd+Z', async ({ page }) => {
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('First');
    await page.keyboard.press('Meta+z');
    await expect(page.locator('[data-gotipe-block-editor]')).not.toContainText('First');
    await page.keyboard.press('Meta+Shift+z');
    await expect(page.locator('[data-gotipe-block-editor]')).toContainText('First');
  });

  test('creates heading via input rule (# + space)', async ({ page }) => {
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('# ');
    await page.keyboard.type('Heading One');
    await expect(page.locator('h1')).toContainText('Heading One');
  });

  test('creates bullet list via input rule (- + space)', async ({ page }) => {
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('- ');
    await page.keyboard.type('List item');
    await expect(page.locator('li')).toContainText('List item');
  });
});
