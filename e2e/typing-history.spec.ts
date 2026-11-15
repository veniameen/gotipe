import type { GoTipeEditor } from '@gotipe/core';
import { expect, test } from '@playwright/test';

declare global { interface Window { __GOTIPE_EDITOR__?: GoTipeEditor } }

// Date.now() stands still, so how fast keys arrive on a loaded machine does not matter;
// a pause is a jump of the clock past the typing step's 500 ms (core/src/editor/typing-group.ts).
const START = new Date('2026-11-15T12:00:00Z').getTime();

// Keys of the keyboard layout only: Playwright's Firefox types other characters as IME
// compositions, and a composition is an undo step of its own. Unit tests cover Unicode.

test.describe('Undo after typing', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(START);
    await page.goto('/?view=block#basic');
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [{ id: 'body', type: 'paragraph', attrs: {}, content: [], children: [] }] }));
    await page.locator('[data-block-id="body"]').click();
  });

  test('undoes text typed key by key in one step and redoes it', async ({ page }) => {
    const body = page.locator('[data-block-id="body"]');
    await page.keyboard.type('Hello, typed world');
    await expect(body).toHaveText('Hello, typed world');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body).toHaveText('');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(body).toHaveText('Hello, typed world');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body).toHaveText('');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getViewState().toolbar.canUndo)).toBe(false);
  });

  test('a pause starts a new step', async ({ page }) => {
    const body = page.locator('[data-block-id="body"]');
    await page.keyboard.type('one');
    await page.clock.setFixedTime(START + 1000);
    await page.keyboard.type(' two');
    await expect(body).toHaveText('one two');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body).toHaveText('one');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body).toHaveText('');
  });

  test('moving the caret starts a new step', async ({ page }) => {
    const body = page.locator('[data-block-id="body"]');
    await page.keyboard.type('abc');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('X');
    await expect(body).toHaveText('aXbc');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body).toHaveText('abc');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body).toHaveText('');
  });

  test('Backspace after typing is a step of its own', async ({ page }) => {
    const body = page.locator('[data-block-id="body"]');
    await page.keyboard.type('abcd');
    // No waiting for the caret: keys right after an edit act at the model caret (D-132).
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(body).toHaveText('ab');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body).toHaveText('abcd');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body).toHaveText('');
  });
});
