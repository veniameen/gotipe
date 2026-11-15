import type { GoTipeEditor } from "@gotipe/core";
import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __GOTIPE_EDITOR__?: GoTipeEditor;
  }
}

const BASE = "/?view=block#basic";

/** One empty paragraph, the caret in it, then the keys typed one by one. */
async function typeIntoEmptyParagraph(page: Page, keys: string) {
  await page.evaluate(() => {
    window.__GOTIPE_EDITOR__!.setContent({
      version: 1,
      blocks: [{ id: "target", type: "paragraph", attrs: {}, content: [], children: [] }],
    });
  });
  await page.locator('[data-block-id="target"]').click();
  await page.keyboard.type(keys, { delay: 50 });
}

test.describe("Phase 3.5-3.8 Block Types", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector("[data-gotipe-content]");
    // Wait for editor to be available
    await page.waitForFunction(() => (window as any).__GOTIPE_EDITOR__);
  });

  test("Todo list input rule: [] creates todoList", async ({ page }) => {
    // Create a new empty paragraph at the end and type [] + space
    const editor = await page.evaluateHandle(() => (window as any).__GOTIPE_EDITOR__);

    // Add an empty paragraph at the end
    await page.evaluate(() => {
      const editor = (window as any).__GOTIPE_EDITOR__;
      const state = editor.getViewState();
      const lastBlock = state.blocks[state.blocks.length - 1];
      const lastIndex = state.blocks.length;
      editor.dispatch({
        steps: [{
          type: "insertBlock",
          parentId: null,
          index: lastIndex,
          block: { id: crypto.randomUUID(), type: "paragraph", attrs: {}, content: [], children: [] },
        }],
      });
    });

    // Get the new paragraph and click on it
    const paragraphs = page.locator('[data-block-type="paragraph"]');
    const lastParagraph = paragraphs.last();
    await lastParagraph.click();

    // Type [] + space to trigger todo list input rule
    await page.keyboard.type("[] ", { delay: 50 });
    await page.waitForTimeout(300);

    // Verify todoList was created
    const todoList = page.locator('[data-block-type="todoList"]');
    const todoListCount = await todoList.count();
    expect(todoListCount).toBeGreaterThan(0);

    // Verify todoItem with checkbox exists
    const todoItem = page.locator('[data-block-type="todoItem"]');
    expect(await todoItem.count()).toBeGreaterThan(0);

    // Verify checkbox exists
    const checkbox = todoItem.last().locator('input[type="checkbox"]');
    expect(await checkbox.count()).toBe(1);
    expect(await checkbox.isChecked()).toBe(false);
  });

  test("Todo list input rule: [x] creates a checked task (D-11)", async ({ page }) => {
    await typeIntoEmptyParagraph(page, "[x] ");

    const item = page.locator('[data-block-id="target"]');
    await expect(item).toHaveAttribute("data-block-type", "todoItem");
    await expect(item.locator('input[type="checkbox"]')).toBeChecked();
    const blocks = await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks);
    expect(blocks[0]).toMatchObject({
      type: "todoList",
      children: [{ id: "target", type: "todoItem", attrs: { checked: true }, content: [] }],
    });
  });

  test("List input rules in an empty item of their own kind of list keep the list (D-127)", async ({ page }) => {
    const kinds = [
      ["bulletList", "listItem", "- "],
      ["orderedList", "listItem", "1. "],
      ["todoList", "todoItem", "[] "],
    ] as const;
    for (const [type, itemType, trigger] of kinds) {
      const attrs = itemType === "todoItem" ? { checked: false } : {};
      const list = {
        id: "list",
        type,
        attrs: type === "orderedList" ? { start: 1 } : {},
        content: null,
        children: [
          { id: "first", type: itemType, attrs, content: [{ text: "First", marks: [] }], children: [] },
          { id: "target", type: itemType, attrs, content: [], children: [] },
        ],
      };
      await page.evaluate((value) => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: [value] }), list);
      await page.locator('[data-block-id="target"]').click();
      await page.keyboard.type(trigger, { delay: 50 });
      await expect
        .poll(() => page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks))
        .toEqual([list]);
      await expect(page.locator('[data-block-id="target"]')).toHaveAttribute("data-block-type", itemType);
    }
  });

  test("Math input rule: $$ opens an empty formula without the trigger (D-11)", async ({ page }) => {
    await typeIntoEmptyParagraph(page, "$$");

    await expect(page.locator('[data-block-id="target"]')).toHaveAttribute("data-block-type", "math");
    const blocks = await page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks);
    expect(blocks[0]).toMatchObject({ id: "target", type: "math", content: "" });
  });

  test("Math: Enter adds a line to the formula, and Escape leaves it (D-11)", async ({ page }) => {
    const formula = { id: "formula", type: "math", attrs: { display: "block" }, content: "a+b", children: [] };
    const after = { id: "after", type: "paragraph", attrs: {}, content: [{ text: "After", marks: [] }], children: [] };
    const blocks = () => page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON().blocks);
    await page.evaluate((value) => window.__GOTIPE_EDITOR__!.setContent({ version: 1, blocks: value }), [formula, after]);
    // The source is centred, and End scrolls on macOS in Firefox and WebKit: click past its end.
    const source = page.locator('[data-block-id="formula"] pre');
    const box = (await source.boundingBox())!;
    await source.click({ position: { x: box.width - 4, y: box.height / 2 } });
    await expect
      .poll(() => page.evaluate(() => window.__GOTIPE_EDITOR__!.getViewState().selection.anchor))
      .toEqual({ blockId: "formula", offset: 3 });

    await page.keyboard.press("Enter");
    await page.keyboard.type("c", { delay: 50 });
    await expect.poll(blocks).toEqual([{ ...formula, content: "a+b\nc" }, after]);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("d", { delay: 50 });
    await expect.poll(blocks).toEqual([{ ...formula, content: "a+b\nc\nd" }, after]);

    await page.keyboard.press("Escape");
    await page.keyboard.type("x", { delay: 50 });
    await expect
      .poll(blocks)
      .toMatchObject([
        { ...formula, content: "a+b\nc\nd" },
        { type: "paragraph", content: [{ text: "x", marks: [] }] },
        after,
      ]);
    expect(await blocks()).toHaveLength(3);
  });

  test("Todo list checkbox toggles checked state", async ({ page }) => {
    // Create a todoList programmatically
    await page.evaluate(() => {
      const editor = (window as any).__GOTIPE_EDITOR__;
      const state = editor.getViewState();
      const lastIndex = state.blocks.length;
      const todoItemId = crypto.randomUUID();
      editor.dispatch({
        steps: [{
          type: "insertBlock",
          parentId: null,
          index: lastIndex,
          block: {
            id: crypto.randomUUID(),
            type: "todoList",
            attrs: {},
            content: null,
            children: [{
              id: todoItemId,
              type: "todoItem",
              attrs: { checked: false },
              content: [{ text: "Test todo", marks: [] }],
              children: [],
            }],
          },
        }],
      });
    });

    await page.waitForTimeout(200);

    // Find the checkbox and click it
    const checkbox = page.locator('[data-block-type="todoItem"] input[type="checkbox"]').last();
    await expect(checkbox).toBeVisible();
    expect(await checkbox.isChecked()).toBe(false);

    // Click the checkbox
    await checkbox.click({ force: true });
    await page.waitForTimeout(200);

    // Verify checked state changed
    expect(await checkbox.isChecked()).toBe(true);
  });

  test("Code block input rule: ```js creates codeBlock", async ({ page }) => {
    // Add empty paragraph at the end
    await page.evaluate(() => {
      const editor = (window as any).__GOTIPE_EDITOR__;
      const state = editor.getViewState();
      const lastIndex = state.blocks.length;
      editor.dispatch({
        steps: [{
          type: "insertBlock",
          parentId: null,
          index: lastIndex,
          block: { id: crypto.randomUUID(), type: "paragraph", attrs: {}, content: [], children: [] },
        }],
      });
    });

    // Click the new paragraph
    const paragraphs = page.locator('[data-block-type="paragraph"]');
    const lastParagraph = paragraphs.last();
    await lastParagraph.click();

    // Type ```js + space to trigger code block input rule
    await page.keyboard.type("```js ", { delay: 50 });
    await page.waitForTimeout(300);

    // Verify codeBlock was created
    const codeBlock = page.locator('[data-block-type="codeBlock"]');
    const codeBlockCount = await codeBlock.count();
    expect(codeBlockCount).toBeGreaterThan(0);

    // Verify trigger text is cleared (code block should be empty or have no trigger text)
    const codeBlockContent = await page.evaluate(() => {
      const editor = (window as any).__GOTIPE_EDITOR__;
      const state = editor.getViewState();
      const codeBlocks = state.blocks.filter((b: any) => b.type === "codeBlock");
      const lastCodeBlock = codeBlocks[codeBlocks.length - 1];
      return lastCodeBlock?.content;
    });
    // Content should be empty string (Raw type) after trigger text was deleted
    expect(codeBlockContent === "" || codeBlockContent === null || (Array.isArray(codeBlockContent) && codeBlockContent.length === 0)).toBeTruthy();
  });

  test("Blockquote input rule: > creates blockquote", async ({ page }) => {
    // Add empty paragraph at the end
    await page.evaluate(() => {
      const editor = (window as any).__GOTIPE_EDITOR__;
      const state = editor.getViewState();
      const lastIndex = state.blocks.length;
      editor.dispatch({
        steps: [{
          type: "insertBlock",
          parentId: null,
          index: lastIndex,
          block: { id: crypto.randomUUID(), type: "paragraph", attrs: {}, content: [], children: [] },
        }],
      });
    });

    // Click the new paragraph
    const paragraphs = page.locator('[data-block-type="paragraph"]');
    const lastParagraph = paragraphs.last();
    await lastParagraph.click();

    // Type > + space to trigger blockquote input rule
    await page.keyboard.type("> ", { delay: 50 });
    await page.waitForTimeout(300);

    // Verify blockquote was created
    const blockquote = page.locator('[data-block-type="blockquote"]');
    expect(await blockquote.count()).toBeGreaterThan(0);

    // Verify trigger text is cleared
    const bqContent = await page.evaluate(() => {
      const editor = (window as any).__GOTIPE_EDITOR__;
      const state = editor.getViewState();
      const bqs = state.blocks.filter((b: any) => b.type === "blockquote");
      const lastBq = bqs[bqs.length - 1];
      if (!lastBq) return null;
      if (Array.isArray(lastBq.content)) {
        return lastBq.content.map((s: any) => s.text).join("");
      }
      return lastBq.content;
    });
    expect(bqContent === "" || bqContent === null).toBeTruthy();
  });

  test("Divider input rule: --- creates divider", async ({ page }) => {
    // Add empty paragraph at the end
    await page.evaluate(() => {
      const editor = (window as any).__GOTIPE_EDITOR__;
      const state = editor.getViewState();
      const lastIndex = state.blocks.length;
      editor.dispatch({
        steps: [{
          type: "insertBlock",
          parentId: null,
          index: lastIndex,
          block: { id: crypto.randomUUID(), type: "paragraph", attrs: {}, content: [], children: [] },
        }],
      });
    });

    // Click the new paragraph
    const paragraphs = page.locator('[data-block-type="paragraph"]');
    const lastParagraph = paragraphs.last();
    await lastParagraph.click();

    // Count dividers before
    const dividersBefore = await page.locator('[data-block-type="divider"]').count();

    // Type --- to trigger divider input rule
    await page.keyboard.type("---", { delay: 50 });
    await page.waitForTimeout(300);

    // Verify a new divider was created
    const dividersAfter = await page.locator('[data-block-type="divider"]').count();
    expect(dividersAfter).toBeGreaterThan(dividersBefore);

    // Verify the paragraph with "---" text was removed (replaced by divider + empty paragraph)
    const state = await page.evaluate(() => {
      const editor = (window as any).__GOTIPE_EDITOR__;
      return editor.getViewState();
    });

    // No block should contain "---" as text content
    const hasTrigerText = (state as any).blocks.some((b: any) => {
      if (Array.isArray(b.content)) {
        return b.content.map((s: any) => s.text).join("") === "---";
      }
      return false;
    });
    expect(hasTrigerText).toBe(false);
  });

  test("Existing code block is rendered with pre>code", async ({ page }) => {
    // The basic example has a code block (b7)
    const codeBlock = page.locator('[data-block-type="codeBlock"]');
    expect(await codeBlock.count()).toBeGreaterThan(0);

    // Controls are outside the text host; code retains semantic pre/code structure.
    const code = codeBlock.first().locator('pre > code[data-gotipe-text-content]');
    await expect(code).toBeVisible();
    const raw = await codeBlock.first().evaluate((element) => {
      const editor = window.__GOTIPE_EDITOR__!;
      return editor.getJSON().blocks.find((block) => block.id === element.getAttribute('data-block-id'))!.content;
    });
    expect(typeof raw).toBe('string');
    expect(await code.textContent()).toBe(raw);
  });

  test("Existing blockquote is rendered as <blockquote>", async ({ page }) => {
    // The basic example has a blockquote (b8)
    const blockquote = page.locator('blockquote[data-block-type="blockquote"]');
    expect(await blockquote.count()).toBeGreaterThan(0);
  });

  test("Existing divider is rendered as <hr>", async ({ page }) => {
    // The basic example has a divider (b6)
    const divider = page.locator('hr[data-block-type="divider"]');
    expect(await divider.count()).toBeGreaterThan(0);
  });
});
