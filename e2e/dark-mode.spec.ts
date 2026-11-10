import { expect, test } from '@playwright/test';

test.describe('Theme behavior', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/?view=block#basic'); await page.locator('[data-gotipe-content]').waitFor(); });
  test('all theme controls agree and editor colors switch together', async ({ page }) => {
    await page.getByRole('radio', { name: 'Light theme' }).first().click();
    const light = await page.locator('[data-gotipe-block-editor]').evaluate((element) => ({ background: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(element).color }));
    await page.getByRole('radio', { name: 'Dark theme' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    for (const button of await page.getByRole('radio', { name: 'Dark theme' }).all()) await expect(button).toHaveAttribute('aria-checked', 'true');
    const dark = await page.locator('[data-gotipe-block-editor]').evaluate((element) => ({ background: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(element).color }));
    expect(dark.background).not.toBe(light.background); expect(dark.color).not.toBe(light.color);
  });
  test('system theme follows media changes and explicit mode stops following', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' }); await page.getByRole('radio', { name: 'System theme' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('radio', { name: 'Dark theme' }).first().click();
    await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
  test('PageEditor responds to the theme controls', async ({ page }) => {
    await page.goto('/?view=page#basic');
    const pageRoot = page.locator('[data-gotipe-page]');
    await expect(pageRoot).toBeVisible();
    await page.getByRole('banner').getByRole('radio', { name: 'Light theme' }).click();
    const before = await pageRoot.evaluate((element) => getComputedStyle(element).color);
    await page.getByRole('banner').getByRole('radio', { name: 'Dark theme' }).click();
    await expect.poll(() => pageRoot.evaluate((element) => getComputedStyle(element).color)).not.toBe(before);
  });
});

test('PageEditor shares the playground theme and follows system changes on first load', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?view=page#basic');
  const editor = page.locator('[data-gotipe-page]');
  await expect(editor).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const light = await editor.evaluate((element) => getComputedStyle(element).color);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => editor.evaluate((element) => getComputedStyle(element).color)).not.toBe(light);
  await page.getByRole('banner').getByRole('radio', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => editor.evaluate((element) => getComputedStyle(element).color)).toBe(light);
  await page.getByRole('banner').getByRole('radio', { name: 'Dark theme' }).click();
  await expect(page.getByRole('banner').getByRole('radio', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'true');
});

test('theme radios use one tab stop and support arrow keys', async ({ page }) => {
  await page.goto('/?view=block#basic');
  const group = page.getByRole('banner').getByRole('radiogroup', { name: 'Theme' });
  const light = group.getByRole('radio', { name: 'Light theme' });
  const dark = group.getByRole('radio', { name: 'Dark theme' });
  await light.click();
  await expect(light).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('ArrowRight');
  await expect(dark).toBeFocused();
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await expect(light).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(group.getByRole('radio', { name: 'System theme' })).toBeFocused();
});
