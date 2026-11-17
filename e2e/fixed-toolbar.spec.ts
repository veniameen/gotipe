import { expect, type Page, test } from '@playwright/test';

// The fixed toolbar of the view modern (GoTipe Atlas, frame 31) in the playground's views example.
async function openModern(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/#views');
  await page.getByRole('button', { name: 'modern', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
}

test.describe('Fixed toolbar (Atlas frame 31)', () => {
  test('a wide editor shows the whole bar and no “More”', async ({ page }) => {
    await openModern(page, 1440);
    const track = page.locator('.gotipe-fixed-toolbar-track');
    for (const unit of ['history', 'blockType', 'font', 'marks', 'align', 'insert', 'invisibles'])
      await expect(track.locator(`[data-gotipe-unit="${unit}"]`)).toBeVisible();
    await expect(page.locator('.gotipe-fixed-toolbar-more')).toHaveCount(0);
  });

  test('a phone sends what does not fit to “More”; the keys open and close it', async ({ page }) => {
    await openModern(page, 375);
    const track = page.locator('.gotipe-fixed-toolbar-track');
    // history, the block type, bold, italic and underline never leave; the font leaves first
    for (const unit of ['history', 'blockType', 'marks'])
      await expect(track.locator(`[data-gotipe-unit="${unit}"]`)).toBeVisible();
    await expect(track.locator('[data-gotipe-unit="font"]')).toHaveCount(0);
    // the bar fits its width: nothing is cut or scrolled away
    expect(await track.evaluate((line) => line.scrollWidth - line.clientWidth)).toBeLessThanOrEqual(1);

    const more = page.locator('.gotipe-fixed-toolbar-more');
    await more.focus();
    await page.keyboard.press('ArrowDown');
    const panel = page.locator('.gotipe-fixed-toolbar-panel');
    await expect(panel).toHaveAttribute('data-open', '');
    await expect(panel.locator('[data-gotipe-unit="font"]')).toBeVisible();
    await expect(panel.locator('[data-gotipe-unit="insert"]')).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    await expect(panel.locator('button').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(panel).not.toHaveAttribute('data-open', '');
    await expect(more).toBeFocused();
  });

  test('one Tab stop, the arrows move; an unavailable tool says why', async ({ page }) => {
    await openModern(page, 1024);
    const undo = page.locator('[data-history="undo"]');
    const redo = page.locator('[data-history="redo"]');
    await redo.hover();
    const tip = redo.locator('.gotipe-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Nothing to redo');
    await expect(redo).toHaveAttribute('aria-disabled', 'true');

    await undo.focus();
    await page.keyboard.press('ArrowRight');
    await expect(redo).toBeFocused();
    await page.keyboard.press('End');
    const track = page.locator('.gotipe-fixed-toolbar-track');
    const last = await track.evaluate((line) => {
      const controls = [...line.querySelectorAll<HTMLElement>('button, input')].filter(
        (control) => !control.closest('[data-gotipe-formatting-popup]'),
      );
      return {
        focused: controls.at(-1) === document.activeElement,
        stops: controls.filter((control) => control.tabIndex === 0).length,
      };
    });
    expect(last).toEqual({ focused: true, stops: 1 });
    await page.keyboard.press('Home');
    await expect(undo).toBeFocused();
  });

  test('a tool acts on the selection and leaves it in the text', async ({ page }) => {
    await openModern(page, 1024);
    await page.evaluate(() => {
      const editor = (window as unknown as Record<string, any>).__GOTIPE_VIEWS_EDITOR__;
      const blockId = editor.getViewState().blocks[0].id;
      editor.setSelection({ anchor: { blockId, offset: 0 }, head: { blockId, offset: 6 } });
      editor.focus();
    });
    const bold = page.locator('.gotipe-fixed-toolbar [data-mark="bold"]');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    const inText = await page.evaluate(() => {
      const selection = window.getSelection();
      const content = document.querySelector('[data-gotipe-content]');
      return !!(selection && !selection.isCollapsed && content?.contains(selection.anchorNode));
    });
    expect(inText).toBe(true);
  });
});
