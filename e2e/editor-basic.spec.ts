import type { GoTipeEditor } from '@gotipe/core';
import { test, expect } from '@playwright/test';

declare global { interface Window { __GOTIPE_EDITOR__?: GoTipeEditor } }

test.describe('Editor basic operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?view=block#basic');
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [{ id: 'body', type: 'paragraph', attrs: {}, content: [], children: [] }] }));
    await page.locator('[data-block-id="body"]').click();
  });
  test('types Unicode and creates separate paragraphs with Enter', async ({ page }) => {
    await page.keyboard.insertText('Первый 😀'); await page.keyboard.press('Enter');
    await page.keyboard.insertText('Второй');
    await expect(page.locator('[data-gotipe-content] > p')).toHaveText(['Первый 😀', 'Второй']);
  });
  test('creates a heading through the slash menu', async ({ page }) => {
    await page.keyboard.type('/heading');
    await expect(page.locator('[data-gotipe-slash-menu]')).toBeVisible();
    await page.keyboard.press('Enter'); await page.keyboard.type('My Heading');
    await expect(page.locator('[data-gotipe-content] h1')).toHaveText('My Heading');
  });
  for (const [key, tag] of [['b', 'strong'], ['i', 'em']] as const) {
    test(`formats selected text with ${key}`, async ({ page }) => {
      await page.keyboard.insertText('Hello World');
      await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press(`ControlOrMeta+${key}`);
      await expect(page.locator(`[data-gotipe-content] ${tag}`)).toHaveText('Hello World');
    });
  }
  test('undo and redo restore a complete committed input', async ({ page }) => {
    await page.keyboard.insertText('First😀'); await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-block-id="body"]')).toHaveText('');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(page.locator('[data-block-id="body"]')).toHaveText('First😀');
  });
  test('heading and list input rules transform the current block', async ({ page }) => {
    await page.keyboard.type('# Heading One');
    await expect(page.locator('[data-gotipe-content] h1')).toHaveText('Heading One');
    await page.keyboard.press('Enter'); await page.keyboard.type('- List item');
    await expect(page.locator('[data-gotipe-content] ul > li')).toHaveText('List item');
  });
  test('cut, paste and undo keep a selection spanning blocks atomic', async ({ page }) => {
    await page.keyboard.insertText('Alpha'); await page.keyboard.press('Enter'); await page.keyboard.insertText('Bravo');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+x');
    await expect(page.locator('[data-gotipe-content]')).not.toContainText('Alpha');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-gotipe-content] > p')).toHaveText(['Alpha', 'Bravo']);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('[data-gotipe-content]')).toContainText('Alpha');
    await expect.poll(() => page.evaluate(() => window.__GOTIPE_EDITOR__!.getText().match(/Alpha/g)?.length ?? 0)).toBe(2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-gotipe-content] > p')).toHaveText(['Alpha', 'Bravo']);
  });
});
