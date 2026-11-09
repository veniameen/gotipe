import { expect, type Page, test } from '@playwright/test';

// The SpecOrbit-like wiki page (apps/playground/wiki.html, PageEditor on the JS engine).

const source = (page: Page) => page.locator('[data-gotipe-wiki-source]');

async function open(page: Page) {
  await page.goto('/wiki.html');
  await page.waitForSelector('[data-gotipe-example="wiki"] [data-gotipe-content]');
  await page.getByRole('button', { name: 'Markdown' }).click();
}

async function caretToEnd(page: Page, selector: string, nth = 0) {
  await page.locator(selector).nth(nth).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
}

test.describe('Wiki page (PageEditor)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('renders the Markdown file and keeps it byte-for-byte', async ({ page }) => {
    await expect(page.locator('.gotipe-page-title')).toHaveText('Выкат статусов задач');
    await expect(page.locator('.gotipe-page-callout-agent')).toContainText('Инструкции для агента');
    await expect(page.locator('[data-block-type="todoItem"]')).toHaveCount(3);
    await expect(page.locator('.gotipe-table th')).toHaveCount(3);
    await expect(page.locator('.gotipe-page-raw')).toHaveCount(3);
    await expect(page.locator('.so-source-head')).toContainText('без изменений');
    await expect(source(page)).toContainText('owner: m.lebedeva');
  });

  test('editing a paragraph changes only its line', async ({ page }) => {
    await caretToEnd(page, '.gotipe-callout-content', 1);
    await page.keyboard.type(' Без миграций данных.');
    await expect(page.locator('.so-source-head')).toContainText('строк изменено: 1');
    await expect(source(page)).toContainText(
      '> Колонка Legacy — статусы, которые остаются в `tasks.status` до релиза. Без миграций данных.',
    );
  });

  test('Cyrillic and IME input land in the document once', async ({ page }) => {
    await caretToEnd(page, '[data-block-type="todoItem"] [data-gotipe-todo-content]', 2);
    await page.keyboard.type(' — отдельно');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: 'かん', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: '漢' });
    await expect(page.locator('[data-block-type="todoItem"]').nth(2)).toHaveText('Индекс по status_id — отдельно漢');
    await expect(source(page)).toContainText('- [ ] Индекс по status_id — отдельно漢\n');
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
    await expect(source(page)).toContainText('# Выкат статусов задач\n\n## Цель\n\n> **Инструкции для агента:**');
  });

  test('the model turn: cursors, suggestions, accept all', async ({ page }) => {
    await page.getByRole('button', { name: 'Ход модели' }).click();
    await expect(page.locator('.gotipe-lane-chip').first()).toBeVisible();
    await expect(page.locator('.gotipe-sug-block-ins')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('.gotipe-sug-ins')).toHaveCount(5);
    await expect(page.locator('.gotipe-cmt')).toHaveCount(1);
    await expect(page.locator('.gotipe-review-bar')).toContainText('3 предложения');
    await page.locator('.gotipe-review-bar').getByRole('button', { name: 'Принять все' }).click();
    await expect(page.locator('.gotipe-sug-ins, .gotipe-sug-block-ins')).toHaveCount(0);
    const md = await source(page).innerText();
    expect(md).toContain('- [ ] Миграция 0042: справочник task_statuses и status_id\n');
    expect(md).toContain('- [ ] Индекс по status_id\n- [ ] Переключить listTasks на status_id\n- [ ] Через релиз — удалить tasks.status\n');
    expect(md).toContain('| `open` | 1 204 | нет |');
    expect(md).toContain('owner: m.lebedeva');
  });

  test('a suggestion card rejects one; typing over an anchor makes it stale', async ({ page }) => {
    await page.getByRole('button', { name: 'Ход модели' }).click();
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

  test('replies to a comment from the model', async ({ page }) => {
    await page.getByRole('button', { name: 'Ход модели' }).click();
    await expect(page.locator('.gotipe-cmt')).toHaveCount(1, { timeout: 5000 });
    await page.locator('.gotipe-cmt').click();
    const card = page.locator('[data-gotipe-review-card="comment"]');
    await expect(card).toContainText('CREATE INDEX CONCURRENTLY');
    await card.getByRole('textbox').fill('Да, поправь');
    await card.getByRole('button', { name: 'Отправить' }).click();
    await expect(card).toContainText('Да, поправь');
  });

  test('read-only mode ignores input', async ({ page }) => {
    await page.locator('[data-gotipe-wiki-readonly]').click();
    await expect(page.locator('[data-gotipe-content]')).toHaveAttribute('contenteditable', 'false');
    await page.locator('.gotipe-page-title').click();
    await page.keyboard.type('xyz');
    await expect(page.locator('.gotipe-page-title')).toHaveText('Выкат статусов задач');
    await expect(page.locator('[data-block-type="todoItem"] input').first()).toBeDisabled();
    await expect(page.locator('.so-source-head')).toContainText('без изменений');
  });

  test('column type «Код» writes backticks into the file', async ({ page }) => {
    const header = page.locator('.gotipe-table th').nth(2);
    await header.hover();
    await header.locator('.gotipe-col-btn').dispatchEvent('mousedown');
    const menu = page.locator('.gotipe-col-menu');
    await expect(menu).toContainText('Тип столбца');
    await menu.getByRole('menuitemradio', { name: 'Код' }).click();
    await expect(source(page)).toContainText('| `open` |  | `нет` |');
  });

  test('external replacement keeps focus, caret and scroll', async ({ page }) => {
    await caretToEnd(page, '[data-block-type="todoItem"] [data-gotipe-todo-content]', 1);
    const scroll = await page.locator('.so-page').evaluate((el) => el.scrollTop);
    await page.evaluate(() =>
      (window as unknown as { __gotipeWiki: { replaceOnDisk(a: string, b: string): void } }).__gotipeWiki.replaceOnDisk(
        'Снять дамп tasks на стенде',
        'Снять дамп tasks на стенде (готово 09.11)',
      ),
    );
    await expect(page.locator('[data-block-type="todoItem"]').first()).toContainText('(готово 09.11)');
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-gotipe-content'))).toBe(true);
    expect(await page.locator('.so-page').evaluate((el) => el.scrollTop)).toBe(scroll);
    await page.keyboard.type('!');
    await expect(page.locator('[data-block-type="todoItem"]').nth(1)).toHaveText('Миграция 0042: справочник и status_id!');
  });

  test('dark theme re-colours the page through tokens', async ({ page }) => {
    const bg = () => page.locator('.gotipe-page').evaluate((el) => getComputedStyle(el).backgroundColor);
    const light = await bg();
    await page.locator('[data-gotipe-wiki-theme]').click();
    await expect(page.locator('.so-root')).toHaveAttribute('data-theme', /dark|light/);
    const dark = await bg();
    expect(dark).not.toBe(light);
  });
});
