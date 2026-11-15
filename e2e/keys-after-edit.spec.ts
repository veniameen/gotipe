import type { Block, GoTipeEditor } from '@gotipe/core';
import { expect, test, type Page } from '@playwright/test';

declare global { interface Window { __GOTIPE_EDITOR__?: GoTipeEditor } }

// A key pressed right after an edit, before the next frame: the renderer has just rewritten the
// text node, and the key must act where the model caret is (docs/24, D-132). Nothing here waits
// for the caret between keys. Keys of the keyboard layout only, as in typing-history.spec.ts.

const item = (id: string, text: string): Block => ({
  id,
  type: 'listItem',
  attrs: {},
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});

async function open(page: Page, blocks: Block[], caret: string) {
  await page.goto('/?view=block#basic');
  await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
  await page.evaluate((value) => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: value }), blocks);
  await page.locator(`[data-block-id="${caret}"]`).click();
  await page.keyboard.press('End');
}

const blocks = (page: Page) => page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks);

test.describe('Keys right after an edit', () => {
  test('Backspace right after typing in a list item deletes a character, not the item', async ({ page }) => {
    await open(page, [{ id: 'list', type: 'bulletList', attrs: {}, content: null, children: [item('first', 'First'), item('item', '')] }], 'item');
    await page.keyboard.type('abcd');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.locator('[data-block-id="item"]')).toHaveText('ab');
    expect(await blocks(page)).toEqual([
      { id: 'list', type: 'bulletList', attrs: {}, content: null, children: [item('first', 'First'), item('item', 'ab')] },
    ]);
  });

  test('every Backspace right after a typed character deletes it', async ({ page }) => {
    await open(page, [{ id: 'list', type: 'bulletList', attrs: {}, content: null, children: [item('item', 'Item')] }], 'item');
    for (const char of 'abcdef') {
      await page.keyboard.type(char);
      await page.keyboard.press('Backspace');
    }
    await page.keyboard.type('s');
    await expect(page.locator('[data-block-id="item"]')).toHaveText('Items');
    expect(await blocks(page)).toEqual([
      { id: 'list', type: 'bulletList', attrs: {}, content: null, children: [item('item', 'Items')] },
    ]);
  });

  test('Backspace right after typing at the start of the document is not lost', async ({ page }) => {
    await open(page, [{ id: 'body', type: 'paragraph', attrs: {}, content: [], children: [] }], 'body');
    await page.keyboard.type('abcd');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.locator('[data-block-id="body"]')).toHaveText('ab');
  });
});
