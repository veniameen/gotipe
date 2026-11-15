import { test, expect } from '@playwright/test';

test.describe('Code block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?view=block#basic');
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [{ id: 'code-body', type: 'paragraph', attrs: {}, content: [], children: [] }] }));
    await page.locator('[data-block-id="code-body"]').click();
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-block-type="codeBlock"]')).toBeVisible();
  });
  test('edits Unicode and newlines as raw code, with atomic undo', async ({ page }) => {
    await page.keyboard.insertText('const привет = "😀";');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('return привет;');
    await expect(page.locator('.gotipe-code-block code')).toHaveText('const привет = "😀";\nreturn привет;');
    await expect(page.locator('.gotipe-code-block-line-numbers')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks[0]!.content)).toBe('const привет = "😀";\nreturn привет;');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.gotipe-code-block code')).toHaveText('const привет = "😀";\n');
  });
  test('language changes persist and can be undone without touching code', async ({ page }) => {
    await page.keyboard.insertText('let answer = 42;');
    const select = page.getByRole('combobox', { name: 'Programming language' });
    await select.selectOption('typescript');
    await expect(select).toHaveValue('typescript');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks[0]!.attrs.language)).toBe('typescript');
    await page.locator('.gotipe-code-block code').click();
    await page.keyboard.press('ControlOrMeta+z');
    // Plain text is the empty language (D-14): the menu's option for it has the value "".
    await expect(select).toHaveValue('');
    expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks[0]!.attrs.language)).toBe('');
    await expect(page.locator('.gotipe-code-block code')).toHaveText('let answer = 42;');
  });
  test('copy writes the raw source without language labels or line numbers', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.keyboard.insertText('one\ntwo 😀');
    await page.getByRole('button', { name: 'Copy code', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toBeVisible();
    await page.evaluate(() => { const editor = window.__GOTIPE_EDITOR__!; editor.dispatch({ steps: [{ type: 'insertBlock', parentId: null, index: 1, block: { id: 'paste-target', type: 'paragraph', attrs: {}, content: [], children: [] } }] }); });
    await page.locator('[data-block-id="paste-target"]').click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => page.evaluate(() => window.__GOTIPE_EDITOR__!.getText())).toBe('one\ntwo 😀\none\ntwo 😀');
    // Clipboard feedback resets through its owned timer.
    await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toBeVisible({ timeout: 4000 });
  });
  test('long code scrolls inside the block at 320px and its controls fit', async ({ page }) => {
    await page.keyboard.insertText('x'.repeat(200));
    await page.setViewportSize({ width: 320, height: 720 });
    const dimensions = await page.locator('.gotipe-code-block pre').evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth, right: element.getBoundingClientRect().right }));
    expect(dimensions.scroll).toBeGreaterThan(dimensions.width);
    expect(dimensions.right).toBeLessThanOrEqual(320);
    for (const control of await page.locator('.gotipe-code-block-header button, .gotipe-code-block-header select').all()) {
      const bounds = await control.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test('read-only keeps code selectable and disables language editing', async ({ page }) => {
    await page.keyboard.insertText('immutable 😀');
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setEditable(false));
    await expect(page.getByRole('combobox', { name: 'Programming language' })).toBeDisabled();
    await page.locator('.gotipe-code-block code').click();
    await page.keyboard.insertText('changed');
    await expect(page.locator('.gotipe-code-block code')).toHaveText('immutable 😀');
    await expect(page.getByRole('button', { name: 'Copy code' })).toBeEnabled();
  });
});

test('slash characters inside raw code stay literal', async ({ page }) => {
  await page.goto('/?view=block#basic');
  await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
  await page.evaluate(() => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [
    { id: 'raw-slash', type: 'codeBlock', attrs: {}, content: '', children: [] },
  ] }));
  await page.locator('[data-block-id="raw-slash"] pre').click();
  await page.keyboard.type('/heading // comment');
  await expect(page.locator('[data-gotipe-slash-menu]')).toHaveCount(0);
  await expect(page.locator('[data-block-id="raw-slash"] code')).toHaveText('/heading // comment');
});

test('code token colors follow the nearest theme through nested and inherited scopes', async ({ page }) => {
  await page.goto('/?view=block#basic');
  await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
  for (const themes of [
    ['dark', 'light', 'dark', 'light'],
    ['light', 'dark', 'light', 'dark'],
    ['dark', null, 'light', null],
  ]) {
    const colors = await page.evaluate((scopes) => {
      const host = document.createElement('div');
      document.body.append(host);
      let parent = host;
      const tokens: HTMLElement[] = [];
      for (const theme of scopes) {
        const scope = document.createElement('div');
        if (theme) scope.dataset.theme = theme;
        const token = document.createElement('span');
        token.className = 'gotipe-code-token';
        token.style.setProperty('--gt-code-token', '#ff0000');
        token.style.setProperty('--gt-code-token-dark', '#0000ff');
        token.textContent = 'const привет = "😀";';
        scope.append(token);
        parent.append(scope);
        parent = scope;
        tokens.push(token);
      }
      const result = tokens.map((token) => ({ color: getComputedStyle(token).color, scheme: getComputedStyle(token).colorScheme }));
      host.remove();
      return result;
    }, themes);
    let inherited = 'light';
    themes.forEach((theme, index) => {
      inherited = theme ?? inherited;
      expect(colors[index]).toEqual({
        color: inherited === 'dark' ? 'rgb(0, 0, 255)' : 'rgb(255, 0, 0)',
        scheme: inherited,
      });
    });
  }
});
