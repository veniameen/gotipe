import { expect, type Page, test } from '@playwright/test';

// Mod+K (`openLinkDialog` of the core `Link` extension) opens one link field: the bubble's over
// the selection (GoTipe Atlas, frame 6), else the fixed toolbar's. With a caret alone, nothing.
const lineStart = process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home';

async function selectFromLineStart(page: Page, characters: number) {
  await page.keyboard.press(lineStart);
  for (let index = 0; index < characters; index++) await page.keyboard.press('Shift+ArrowRight');
}

/** The one link field on the page: Mod+K never opens two. */
async function linkField(page: Page) {
  const fields = page.locator('.gotipe-link-editor');
  await expect(fields).toHaveCount(1);
  const input = fields.locator('input');
  await expect(input).toBeFocused();
  return { field: fields, input };
}

test.describe('Mod+K opens the link field', () => {
  test('the bubble over the selection: the field links it; a caret alone opens nothing', async ({ page }) => {
    await page.goto('/?view=block#basic');
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() =>
      window.__GOTIPE_EDITOR__!.setContent({
        version: 1,
        blocks: [{ id: 'test-body', type: 'paragraph', attrs: {}, content: [], children: [] }],
      }),
    );
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.insertText('Linked 😀 in text');
    await selectFromLineStart(page, 6);
    await expect(page.locator('[data-gotipe-bubble-menu]')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+k');
    const { field, input } = await linkField(page);
    await expect(field).toHaveAttribute('role', 'dialog');
    await expect(page.locator('[data-gotipe-bubble-menu] .gotipe-link-editor')).toHaveCount(1);
    await input.fill('https://example.com/путь');
    await page.keyboard.press('Enter');
    const link = page.locator('[data-block-id="test-body"] a');
    await expect(link).toHaveText('Linked');
    await expect(link).toHaveAttribute('href', 'https://example.com/путь');

    // Escape gives the keys back to the text with the selection
    await selectFromLineStart(page, 6);
    await page.keyboard.press('ControlOrMeta+k');
    const again = await linkField(page);
    await expect(again.input).toHaveValue('https://example.com/путь');
    await page.keyboard.press('Escape');
    await expect(page.locator('.gotipe-link-editor')).toHaveCount(0);

    // a caret alone: no field, and the next key goes into the text
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.insertText('!');
    await expect(page.locator('.gotipe-link-editor')).toHaveCount(0);
    await expect(page.locator('[data-block-id="test-body"]')).toHaveText('Linked! 😀 in text');
  });

  test('with the fixed toolbar too, the bubble field opens and the toolbar field stays shut', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#views');
    await page.getByRole('button', { name: 'modern', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__GOTIPE_VIEWS_EDITOR__));
    await page.locator('[data-gotipe-content] p').first().click();
    await selectFromLineStart(page, 5);
    await expect(page.locator('[data-gotipe-bubble-menu]')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+k');
    await linkField(page);
    await expect(page.locator('[data-gotipe-bubble-menu] .gotipe-link-editor')).toHaveCount(1);
    await expect(page.locator('.gotipe-fixed-toolbar .gotipe-link-editor')).toHaveCount(0);
  });

  test('without a bubble, the fixed toolbar field opens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#simple');
    const tool = page.locator('.gotipe-fixed-toolbar-track [data-mark="link"]');
    await expect(tool).toBeVisible();
    await page.locator('[data-gotipe-content] h1').click();
    await selectFromLineStart(page, 7);

    await page.keyboard.press('ControlOrMeta+k');
    const { input } = await linkField(page);
    await expect(page.locator('.gotipe-fixed-toolbar .gotipe-link-editor')).toHaveCount(1);
    await expect(tool).toHaveAttribute('aria-expanded', 'true');
    await input.fill('https://example.com/start');
    await page.keyboard.press('Enter');
    const link = page.locator('[data-gotipe-content] h1 a');
    await expect(link).toHaveText('Getting');
    await expect(link).toHaveAttribute('href', 'https://example.com/start');
  });
});
