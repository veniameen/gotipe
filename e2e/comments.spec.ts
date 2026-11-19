import { expect, type Page, test } from '@playwright/test';

async function selectQuote(page: Page, crossBlock = false) {
  return page.locator('[data-gotipe-example="comments"] [data-gotipe-content]').evaluate((root, cross) => {
    const paragraphs = root.querySelectorAll('[data-block-type="paragraph"]');
    const first = paragraphs[0]!;
    const last = cross ? paragraphs[1]! : first;
    const start = document.createTreeWalker(first, NodeFilter.SHOW_TEXT).nextNode()!;
    const end = document.createTreeWalker(last, NodeFilter.SHOW_TEXT).nextNode()!;
    (root as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(start, cross ? 7 : 0);
    range.setEnd(end, cross ? 18 : 15);
    const selection = window.getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return selection.toString();
  }, crossBlock);
}
async function comment(page: Page, body = 'Needs details 😀', cross = false) {
  const quote = await selectQuote(page, cross);
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'New comment' })).toBeFocused();
  await page.getByRole('textbox', { name: 'New comment' }).fill(body);
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  const thread = page.locator('.gotipe-comment-thread').filter({ hasText: body });
  await expect(thread).toBeVisible();
  return { thread, quote };
}

test.describe('Owned comment discussion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#comments');
    await expect(page.getByRole('button', { name: 'Add comment', exact: true })).toBeEnabled();
  });
  test('creates a cross-block quote, replies, resolves, reopens, persists and deletes', async ({ page }) => {
    const { thread } = await comment(page, 'Check both paragraphs 😀', true);
    await expect(thread.locator('.gotipe-comment-quote')).toContainText('a phrase to start');
    await expect(thread.locator('.gotipe-comment-quote')).toContainText('Reply with details');
    // One discussion for the quote; its highlight marks the text in both paragraphs.
    await expect(page.locator('.gotipe-comment-thread[data-comment-id]')).toHaveCount(1);
    const highlight = `.gotipe-comment-highlight[data-comment-id="${await thread.getAttribute('data-comment-id')}"]`;
    const paragraphs = page.locator('[data-gotipe-example="comments"] [data-block-type="paragraph"]');
    await expect(paragraphs.nth(0).locator(highlight)).not.toHaveCount(0);
    await expect(paragraphs.nth(1).locator(highlight)).not.toHaveCount(0);
    await thread.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(thread.getByRole('textbox', { name: 'Reply', exact: true })).toBeFocused();
    await thread.getByRole('textbox', { name: 'Reply', exact: true }).fill('Added 🦀');
    await thread.getByRole('button', { name: 'Send reply', exact: true }).click();
    await expect(thread.locator('.gotipe-comment-replies')).toHaveText(/Added 🦀/);
    await thread.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect(page.getByText('No open comments', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resolved (1)', exact: true }).click();
    await page.getByRole('button', { name: 'Unresolve', exact: true }).click();
    await page.getByRole('button', { name: 'Open (1)', exact: true }).click();
    await expect(thread).toBeVisible();
    await page.reload();
    const restored = page.locator('.gotipe-comment-thread');
    await expect(restored).toContainText('Check both paragraphs 😀');
    await expect(restored).toContainText('Added 🦀');
    await restored.getByRole('button', { name: 'Scroll to comment', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain('Reply with details');
    await restored.getByRole('button', { name: 'Delete comment', exact: true }).click();
    await expect(page.getByText('No open comments', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('No open comments', { exact: true })).toBeVisible();
  });
  test('tracks quote movement, signals removed text and restores the anchor with undo', async ({ page }) => {
    const { thread } = await comment(page);
    const paragraph = page.locator('[data-gotipe-example="comments"] [data-block-type="paragraph"]').first();
    // Into the quote, then to the line start: the quote's line starts the paragraph. The centre of
    // the wrapped paragraph lies on its line boundary, and browsers put a click there on different
    // lines. On macOS Home leaves the caret where it is in Firefox and WebKit.
    await paragraph.locator('.gotipe-comment-highlight').first().click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
    await page.keyboard.insertText('Префикс 😀 ');
    await expect(paragraph).toHaveText(/^Префикс 😀 Select a phrase/);
    await thread.getByRole('button', { name: 'Scroll to comment', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Select a phrase');
    await page.keyboard.press('Backspace');
    await expect(thread).toContainText('The quoted text has changed or was removed.');
    await expect(thread.getByRole('button', { name: 'Scroll to comment', exact: true })).toBeDisabled();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(thread.getByRole('button', { name: 'Scroll to comment', exact: true })).toBeEnabled();
    await thread.getByRole('button', { name: 'Scroll to comment', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Select a phrase');
  });
  test('keeps the document read-only while discussion actions remain available', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Read-only document' }).check();
    const root = page.locator('[data-gotipe-example="comments"] [data-gotipe-content]');
    await expect(root).toHaveAttribute('contenteditable', 'false');
    const before = await root.textContent();
    const { thread } = await comment(page, 'A comment on protected text');
    await thread.getByRole('button', { name: 'Reply', exact: true }).click();
    await thread.getByRole('textbox', { name: 'Reply', exact: true }).fill('A reply that leaves the document alone');
    await thread.getByRole('button', { name: 'Send reply', exact: true }).click();
    await expect(root).toHaveText(before!);
  });
  test('keeps long discussions inside light and dark responsive containers', async ({ page }) => {
    await comment(page, 'A long comment 😀 '.repeat(14));
    for (const theme of ['light', 'dark']) {
      await page.getByRole('banner').getByRole('radio', { name: theme === 'dark' ? 'Dark theme' : 'Light theme', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(page.locator('.gotipe-comment-sidebar')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const sidebar = await page.locator('.gotipe-comment-sidebar').boundingBox();
        expect(sidebar!.x).toBeGreaterThanOrEqual(0);
        expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(width + 1);
      }
    }
  });
});
