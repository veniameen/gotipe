import { test, expect } from '@playwright/test';

test.describe('Marks — text formatting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#basic');
    // Wait for the contenteditable editor to render
    await page.waitForSelector('[data-gotipe-content][contenteditable="true"]', { timeout: 10000 });
  });

  test('initial content renders with bold mark as <strong>', async ({ page }) => {
    const strong = page.locator('[data-gotipe-content] strong').first();
    await expect(strong).toContainText('block-first');
  });

  test('initial content renders with code mark as <code>', async ({ page }) => {
    const code = page.locator('[data-gotipe-content] code').first();
    await expect(code).toContainText('Rust/WASM');
  });

  test('initial content renders with italic mark as <em>', async ({ page }) => {
    const em = page.locator('[data-gotipe-content] em').first();
    await expect(em).toBeVisible();
  });

  test('addMark via editor API applies bold', async ({ page }) => {
    const editor = page.locator('[data-gotipe-content]');
    await editor.click();

    const result = await page.evaluate(() => {
      const ed = (window as any).__GOTIPE_EDITOR__;
      if (!ed) return { error: 'editor not found' };

      ed.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'b2',
          from: 0,
          to: 10,
          mark: { type: 'bold' },
        }],
      });

      const state = ed.getViewState();
      const b2 = state.blocks.find((b: any) => b.id === 'b2');
      return {
        spans: b2?.content?.map((s: any) => ({
          text: s.text,
          marks: s.marks.map((m: any) => m.type),
        })),
      };
    });

    expect(result).not.toHaveProperty('error');
    expect(result.spans[0].marks).toContain('bold');
    // "This is a " (0-10) + "block-first" (already bold) merge into one bold span
    expect(result.spans[0].text).toBe('This is a block-first');
  });

  test('addMark via editor API applies italic', async ({ page }) => {
    const editor = page.locator('[data-gotipe-content]');
    await editor.click();

    const result = await page.evaluate(() => {
      const ed = (window as any).__GOTIPE_EDITOR__;
      if (!ed) return { error: 'editor not found' };

      ed.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'b2',
          from: 0,
          to: 10,
          mark: { type: 'italic' },
        }],
      });

      const state = ed.getViewState();
      const b2 = state.blocks.find((b: any) => b.id === 'b2');
      return {
        firstSpanMarks: b2?.content?.[0]?.marks?.map((m: any) => m.type),
      };
    });

    expect(result.firstSpanMarks).toContain('italic');
  });

  test('addMark + removeMark works in sequence', async ({ page }) => {
    const editor = page.locator('[data-gotipe-content]');
    await editor.click();

    const result = await page.evaluate(() => {
      const ed = (window as any).__GOTIPE_EDITOR__;
      if (!ed) return { error: 'editor not found' };

      ed.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'b2',
          from: 0,
          to: 10,
          mark: { type: 'underline' },
        }],
      });

      let state = ed.getViewState();
      let b2 = state.blocks.find((b: any) => b.id === 'b2');
      const hasUnderline = b2?.content?.[0]?.marks?.some((m: any) => m.type === 'underline');

      ed.dispatch({
        steps: [{
          type: 'removeMark',
          blockId: 'b2',
          from: 0,
          to: 10,
          markType: 'underline',
        }],
      });

      state = ed.getViewState();
      b2 = state.blocks.find((b: any) => b.id === 'b2');
      const stillHasUnderline = b2?.content?.[0]?.marks?.some((m: any) => m.type === 'underline');

      return { hasUnderline, stillHasUnderline };
    });

    expect(result.hasUnderline).toBe(true);
    expect(result.stillHasUnderline).toBe(false);
  });

  test('multiple marks stack on same range', async ({ page }) => {
    const editor = page.locator('[data-gotipe-content]');
    await editor.click();

    const result = await page.evaluate(() => {
      const ed = (window as any).__GOTIPE_EDITOR__;
      if (!ed) return { error: 'editor not found' };

      ed.dispatch({
        steps: [
          { type: 'addMark', blockId: 'b2', from: 0, to: 5, mark: { type: 'bold' } },
          { type: 'addMark', blockId: 'b2', from: 0, to: 5, mark: { type: 'italic' } },
          { type: 'addMark', blockId: 'b2', from: 0, to: 5, mark: { type: 'underline' } },
        ],
      });

      const state = ed.getViewState();
      const b2 = state.blocks.find((b: any) => b.id === 'b2');
      const firstSpan = b2?.content?.[0];
      return {
        text: firstSpan?.text,
        markTypes: firstSpan?.marks?.map((m: any) => m.type)?.sort(),
      };
    });

    expect(result.text).toBe('This ');
    expect(result.markTypes).toEqual(['bold', 'italic', 'underline']);
  });

  test('stored marks toggle with collapsed selection', async ({ page }) => {
    const editor = page.locator('[data-gotipe-content]');
    await editor.click();

    const result = await page.evaluate(() => {
      const ed = (window as any).__GOTIPE_EDITOR__;
      if (!ed) return { error: 'editor not found' };

      ed.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'b2',
          from: 0,
          to: 0,
          mark: { type: 'bold' },
        }],
      });

      const state = ed.getViewState();
      const hasBold = state.toolbar.activeMarks.includes('bold');

      ed.dispatch({
        steps: [{
          type: 'removeMark',
          blockId: 'b2',
          from: 0,
          to: 0,
          markType: 'bold',
        }],
      });

      const state2 = ed.getViewState();
      const stillHasBold = state2.toolbar.activeMarks.includes('bold');

      return { hasBold, stillHasBold };
    });

    expect(result.hasBold).toBe(true);
    expect(result.stillHasBold).toBe(false);
  });

  test('all 9 mark types can be applied', async ({ page }) => {
    const editor = page.locator('[data-gotipe-content]');
    await editor.click();

    const result = await page.evaluate(() => {
      const ed = (window as any).__GOTIPE_EDITOR__;
      if (!ed) return { error: 'editor not found' };

      const markTypes = [
        { type: 'bold' },
        { type: 'italic' },
        { type: 'underline' },
        { type: 'strikethrough' },
        { type: 'code' },
        { type: 'highlight', attrs: { color: 'yellow' } },
        { type: 'link', attrs: { href: 'https://example.com', target: '_blank' } },
        { type: 'superscript' },
        { type: 'subscript' },
      ];

      const results: Record<string, boolean> = {};

      for (const mark of markTypes) {
        ed.dispatch({
          steps: [{
            type: 'addMark',
            blockId: 'b2',
            from: 0,
            to: 5,
            mark,
          }],
        });

        const state = ed.getViewState();
        const b2 = state.blocks.find((b: any) => b.id === 'b2');
        const firstSpan = b2?.content?.[0];
        results[mark.type] = firstSpan?.marks?.some((m: any) => m.type === mark.type) ?? false;

        ed.dispatch({
          steps: [{
            type: 'removeMark',
            blockId: 'b2',
            from: 0,
            to: 5,
            markType: mark.type,
          }],
        });
      }

      return results;
    });

    expect(result).not.toHaveProperty('error');
    expect(result.bold).toBe(true);
    expect(result.italic).toBe(true);
    expect(result.underline).toBe(true);
    expect(result.strikethrough).toBe(true);
    expect(result.code).toBe(true);
    expect(result.highlight).toBe(true);
    expect(result.link).toBe(true);
    expect(result.superscript).toBe(true);
    expect(result.subscript).toBe(true);
  });

  test('overlapping mark ranges create correct spans', async ({ page }) => {
    const editor = page.locator('[data-gotipe-content]');
    await editor.click();

    const result = await page.evaluate(() => {
      const ed = (window as any).__GOTIPE_EDITOR__;
      if (!ed) return { error: 'editor not found' };

      ed.setContent({
        version: 1,
        blocks: [{
          id: 'test1',
          type: 'paragraph',
          attrs: {},
          content: [{ text: 'Hello world', marks: [] }],
          children: [],
        }],
      });

      ed.dispatch({
        steps: [{ type: 'addMark', blockId: 'test1', from: 0, to: 7, mark: { type: 'bold' } }],
      });

      ed.dispatch({
        steps: [{ type: 'addMark', blockId: 'test1', from: 4, to: 11, mark: { type: 'italic' } }],
      });

      const state = ed.getViewState();
      const block = state.blocks.find((b: any) => b.id === 'test1');
      return {
        spans: block?.content?.map((s: any) => ({
          text: s.text,
          marks: s.marks.map((m: any) => m.type).sort(),
        })),
      };
    });

    expect(result).not.toHaveProperty('error');
    expect(result.spans).toHaveLength(3);
    expect(result.spans[0]).toEqual({ text: 'Hell', marks: ['bold'] });
    expect(result.spans[1]).toEqual({ text: 'o w', marks: ['bold', 'italic'] });
    expect(result.spans[2]).toEqual({ text: 'orld', marks: ['italic'] });
  });
});
