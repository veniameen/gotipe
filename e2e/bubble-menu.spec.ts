import { test, expect } from '@playwright/test';

test.describe('Bubble menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?view=block#basic');
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [{ id: 'test-body', type: 'paragraph', attrs: {}, content: [], children: [] }] }));
    await page.click('[data-gotipe-block-editor]');
  });

  test('appears on text selection', async ({ page }) => {
    await page.keyboard.type('Hello World');
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await expect(page.locator('[data-gotipe-bubble-menu]')).toBeVisible();
  });

  test('hides when selection is collapsed', async ({ page }) => {
    await page.keyboard.type('Some text');
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.keyboard.press('ArrowRight'); // collapse selection
    await expect(page.locator('[data-gotipe-bubble-menu]')).not.toBeVisible();
  });

  test('formats text via Bold button', async ({ page }) => {
    await page.keyboard.type('Bold text');
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('[data-gotipe-bubble-menu] [data-mark="bold"]');
    await expect(page.locator('strong')).toContainText('Bold text');
  });

  test('formats text via Italic button', async ({ page }) => {
    await page.keyboard.type('Italic text');
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('[data-gotipe-bubble-menu] [data-mark="italic"]');
    await expect(page.locator('em')).toContainText('Italic text');
  });

  test('shows active state for applied marks', async ({ page }) => {
    await page.keyboard.type('Bold text');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+b'); // Apply bold via keyboard
    // Re-select to show bubble menu
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    const boldBtn = page.locator('[data-gotipe-bubble-menu] [data-mark="bold"]');
    await expect(boldBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('changes block type via dropdown', async ({ page }) => {
    await page.keyboard.type('Heading text');
    await page.keyboard.press('ControlOrMeta+a');
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
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('.gotipe-block-type-trigger');
    await page.waitForSelector('[data-gotipe-block-type-dropdown]');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-gotipe-block-type-dropdown]')).not.toBeVisible();
  });

  test('text color picker opens and shows swatches', async ({ page }) => {
    await page.keyboard.type('Colored text');
    await page.keyboard.press('ControlOrMeta+a');
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
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    await page.click('[aria-label="More formatting options"]');
    await page.waitForSelector('.gotipe-block-more-menu');
    await expect(page.locator('.gotipe-block-more-menu')).toContainText('Superscript');
    await expect(page.locator('.gotipe-block-more-menu')).toContainText('Clear Formatting');
    await expect(page.locator('.gotipe-block-more-menu')).toContainText('Copy as Markdown');
  });

  test('has correct ARIA attributes', async ({ page }) => {
    await page.keyboard.type('ARIA text');
    await page.keyboard.press('ControlOrMeta+a');
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
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForSelector('[data-gotipe-bubble-menu]');
    const separators = page.locator('.gotipe-bubble-menu-separator');
    expect(await separators.count()).toBeGreaterThanOrEqual(3);
  });

  test('edits a safe link without losing the captured selection and undoes once', async ({ page }) => {
    await page.keyboard.insertText('До ссылка после');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
    for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowRight');
    for (let index = 0; index < 6; index++) await page.keyboard.press('Shift+ArrowRight');
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    const address = page.getByRole('textbox', { name: 'Link address' });
    await address.fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Apply link', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a web address');
    await expect(address).toBeFocused();
    await address.fill('https://example.com/путь');
    await page.getByRole('button', { name: 'Apply link', exact: true }).click();
    const link = page.locator('[data-block-id="test-body"] a');
    await expect(link).toHaveText('ссылка');
    await expect(link).toHaveAttribute('href', 'https://example.com/путь');
    await expect(page.locator('[data-block-id="test-body"]')).toHaveText('До ссылка после');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(link).toHaveCount(0);
    await expect(page.locator('[data-block-id="test-body"]')).toHaveText('До ссылка после');
  });

  test('applies independent text and highlight colors and resets them', async ({ page }) => {
    await page.keyboard.insertText('Цвет 😀');
    await page.keyboard.press('ControlOrMeta+a');
    await page.getByRole('button', { name: 'Text color', exact: true }).click();
    await page.getByRole('button', { name: 'Text color Blue', exact: true }).click();
    const paragraph = page.locator('[data-block-id="test-body"]');
    await expect(paragraph.locator('span[style]')).toHaveCSS('color', 'rgb(29, 78, 216)');
    await page.getByRole('button', { name: 'Text color', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Text color Blue', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Highlight Yellow', exact: true }).click();
    await expect(paragraph.locator('mark')).toHaveCSS('background-color', 'rgb(254, 249, 195)');
    await expect(paragraph.locator('span[style]')).toHaveCSS('color', 'rgb(29, 78, 216)');
    await page.getByRole('button', { name: 'Text color', exact: true }).click();
    await page.getByRole('button', { name: 'Reset color', exact: true }).click();
    await expect(paragraph.locator('mark, span[style]')).toHaveCount(0);
    await expect(paragraph).toHaveText('Цвет 😀');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(paragraph.locator('mark')).toHaveCSS('background-color', 'rgb(254, 249, 195)');
  });

  test('converts a selected middle list row while preserving its neighbors and nested rows', async ({ page }) => {
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [{
      id: 'list', type: 'bulletList', attrs: {}, content: null, children: [
        { id: 'first', type: 'listItem', attrs: {}, content: [{ text: 'First', marks: [] }], children: [] },
        { id: 'middle', type: 'listItem', attrs: {}, content: [{ text: 'Middle', marks: [] }], children: [
          { id: 'nested-list', type: 'bulletList', attrs: {}, content: null, children: [
            { id: 'nested', type: 'listItem', attrs: {}, content: [{ text: 'Nested', marks: [] }], children: [] },
          ] },
        ] },
        { id: 'last', type: 'listItem', attrs: {}, content: [{ text: 'Last', marks: [] }], children: [] },
      ],
    }] }));
    await page.locator('[data-block-id="middle"]').click({ position: { x: 24, y: 10 } });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowRight' : 'Shift+End');
    await page.getByRole('button', { name: 'Change block type' }).click();
    await page.getByRole('option', { name: 'Heading 2', exact: false }).click();
    await expect(page.locator('[data-block-id="middle"]')).toHaveAttribute('data-block-type', 'heading');
    await expect(page.locator('[data-block-id="middle"]')).toHaveText('Middle');
    await expect(page.locator('[data-block-id="nested"]')).toHaveText('Nested');
    await expect(page.locator('[data-block-id="first"]')).toHaveText('First');
    await expect(page.locator('[data-block-id="last"]')).toHaveText('Last');
    const rootTypes = await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks.map((block) => block.type));
    expect(rootTypes).toEqual(['bulletList', 'heading', 'bulletList', 'bulletList']);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks.length)).toBe(1);
  });

  test('copies only selected Markdown and surfaces clipboard failures', async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => { (window as Window & { copied?: string }).copied = text; },
      } });
    });
    await page.keyboard.insertText('Keep selected rest');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
    for (let index = 0; index < 5; index++) await page.keyboard.press('ArrowRight');
    for (let index = 0; index < 8; index++) await page.keyboard.press('Shift+ArrowRight');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await page.getByRole('button', { name: 'More formatting options' }).click();
    await page.getByRole('menuitem', { name: 'Copy as Markdown' }).click();
    expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toBe('**selected**');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async () => { throw new Error('Permission denied'); },
      } });
    });
    await page.getByRole('button', { name: 'More formatting options' }).click();
    await page.getByRole('menuitem', { name: 'Copy as Markdown' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not copy the selection: Permission denied');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'More formatting options' })).toBeFocused();
  });

  test('keeps floating controls inside narrow viewports and dismisses them in read-only mode', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.keyboard.insertText('Узкое меню 😀');
    await page.keyboard.press('ControlOrMeta+a');
    const menu = page.locator('[data-gotipe-bubble-menu]');
    await expect(menu).toBeVisible();
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit link' });
    await expect(dialog).toBeVisible();
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 720 });
      await expect.poll(async () => {
        const box = await dialog.boundingBox();
        return !!box && box.x >= 7 && box.y >= 7 && box.x + box.width <= width - 7 && box.y + box.height <= 713;
      }).toBe(true);
    }
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setEditable(false));
    await expect(menu).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
  });
});
