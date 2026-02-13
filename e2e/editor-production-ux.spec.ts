import { expect, test, type Page } from '@playwright/test';

type TemplateConfig = {
  key: 'agent' | 'notion' | 'simple' | 'headless';
  title: string;
};

const TEMPLATES: TemplateConfig[] = [
  { key: 'agent', title: 'Agent Editor' },
  { key: 'notion', title: 'Notion-like Editor' },
  { key: 'simple', title: 'Simple Editor' },
  { key: 'headless', title: 'Headless Editor' },
];

async function openTemplate(page: Page, template: TemplateConfig) {
  await page.goto(`/#${template.key}`);
  await expect(page.locator(`[data-gotipe-nav="${template.key}"]`)).toHaveClass(/active/);
  await expect(page.locator('.gotipe-example-title')).toContainText(template.title);
  await expect(page.locator('[data-gotipe-content]').first()).toBeVisible();
}

async function setFirstParagraphRange(page: Page, startOffset: number, endOffset: number) {
  await page.evaluate(({ startOffset, endOffset }) => {
    const editor = document.querySelector('[data-gotipe-content]') as HTMLElement | null;
    const paragraph = editor?.querySelector('p');
    if (!editor || !paragraph) return;

    const totalText = paragraph.textContent ?? '';
    const clampedStart = Math.max(0, Math.min(startOffset, totalText.length));
    const clampedEnd = Math.max(0, Math.min(endOffset, totalText.length));

    const resolvePoint = (targetOffset: number) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let accumulated = 0;
      let node: Node | null;
      let lastText: Node | null = null;

      while ((node = walker.nextNode())) {
        lastText = node;
        const len = (node.textContent ?? '').length;
        if (accumulated + len >= targetOffset) {
          return { node, offset: Math.max(0, Math.min(targetOffset - accumulated, len)) };
        }
        accumulated += len;
      }

      if (lastText) {
        const lastLen = (lastText.textContent ?? '').length;
        return { node: lastText, offset: lastLen };
      }

      return { node: paragraph, offset: 0 };
    };

    const start = resolvePoint(clampedStart);
    const end = resolvePoint(clampedEnd);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  }, { startOffset, endOffset });
}

async function setCaretToEndOfFirstParagraph(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector('[data-gotipe-content]') as HTMLElement | null;
    const paragraph = editor?.querySelector('p');
    if (!editor || !paragraph) return;

    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let lastText: Node | null = null;
    let current: Node | null;
    while ((current = walker.nextNode())) {
      lastText = current;
    }

    const range = document.createRange();
    if (lastText) {
      const len = (lastText.textContent ?? '').length;
      range.setStart(lastText, len);
    } else {
      range.setStart(paragraph, paragraph.childNodes.length);
    }
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  });
}

test.describe('Production UX regressions', () => {
  for (const template of TEMPLATES) {
    test(`${template.title}: typing and paragraph split work`, async ({ page }) => {
      await openTemplate(page, template);

      const editor = page.locator('[data-gotipe-content]').first();
      const firstParagraph = editor.locator('p').first();
      const marker = `qa${template.key}mark`;
      const nextLine = `qa${template.key}line2`;

      await firstParagraph.click();
      await page.keyboard.press('End');
      await page.keyboard.type(` ${marker}`, { delay: 10 });
      await page.keyboard.press('Enter');
      await page.keyboard.type(nextLine, { delay: 10 });

      await expect(editor).toContainText(marker);
      await expect(editor).toContainText(nextLine);
    });
  }

  test('Simple and Agent toolbar clicks keep editor focus and selection context', async ({ page }) => {
    for (const key of ['simple', 'agent'] as const) {
      await openTemplate(page, {
        key,
        title: key === 'simple' ? 'Simple Editor' : 'Agent Editor',
      });
      await setFirstParagraphRange(page, 0, 8);

      const before = await page.evaluate(() => {
        const sel = window.getSelection();
        return {
          isCollapsed: sel?.isCollapsed ?? true,
          text: sel?.toString() ?? '',
        };
      });

      await page.locator('.gotipe-toolbar-btn[title^="Bold"]').first().click();
      await page.locator('.gotipe-toolbar-btn[title^="Italic"]').first().click();

      expect(before.isCollapsed).toBe(false);
      await expect.poll(async () => {
        const state = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          const sel = window.getSelection();
          const editorEl = document.querySelector('[data-gotipe-content]');
          const anchorNode = sel?.anchorNode ?? null;

          return {
            activeTag: active?.tagName ?? null,
            activeClass: active?.className ?? '',
            hasSelection: !!sel,
            isCollapsed: sel?.isCollapsed ?? true,
            selectionText: sel?.toString() ?? '',
            selectionInEditor: !!(editorEl && anchorNode && editorEl.contains(anchorNode)),
          };
        });

        return (
          state.hasSelection &&
          state.isCollapsed === false &&
          state.selectionText === before.text &&
          state.selectionInEditor &&
          state.activeTag !== 'BUTTON' &&
          state.activeClass.includes('gotipe-content')
        );
      }, { timeout: 1500 }).toBe(true);
    }
  });

  test('Headless controls do not steal focus from editable content', async ({ page }) => {
    await openTemplate(page, { key: 'headless', title: 'Headless Editor' });
    await setFirstParagraphRange(page, 0, 8);

    const before = await page.evaluate(() => {
      const sel = window.getSelection();
      return {
        isCollapsed: sel?.isCollapsed ?? true,
        text: sel?.toString() ?? '',
      };
    });

    await page.locator('.gotipe-headless-controls button', { hasText: 'Bold' }).click();

    expect(before.isCollapsed).toBe(false);
    await expect.poll(async () => {
      const state = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const sel = window.getSelection();
        return {
          activeTag: active?.tagName ?? null,
          activeClass: active?.className ?? '',
          isCollapsed: sel?.isCollapsed ?? true,
          selectionText: sel?.toString() ?? '',
        };
      });
      return (
        state.isCollapsed === false &&
        state.selectionText === before.text &&
        state.activeTag !== 'BUTTON' &&
        state.activeClass.includes('gotipe-content')
      );
    }, { timeout: 1500 }).toBe(true);
  });

  test('Enter creates an empty paragraph with visible line box immediately', async ({ page }) => {
    await openTemplate(page, { key: 'simple', title: 'Simple Editor' });

    await setCaretToEndOfFirstParagraph(page);
    await page.keyboard.press('Enter');

    const state = await page.evaluate(() => {
      const editor = document.querySelector('[data-gotipe-content]');
      if (!editor) return null;

      const paragraphs = Array.from(editor.querySelectorAll('p'));
      const emptyParagraph = paragraphs.find((p) => (p.textContent ?? '') === '');
      const emptyBlockId = emptyParagraph?.getAttribute('data-block-id') ?? null;
      const emptyHeight = emptyParagraph?.getBoundingClientRect().height ?? 0;
      return { emptyBlockId, emptyHeight };
    });

    expect(state).not.toBeNull();
    expect(state?.emptyBlockId).toBeTruthy();
    expect(state?.emptyHeight ?? 0).toBeGreaterThan(20);
  });

  test('Enter should move DOM caret to the newly created paragraph', async ({ page }) => {
    await openTemplate(page, { key: 'simple', title: 'Simple Editor' });

    await setCaretToEndOfFirstParagraph(page);
    await page.keyboard.press('Enter');

    await expect.poll(async () => {
      const state = await page.evaluate(() => {
        const editor = document.querySelector('[data-gotipe-content]');
        if (!editor) return null;

        const paragraphs = Array.from(editor.querySelectorAll('p'));
        const emptyParagraph = paragraphs.find((p) => (p.textContent ?? '') === '');
        const emptyBlockId = emptyParagraph?.getAttribute('data-block-id') ?? null;

        const sel = window.getSelection();
        const anchorEl =
          sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
        const anchorBlockId = anchorEl?.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null;

        return { emptyBlockId, anchorBlockId };
      });

      return !!state?.emptyBlockId && state.anchorBlockId === state.emptyBlockId;
    }, { timeout: 1500 }).toBe(true);
  });

  test('Shift+Enter inserts a soft line break instead of creating a new paragraph', async ({ page }) => {
    await openTemplate(page, { key: 'simple', title: 'Simple Editor' });

    const editor = page.locator('[data-gotipe-content]').first();
    const paragraphCountBefore = await editor.locator('p').count();

    await setCaretToEndOfFirstParagraph(page);
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');

    const state = await page.evaluate(() => {
      const editor = document.querySelector('[data-gotipe-content]');
      if (!editor) return null;

      const paragraphs = Array.from(editor.querySelectorAll('p'));
      const firstText = paragraphs[0]?.textContent ?? '';
      return {
        paragraphCount: paragraphs.length,
        firstText,
      };
    });

    expect(state).not.toBeNull();
    expect(state?.paragraphCount).toBe(paragraphCountBefore);
    expect(state?.firstText.includes('\n')).toBe(true);
  });

  test('Notion-like bubble menu keeps selection while toggling bold', async ({ page }) => {
    await openTemplate(page, { key: 'notion', title: 'Notion-like Editor' });
    await setFirstParagraphRange(page, 0, 8);

    const before = await page.evaluate(() => {
      const sel = window.getSelection();
      return {
        isCollapsed: sel?.isCollapsed ?? true,
        text: sel?.toString() ?? '',
      };
    });

    const bubbleMenu = page.locator('[data-gotipe-bubble-menu]');
    await expect(bubbleMenu).toBeVisible();
    await bubbleMenu.locator('button[data-mark="bold"]').click();
    await bubbleMenu.locator('button[data-mark="italic"]').click();

    const state = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const sel = window.getSelection();
      const editorEl = document.querySelector('[data-gotipe-content]');
      const anchorNode = sel?.anchorNode ?? null;
      return {
        activeTag: active?.tagName ?? null,
        isCollapsed: sel?.isCollapsed ?? true,
        selectionText: sel?.toString() ?? '',
        selectionInEditor: !!(editorEl && anchorNode && editorEl.contains(anchorNode)),
      };
    });

    expect(before.isCollapsed).toBe(false);
    expect(state.isCollapsed).toBe(false);
    expect(state.selectionText).toBe(before.text);
    expect(state.activeTag).not.toBe('BUTTON');
    expect(state.selectionInEditor).toBe(true);
  });

  test('Notion-like slash menu opens near "/" caret and keeps compact sizing', async ({ page }) => {
    await openTemplate(page, { key: 'notion', title: 'Notion-like Editor' });

    await setCaretToEndOfFirstParagraph(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');

    const slashMenu = page.locator('[data-gotipe-slash-menu]');
    await expect(slashMenu).toBeVisible();

    const state = await page.evaluate(() => {
      const menu = document.querySelector('[data-gotipe-slash-menu]') as HTMLElement | null;
      const content = document.querySelector('[data-gotipe-content]') as HTMLElement | null;
      if (!menu || !content) return null;

      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let slashNode: Node | null = null;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.textContent ?? '').startsWith('/')) {
          slashNode = node;
          break;
        }
      }
      if (!slashNode) return null;

      const slashRange = document.createRange();
      slashRange.setStart(slashNode, 0);
      slashRange.setEnd(slashNode, 1);
      const slashRect = slashRange.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();

      return {
        slashLeft: slashRect.left,
        slashTop: slashRect.top,
        slashBottom: slashRect.bottom,
        menuLeft: menuRect.left,
        menuTop: menuRect.top,
        menuWidth: menuRect.width,
        menuHeight: menuRect.height,
        viewportWidth: window.innerWidth,
        hasHorizontalOverflow: menu.scrollWidth > menu.clientWidth + 1,
      };
    });

    expect(state).not.toBeNull();
    expect(Math.abs((state?.menuLeft ?? 0) - (state?.slashLeft ?? 0))).toBeLessThan(64);
    const distanceToBelow = Math.abs((state?.menuTop ?? 0) - (state?.slashBottom ?? 0));
    const distanceToAbove = Math.abs(((state?.menuTop ?? 0) + (state?.menuHeight ?? 0)) - (state?.slashTop ?? 0));
    expect(Math.min(distanceToBelow, distanceToAbove)).toBeLessThan(96);
    const expectedMaxWidth = Math.min(300, (state?.viewportWidth ?? 0) * 0.9);
    expect(state?.menuWidth ?? 0).toBeLessThanOrEqual(expectedMaxWidth + 1);
    expect(state?.menuHeight ?? 0).toBeLessThanOrEqual(420);
    expect(state?.hasHorizontalOverflow).toBe(false);
  });

  test('Notion-like slash menu supports keyboard navigation and Escape', async ({ page }) => {
    await openTemplate(page, { key: 'notion', title: 'Notion-like Editor' });

    await setCaretToEndOfFirstParagraph(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');

    const slashMenu = page.locator('[data-gotipe-slash-menu]');
    await expect(slashMenu).toBeVisible();

    const firstSelected = await page.locator('.gotipe-slash-menu-item.selected .gotipe-slash-menu-item-title').first().textContent();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => {
      return (await page.locator('.gotipe-slash-menu-item.selected .gotipe-slash-menu-item-title').first().textContent()) ?? '';
    }, { timeout: 1000 }).not.toBe((firstSelected ?? '').trim());

    await page.keyboard.press('Escape');
    await expect(slashMenu).toBeHidden();
  });

  test('Notion-like slash menu executes selected command on Enter', async ({ page }) => {
    await openTemplate(page, { key: 'notion', title: 'Notion-like Editor' });

    await setCaretToEndOfFirstParagraph(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/h2');

    const slashMenu = page.locator('[data-gotipe-slash-menu]');
    await expect(slashMenu).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(slashMenu).toBeHidden();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = window.getSelection();
        const anchorEl =
          sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
        const blockEl = anchorEl?.closest('[data-block-id]');
        return blockEl?.tagName ?? '';
      });
    }, { timeout: 1200 }).toBe('H2');
  });
});
