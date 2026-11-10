import { expect, type Page, test } from '@playwright/test';

import { PAGE_MARKDOWN } from '../apps/playground/src/examples/page-editor-sample';

// The generic public PageEditor showcase in the existing Basic example.

const source = (page: Page) => page.locator('[data-gotipe-page-source]');

async function open(page: Page) {
  await page.goto('/?view=page#basic');
  await page.waitForSelector('[data-gotipe-example="page"] [data-gotipe-content]');
  await page.getByRole('button', { name: 'Markdown' }).click();
}

async function caretToEnd(page: Page, selector: string, nth = 0) {
  await page.locator(selector).nth(nth).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
}

test.describe('PageEditor showcase', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('Basic defaults to Page and switches between public editor components', async ({ page }) => {
    await page.goto('/#basic');
    const view = page.getByLabel('Editor view');
    await expect(view).toHaveValue('page');
    await expect(page.locator('[data-gotipe-page]')).toBeVisible();
    await view.selectOption('block');
    await expect(page).toHaveURL(/\?view=block#basic$/);
    await expect(page.locator('[data-gotipe-block-editor]')).toBeVisible();
    await expect(page.locator('[data-gotipe-page]')).toHaveCount(0);
    await view.selectOption('page');
    await expect(page).toHaveURL(/\?view=page#basic$/);
    await expect(page.locator('[data-gotipe-page]')).toBeVisible();
    await expect(page.locator('[data-gotipe-block-editor]')).toHaveCount(0);
  });

  test('host errors expose recoverable composition text without editing the document', async ({ page }) => {
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() => {
      const failure = Object.assign(new Error('The composition target changed.'), {
        name: 'GoTipeError', code: 'COMPOSITION_CONFLICT' as const,
        details: { text: 'Ж😀漢', reason: 'target-removed' },
      });
      window.__GOTIPE_EDITOR__!.reportError(failure);
    });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The composition target changed.');
    const recovery = alert.getByRole('textbox', { name: 'Recovery text' });
    await expect(recovery).toHaveValue('Ж😀漢');
    await expect(recovery).toHaveAttribute('readonly', '');
    expect(await source(page).textContent()).toBe(PAGE_MARKDOWN);
    await alert.getByRole('button', { name: 'Dismiss error' }).click();
    await expect(alert).toHaveCount(0);
    expect(await source(page).textContent()).toBe(PAGE_MARKDOWN);
  });

  test('renders the Markdown file and keeps it byte-for-byte', async ({ page }) => {
    await expect(page.locator('.gotipe-page-title')).toHaveText('Документ редактора');
    await expect(page.locator('.gotipe-page-callout-agent')).toContainText('Инструкции для агента');
    await expect(page.locator('[data-block-type="todoItem"]')).toHaveCount(3);
    await expect(page.locator('.gotipe-table th')).toHaveCount(3);
    await expect(page.locator('.gotipe-page-raw')).toHaveCount(3);
    expect(await source(page).textContent()).toBe(PAGE_MARKDOWN);
  });

  test('editing a paragraph changes only its line', async ({ page }) => {
    await caretToEnd(page, '.gotipe-callout-content', 1);
    await page.keyboard.type(' Новый текст.');
    await expect.poll(() => source(page).textContent()).toBe(PAGE_MARKDOWN.replace(
      '> Текст с `кодом` сохраняет форматирование.',
      '> Текст с `кодом` сохраняет форматирование. Новый текст.',
    ));
  });

  test('Unicode input lands once, with native IME composition in Chromium', async ({ page, browserName }) => {
    await caretToEnd(page, '[data-block-type="todoItem"] [data-gotipe-todo-content]', 2);
    await page.keyboard.type(' — отдельно');
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      try {
        await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
        await cdp.send('Input.imeSetComposition', { text: 'かん', selectionStart: 2, selectionEnd: 2 });
        await cdp.send('Input.insertText', { text: '漢' });
      } finally { await cdp.detach(); }
    } else {
      // This exercises native Unicode insertion, not an OS IME automation claim.
      await page.keyboard.insertText('漢');
    }
    await expect(page.locator('[data-block-type="todoItem"]').nth(2)).toHaveText('Проверить таблицу — отдельно漢');
    await expect(source(page)).toContainText('- [ ] Проверить таблицу — отдельно漢\n');
  });

  test('«/» opens the v6 blocks menu and inserts a heading', async ({ page }) => {
    await caretToEnd(page, '.gotipe-page-title');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const menu = page.locator('[data-gotipe-slash-menu]');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Медиа');
    await expect(menu).toContainText('Основные');
    await page.keyboard.type('h2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Цель');
    await expect(source(page)).toContainText('# Документ редактора\n\n## Цель\n\n> **Инструкции для агента:**');
  });

  test('demo review shows cursors and accepts all suggestions', async ({ page }) => {
    await page.getByRole('button', { name: 'Demo suggestions' }).click();
    await expect(page.locator('.gotipe-lane-chip').first()).toBeVisible();
    await expect(page.locator('.gotipe-sug-block-ins')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('.gotipe-sug-ins')).toHaveCount(5);
    await expect(page.locator('.gotipe-cmt')).toHaveCount(1);
    await expect(page.locator('.gotipe-review-bar')).toContainText('3 предложения');
    await page.locator('.gotipe-review-bar').getByRole('button', { name: 'Принять все' }).click();
    await expect(page.locator('.gotipe-sug-ins, .gotipe-sug-block-ins')).toHaveCount(0);
    const md = await source(page).innerText();
    expect(md).toContain('- [ ] Проверить форматирование и ссылки\n');
    expect(md).toContain('- [ ] Проверить таблицу\n- [ ] Проверить ссылки\n- [ ] Проверить экспорт\n');
    expect(md).toContain('| `alpha` | 3 | нет |');
    expect(md).toContain('title: editor-example');
  });

  test('a suggestion card rejects one; typing over an anchor makes it stale', async ({ page }) => {
    await page.getByRole('button', { name: 'Demo suggestions' }).click();
    await expect(page.locator('.gotipe-sug-ins')).toHaveCount(5, { timeout: 5000 });
    await page.locator('.gotipe-sug-ins').first().click();
    const card = page.locator('[data-gotipe-review-card="proposal"]');
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Отклонить' }).click();
    await expect(page.locator('.gotipe-sug-ins')).toHaveCount(4);
    await caretToEnd(page, '[data-block-type="todoItem"] [data-gotipe-todo-content]', 2);
    await page.keyboard.type('!');
    await expect(page.locator('.gotipe-review-bar')).toContainText('1 устарело');
  });

  test('replies to a demo review comment', async ({ page }) => {
    await page.getByRole('button', { name: 'Demo suggestions' }).click();
    await expect(page.locator('.gotipe-cmt')).toHaveCount(1, { timeout: 5000 });
    await page.locator('.gotipe-cmt').click();
    const card = page.locator('[data-gotipe-review-card="comment"]');
    await expect(card).toContainText('Убедитесь, что все ячейки заполнены.');
    await card.getByRole('textbox').fill('Да, поправь');
    await card.getByRole('button', { name: 'Отправить' }).click();
    await expect(card).toContainText('Да, поправь');
  });

  test('read-only mode ignores input', async ({ page }) => {
    await page.locator('[data-gotipe-page-readonly]').click();
    await expect(page.locator('[data-gotipe-content]')).toHaveAttribute('contenteditable', 'false');
    await page.locator('.gotipe-page-title').click();
    await page.keyboard.type('xyz');
    await expect(page.locator('.gotipe-page-title')).toHaveText('Документ редактора');
    await expect(page.locator('[data-block-type="todoItem"] input').first()).toBeDisabled();
    expect(await source(page).textContent()).toBe(PAGE_MARKDOWN);
  });

  test('column type «Код» writes backticks into the file', async ({ page }) => {
    const header = page.locator('.gotipe-table th').nth(2);
    await header.hover();
    await header.locator('.gotipe-col-btn').click();
    const menu = page.locator('.gotipe-col-menu');
    await expect(menu).toContainText('Тип столбца');
    await menu.getByRole('menuitemradio', { name: 'Код' }).click();
    await expect(source(page)).toContainText('| `alpha` |  | `нет` |');
  });

  test('external replacement keeps focus, caret and scroll', async ({ page }) => {
    await caretToEnd(page, '[data-block-type="todoItem"] [data-gotipe-todo-content]', 1);
    const scroll = await page.locator('.gotipe-page-example-surface').evaluate((el) => el.scrollTop);
    await page.evaluate(() =>
      window.__GOTIPE_PAGE_EXAMPLE__!.replaceMarkdown(
        'Проверить текст',
        'Проверить текст (обновлено)',
      ),
    );
    await expect(page.locator('[data-block-type="todoItem"]').first()).toContainText('(обновлено)');
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-gotipe-content'))).toBe(true);
    expect(await page.locator('.gotipe-page-example-surface').evaluate((el) => el.scrollTop)).toBe(scroll);
    await page.keyboard.type('!');
    await expect(page.locator('[data-block-type="todoItem"]').nth(1)).toHaveText('Проверить форматирование!');
  });

  test('dark theme re-colours the page through tokens', async ({ page }) => {
    const bg = () => page.locator('.gotipe-page').evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByRole('banner').getByRole('radio', { name: 'Light theme' }).click();
    const light = await bg();
    await page.getByRole('banner').getByRole('radio', { name: 'Dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await bg();
    expect(dark).not.toBe(light);
  });

  test('the page link editor validates URLs and returns focus for continued typing', async ({ page }) => {
    const heading = page.locator('.gotipe-page-title');
    const original = await heading.innerText();
    await caretToEnd(page, '.gotipe-page-title');
    for (let index = 0; index < 5; index++) await page.keyboard.press('Shift+ArrowLeft');
    await page.getByRole('button', { name: 'Ссылка', exact: true }).click();
    const address = page.getByRole('textbox', { name: 'Ссылка', exact: true });
    await address.fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Ссылка', exact: true }).click();
    await expect(address).toHaveAttribute('aria-invalid', 'true');
    await expect(heading.locator('a')).toHaveCount(0);
    await address.fill('https://example.com/путь');
    await page.getByRole('button', { name: 'Ссылка', exact: true }).click();
    await expect(heading.locator('a')).toHaveText(original.slice(-5));
    await expect(page.getByRole('textbox', { name: 'Страница', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Ссылка', exact: true }).click();
    await expect(address).toHaveValue('https://example.com/путь');
    await page.keyboard.press('Escape');
    await page.keyboard.type('X');
    await expect(heading).toHaveText(original.slice(0, -5) + 'X');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(heading).toHaveText(original);
  });

  test('the floating page toolbar follows viewport, container, scrolling, and theme', async ({ page }) => {
    await caretToEnd(page, '.gotipe-page-title');
    for (let index = 0; index < 5; index++) await page.keyboard.press('Shift+ArrowLeft');
    const menu = page.locator('.gotipe-page-bubble');
    await expect(menu).toBeVisible();
    for (const icon of await menu.locator('button svg').all()) {
      const bounds = await icon.boundingBox();
      const control = await icon.locator('..').boundingBox();
      expect(bounds!.width).toBeGreaterThan(0);
      expect(bounds!.height).toBeGreaterThan(0);
      expect(bounds!.width).toBeLessThanOrEqual(control!.width);
      expect(bounds!.height).toBeLessThanOrEqual(control!.height);
    }
    await page.locator('.gotipe-page').evaluate((node) => node.style.setProperty('--gt-icon-size', '20px'));
    await expect(menu.locator('button svg').first()).toHaveCSS('width', '20px');
    await page.locator('.gotipe-page').evaluate((node) => node.style.removeProperty('--gt-icon-size'));
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 780 });
      await expect.poll(async () => {
        const box = await menu.boundingBox();
        return !!box && box.x >= 7 && box.x + box.width <= width - 7 && box.y >= 7 && box.y + box.height <= 773;
      }).toBe(true);
    }
    await page.getByRole('banner').getByRole('radio', { name: 'Light theme' }).click();
    const background = await menu.evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.getByRole('banner').getByRole('radio', { name: 'Dark theme' }).click();
    await expect.poll(() => menu.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(background);
    await page.locator('.gotipe-page').evaluate((node) => { node.style.width = '360px'; node.style.marginLeft = '60px'; });
    await expect.poll(async () => {
      const box = await menu.boundingBox();
      const selection = await page.evaluate(() => window.getSelection()!.getRangeAt(0).getBoundingClientRect().toJSON());
      return !!box && Math.abs(box.x + box.width / 2 - (selection.x + selection.width / 2)) < 2;
    }).toBe(true);
    await page.locator('.gotipe-page-example-surface').evaluate((node) => { node.scrollTop = 160; });
    await expect.poll(async () => (await menu.boundingBox())?.y).toBeGreaterThanOrEqual(7);
    await page.getByRole('button', { name: 'Ссылка', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Ссылка', exact: true })).toBeFocused();
    await page.locator('[data-gotipe-page-readonly]').click();
    await expect(menu).toHaveCount(0);
  });
});
