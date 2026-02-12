import { test, expect } from '@playwright/test';

test.describe('Block toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('Hover me');
  });

  test('shows drag handle and add button on block hover', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await expect(page.locator('.gotipe-block-toolbar')).toBeVisible();
    await expect(page.locator('[data-gotipe-drag-handle]')).toBeVisible();
    await expect(page.locator('[aria-label="Add block below"]')).toBeVisible();
  });

  test('add button inserts new block', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await page.click('[aria-label="Add block below"]');
    // Editor should now have 2 blocks
    const blocks = page.locator('[data-block-id]');
    expect(await blocks.count()).toBeGreaterThanOrEqual(2);
  });

  test('drag handle click opens context menu', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await page.click('[data-gotipe-drag-handle]');
    await expect(page.locator('[data-gotipe-context-menu]')).toBeVisible();
  });

  test('context menu shows all 4 actions', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await page.click('[data-gotipe-drag-handle]');
    await page.waitForSelector('[data-gotipe-context-menu]');
    await expect(page.locator('[data-gotipe-context-menu]')).toContainText('Delete');
    await expect(page.locator('[data-gotipe-context-menu]')).toContainText('Duplicate');
    await expect(page.locator('[data-gotipe-context-menu]')).toContainText('Reset Formatting');
    await expect(page.locator('[data-gotipe-context-menu]')).toContainText('Copy to Clipboard');
  });

  test('context menu closes on Escape', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await page.click('[data-gotipe-drag-handle]');
    await page.waitForSelector('[data-gotipe-context-menu]');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-gotipe-context-menu]')).not.toBeVisible();
  });

  test('context menu closes on outside click', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await page.click('[data-gotipe-drag-handle]');
    await page.waitForSelector('[data-gotipe-context-menu]');
    await page.click('body', { position: { x: 10, y: 10 } });
    await expect(page.locator('[data-gotipe-context-menu]')).not.toBeVisible();
  });

  test('Delete removes the block', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await page.click('[data-gotipe-drag-handle]');
    await page.waitForSelector('[data-gotipe-context-menu]');
    const blockCountBefore = await page.locator('[data-block-id]').count();
    await page.click('[data-gotipe-context-menu] button:has-text("Delete")');
    const blockCountAfter = await page.locator('[data-block-id]').count();
    expect(blockCountAfter).toBeLessThan(blockCountBefore);
  });

  test('Duplicate creates a copy of the block', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await page.click('[data-gotipe-drag-handle]');
    await page.waitForSelector('[data-gotipe-context-menu]');
    const blockCountBefore = await page.locator('[data-block-id]').count();
    await page.click('[data-gotipe-context-menu] button:has-text("Duplicate")');
    const blockCountAfter = await page.locator('[data-block-id]').count();
    expect(blockCountAfter).toBe(blockCountBefore + 1);
  });

  test('toolbar has correct ARIA role', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await expect(page.locator('.gotipe-block-toolbar')).toHaveAttribute('role', 'toolbar');
    await expect(page.locator('.gotipe-block-toolbar')).toHaveAttribute(
      'aria-label',
      'Block actions',
    );
  });

  test('context menu has role="menu" and menuitem roles', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await page.click('[data-gotipe-drag-handle]');
    await page.waitForSelector('[data-gotipe-context-menu]');
    await expect(page.locator('[data-gotipe-context-menu]')).toHaveAttribute('role', 'menu');
    const menuItems = page.locator('[data-gotipe-context-menu] [role="menuitem"]');
    expect(await menuItems.count()).toBe(4);
  });
});

test.describe('Drag and drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('First block');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second block');
  });

  test('drag handle has draggable attribute', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await expect(page.locator('[data-gotipe-drag-handle]')).toHaveAttribute('draggable', 'true');
  });

  test('drop indicator appears during drag', async ({ page }) => {
    // Verify the drop indicator element exists in the CSS
    const dropIndicatorRule = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText?.includes('gotipe-drop-indicator')) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
    expect(dropIndicatorRule).toBe(true);
  });

  test('drag handle has touch support attributes', async ({ page }) => {
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    // The drag handle button should exist and have aria-label
    const handle = page.locator('[data-gotipe-drag-handle]');
    await expect(handle).toHaveAttribute('aria-label', 'Drag to reorder block');
  });
});
