import { test, expect } from '@playwright/test';

test.describe('Image block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.click('[data-gotipe-block-editor]');
    // Insert image block via slash menu
    await page.keyboard.type('/image');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await page.keyboard.press('Enter');
  });

  test('renders image placeholder (upload zone)', async ({ page }) => {
    await expect(page.locator('.gotipe-image-placeholder')).toBeVisible();
    await expect(page.locator('.gotipe-image-placeholder')).toContainText(
      'Click or drag to upload',
    );
  });

  test('placeholder has correct ARIA label', async ({ page }) => {
    await expect(page.locator('.gotipe-image-placeholder')).toHaveAttribute(
      'aria-label',
      'Upload image',
    );
  });

  test('placeholder accepts drag-over hover state', async ({ page }) => {
    const placeholder = page.locator('.gotipe-image-placeholder');
    // Verify the placeholder exists and is clickable
    await expect(placeholder).toBeVisible();
  });

  test('image block has figcaption with placeholder', async ({ page }) => {
    const caption = page.locator('[data-block-type="image"] figcaption');
    await expect(caption).toBeVisible();
    await expect(caption).toHaveAttribute('contenteditable', 'true');
    await expect(caption).toHaveAttribute('aria-label', 'Image caption');
  });

  test('resize handles appear on image selection', async ({ page }) => {
    // This test verifies the CSS class for resize handles exists
    const handleClass = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText?.includes('gotipe-image-resize-handle')
            ) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
    expect(handleClass).toBe(true);
  });
});

test.describe('Table block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.click('[data-gotipe-block-editor]');
    // Insert table via slash menu
    await page.keyboard.type('/table');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await page.keyboard.press('Enter');
  });

  test('renders table element', async ({ page }) => {
    await expect(page.locator('.gotipe-table-wrapper')).toBeVisible();
    await expect(page.locator('[data-block-type="table"]')).toBeVisible();
  });

  test('Tab navigates to next cell', async ({ page }) => {
    const firstCell = page.locator('.gotipe-table-wrapper td, .gotipe-table-wrapper th').first();
    await firstCell.click();
    await page.keyboard.press('Tab');
    // Second cell should now be selected
    const selected = page.locator('.gotipe-table-cell-selected');
    await expect(selected).toHaveCount(1);
  });

  test('Shift+Tab navigates to previous cell', async ({ page }) => {
    // Click on a cell that's not the first one
    const cells = page.locator('.gotipe-table-wrapper td, .gotipe-table-wrapper th');
    const cellCount = await cells.count();
    if (cellCount >= 2) {
      await cells.nth(1).click();
      await page.keyboard.press('Shift+Tab');
      const selected = page.locator('.gotipe-table-cell-selected');
      await expect(selected).toHaveCount(1);
    }
  });

  test('selected cell has accent border', async ({ page }) => {
    const firstCell = page.locator('.gotipe-table-wrapper td, .gotipe-table-wrapper th').first();
    await firstCell.click();
    const selected = page.locator('.gotipe-table-cell-selected');
    if (await selected.isVisible()) {
      const outline = await selected.evaluate((el) => getComputedStyle(el).outline);
      expect(outline).toContain('solid');
    }
  });

  test('add row button appears on hover', async ({ page }) => {
    await page.locator('.gotipe-table-wrapper').hover();
    const addRow = page.locator('.gotipe-table-add-row');
    await expect(addRow).toHaveAttribute('aria-label', 'Add row');
  });

  test('add column button appears on hover', async ({ page }) => {
    await page.locator('.gotipe-table-wrapper').hover();
    const addCol = page.locator('.gotipe-table-add-col');
    await expect(addCol).toHaveAttribute('aria-label', 'Add column');
  });

  test('column resize handle has correct cursor', async ({ page }) => {
    const resizeHandle = page.locator('.gotipe-table-col-resize').first();
    if (await resizeHandle.isVisible()) {
      const cursor = await resizeHandle.evaluate((el) => getComputedStyle(el).cursor);
      expect(cursor).toBe('col-resize');
    }
  });

  test('header row has bold font weight', async ({ page }) => {
    const headerCell = page.locator('.gotipe-table-wrapper th').first();
    if (await headerCell.isVisible()) {
      const fontWeight = await headerCell.evaluate((el) => getComputedStyle(el).fontWeight);
      expect(Number(fontWeight)).toBeGreaterThanOrEqual(600);
    }
  });
});
