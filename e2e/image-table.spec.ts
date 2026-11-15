import type { GoTipeEditor } from '@gotipe/core';
import { expect, test, type Page } from '@playwright/test';

declare global { interface Window { __GOTIPE_EDITOR__?: GoTipeEditor } }

async function seed(page: Page) {
  await page.goto('/?view=block#basic');
  await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#5d729a'; context.fillRect(0, 0, 400, 200);
    context.fillStyle = '#f6e5c1'; context.fillRect(80, 50, 160, 100);
    const src = canvas.toDataURL('image/png');
    window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [
      { id: 'before', type: 'paragraph', attrs: {}, content: [{ text: 'Before image', marks: [] }], children: [] },
      { id: 'picture', type: 'image', attrs: { src, alt: 'Original image', caption: 'Caption' }, content: null, children: [] },
      { id: 'empty-image', type: 'image', attrs: { src: '', alt: '' }, content: null, children: [] },
      { id: 'table', type: 'table', attrs: {}, content: null, children: [0, 1].map((row) => ({
        id: `row-${row}`, type: 'tableRow', attrs: {}, content: null, children: [0, 1].map((column) => ({
          id: `cell-${row}-${column}`, type: row === 0 ? 'tableHeader' : 'tableCell', attrs: {},
          content: [{ text: `${row}:${column}`, marks: [] }], children: [],
        })),
      })) },
      { id: 'after', type: 'paragraph', attrs: {}, content: [{ text: 'After image', marks: [] }], children: [] },
    ] });
    return src;
  });
}

async function imageAction(page: Page, name: string) {
  const image = page.locator('[data-block-id="picture"]');
  await image.hover();
  await image.getByRole('button', { name: 'More options', exact: true }).click();
  await image.getByRole('button', { name, exact: true }).click();
}

test.describe('Image interactions', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  test('caption typing keeps its caret and never edits the main document', async ({ page }) => {
    const caption = page.getByRole('textbox', { name: 'Image caption' });
    await caption.click();
    await caption.evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); range.collapse(false); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); });
    await page.keyboard.type(' abc'); await page.keyboard.insertText(' 😀'); await page.keyboard.type(' Z');
    await expect(caption).toHaveText('Caption abc 😀 Z');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks[1]!.attrs.caption)).toBe('Caption abc 😀 Z');
    await expect(page.locator('[data-block-id="before"]')).toHaveText('Before image');
    await expect(page.locator('[data-block-id="after"]')).toHaveText('After image');
  });

  test('uploads persist through JSON serialization and a fresh editor', async ({ page }) => {
    const image = page.locator('[data-block-id="empty-image"]');
    await image.getByRole('button', { name: 'Add an image' }).click();
    const chooser = page.waitForEvent('filechooser');
    await image.getByRole('button', { name: 'Upload image', exact: true }).click();
    await (await chooser).setFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    await expect(image.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    const saved = await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON());
    await page.reload(); await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate((document) => window.__GOTIPE_EDITOR__!.setContent(document), saved);
    await expect(page.locator('[data-block-id="empty-image"] img')).toHaveJSProperty('naturalWidth', 1);
  });

  test('description, crop, preview and undo are real operations', async ({ page }) => {
    await imageAction(page, 'Edit alternative text');
    await page.getByRole('dialog').getByLabel('Alternative text').fill('Описание 😀');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('[data-block-id="picture"] img')).toHaveAttribute('alt', 'Описание 😀');
    await imageAction(page, 'Crop image');
    await page.getByRole('dialog').getByLabel('Width (%)', { exact: true }).fill('50');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-block-id="picture"] img')).toHaveJSProperty('naturalWidth', 200);
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.undo());
    await expect(page.locator('[data-block-id="picture"] img')).toHaveJSProperty('naturalWidth', 400);
    await page.locator('[data-block-id="picture"]').hover();
    await page.getByRole('button', { name: 'Zoom', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Image preview' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('pointer resize stays within the container and is undoable', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    const picture = page.locator('[data-block-id="picture"]');
    await picture.hover();
    const handle = picture.getByRole('button', { name: 'Resize image from right' });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x - 100, box.y + box.height / 2, { steps: 10 }); await page.mouse.up();
    expect((await picture.locator('img').boundingBox())!.width).toBeLessThan(350);
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.undo());
    expect((await picture.locator('img').boundingBox())!.width).toBeCloseTo(400, 2);
    await page.setViewportSize({ width: 320, height: 720 });
    expect((await picture.locator('img').boundingBox())!.width).toBeLessThanOrEqual((await picture.boundingBox())!.width);
    await picture.hover(); await picture.getByRole('button', { name: 'More options', exact: true }).click();
    const menu = (await picture.locator('.gotipe-image-options-menu').boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.x + menu.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('read-only captions and controls cannot change the document', async ({ page }) => {
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setEditable(false));
    await expect(page.getByRole('textbox', { name: 'Image caption' })).toHaveAttribute('contenteditable', 'false');
    await expect(page.getByRole('button', { name: 'Add an image' })).toBeDisabled();
    await page.locator('[data-block-id="picture"]').hover();
    await expect(page.locator('[data-block-id="picture"] [data-gotipe-image-toolbar]')).toBeHidden();
  });
});

test.describe('Table interactions', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });
  test('Tab and Shift+Tab navigate actual cells and typing stays in the target', async ({ page }) => {
    await page.locator('[data-block-id="cell-0-0"]').click(); await page.keyboard.press('Tab');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getViewState().selection.anchor.blockId)).toBe('cell-0-1');
    await page.keyboard.insertText('Ж😀');
    await expect(page.locator('[data-block-id="cell-0-1"]')).toContainText('Ж😀');
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getViewState().selection.anchor.blockId)).toBe('cell-0-0');
  });
  test('Tab and Shift+Tab stay in their table at its edges (D-10)', async ({ page }) => {
    const before = await page.evaluate(() => {
      const table = (id: string) => ({
        id, type: 'table', attrs: {}, content: null, children: [0, 1].map((row) => ({
          id: `${id}-row-${row}`, type: 'tableRow', attrs: {}, content: null, children: [0, 1].map((column) => ({
            id: `${id}-${row}-${column}`, type: 'tableCell', attrs: {},
            content: [{ text: `${id} ${row}:${column}`, marks: [] }], children: [],
          })),
        })),
      });
      window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [table('first'), table('second')] });
      return window.__GOTIPE_EDITOR__!.getJSON();
    });
    const anchor = () => page.evaluate(() => window.__GOTIPE_EDITOR__!.getViewState().selection.anchor.blockId);
    // At the edge the key is not captured: the browser moves focus to the next control, the
    // table's own Add row button, and no cell of the other table takes the caret.
    const focusedCell = () => page.evaluate(() =>
      document.activeElement?.closest('td, th')?.getAttribute('data-block-id') ?? null);
    await page.locator('[data-block-id="first-1-0"]').click();
    await page.keyboard.press('Tab');
    expect(await anchor()).toBe('first-1-1');
    expect(await focusedCell()).toBe('first-1-1');
    await page.keyboard.press('Tab');
    expect(await anchor()).toBe('first-1-1');
    expect(await focusedCell()).toBeNull();
    await expect(page.getByRole('button', { name: 'Add row', exact: true }).first()).toBeFocused();
    await page.locator('[data-block-id="second-0-0"]').click();
    await page.keyboard.press('Shift+Tab');
    expect(await anchor()).toBe('second-0-0');
    expect(await focusedCell()).toBeNull();
    await page.locator('[data-block-id="second-0-0"]').click();
    await page.keyboard.press('Tab');
    expect(await anchor()).toBe('second-0-1');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON())).toEqual(before);
  });
  test('adding a row changes the document once and Undo restores it', async ({ page }) => {
    const table = page.locator('.gotipe-table-wrapper'); await table.hover();
    await table.getByRole('button', { name: 'Add row', exact: true }).click();
    await expect(table.locator('tr')).toHaveCount(3);
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.undo());
    await expect(table.locator('tr')).toHaveCount(2);
  });
});
