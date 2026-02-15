import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent } from "./helpers/notion-checklist";

type Mark = { type: string; attrs?: Record<string, unknown> };
type Span = { text: string; marks?: Mark[] };

function spans(text: string): Span[] {
  return [{ text, marks: [] }];
}

async function setSelection(page: Page, blockId: string, offset: number): Promise<void> {
  await page.evaluate(({ blockId, offset }) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          setSelection?: (selection: {
            anchor: { blockId: string; offset: number };
            head: { blockId: string; offset: number };
          }) => void;
          focus?: () => void;
        }
      | undefined;
    editor?.setSelection?.({
      anchor: { blockId, offset },
      head: { blockId, offset },
    });
    editor?.focus?.();
  }, { blockId, offset });
}

async function openSlashMenu(page: Page, query: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  for (const typed of [`/${query}`, ` /${query}`]) {
    await page.keyboard.type(typed, { delay: 6 });
    try {
      await expect(menu).toBeVisible({ timeout: 900 });
      return;
    } catch {
      for (let i = 0; i < typed.length; i++) await page.keyboard.press("Backspace");
    }
  }
  await page.keyboard.type(` /${query}`, { delay: 6 });
  await expect(menu).toBeVisible();
}

async function runSlash(page: Page, query: string, commandName: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await openSlashMenu(page, query);
  const item = menu.locator(".gotipe-slash-menu-item-title", { hasText: commandName }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).toBeHidden();
}

async function getLeafByMarker(page: Page, marker: string): Promise<{ blockId: string; blockType: string | null; parentType: string | null; text: string } | null> {
  return page.evaluate((needle) => {
    type Block = { id: string; type: string; content: Array<{ text: string }> | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];
    const plain = (content: Array<{ text: string }> | string | null): string =>
      Array.isArray(content) ? content.map((s) => s.text ?? "").join("") : typeof content === "string" ? content : "";

    const walk = (nodes: Block[], parentType: string | null): { blockId: string; blockType: string | null; parentType: string | null; text: string } | null => {
      for (const node of nodes) {
        const nested = walk(node.children ?? [], node.type);
        if (nested) return nested;
        const text = plain(node.content);
        if (text.includes(needle)) return { blockId: node.id, blockType: node.type, parentType, text };
      }
      return null;
    };
    return walk(blocks, null);
  }, marker);
}

async function getDocHealth(page: Page): Promise<{ blockCount: number; hasInvalidId: boolean; text: string }> {
  return page.evaluate(() => {
    type Block = { id: string; content: Array<{ text: string }> | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];
    let blockCount = 0;
    let hasInvalidId = false;
    const text: string[] = [];
    const walk = (nodes: Block[]) => {
      for (const node of nodes) {
        blockCount++;
        if (!node.id || typeof node.id !== "string") hasInvalidId = true;
        if (Array.isArray(node.content)) text.push(node.content.map((s) => s.text ?? "").join(""));
        else if (typeof node.content === "string") text.push(node.content);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(blocks);
    return { blockCount, hasInvalidId, text: text.join("\n") };
  });
}

test.describe("Notion-like backlog hardening", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("DEF-005: nested list/todo conversion policy keeps siblings and deep subtree", async ({ page }) => {
    const marker = `def005-target-${Math.random().toString(36).slice(2, 7)}`;
    const deep = `def005-deep-${Math.random().toString(36).slice(2, 7)}`;
    const keepA = `def005-keep-a-${Math.random().toString(36).slice(2, 7)}`;
    const keepB = `def005-keep-b-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{
      id: "root-list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        { id: "root-a", type: "listItem", attrs: {}, content: spans(keepA), children: [] },
        {
          id: "root-target",
          type: "listItem",
          attrs: {},
          content: spans(marker),
          children: [{ id: "deep-list", type: "bulletList", attrs: {}, content: null, children: [{ id: "deep-item", type: "listItem", attrs: {}, content: spans(deep), children: [] }] }],
        },
        { id: "root-b", type: "listItem", attrs: {}, content: spans(keepB), children: [] },
      ],
    }]);

    const sequence: Array<{ query: string; name: string; expectedType: string; expectedParent: string }> = [
      { query: "todo", name: "To-do List", expectedType: "todoItem", expectedParent: "todoList" },
      { query: "number", name: "Numbered List", expectedType: "listItem", expectedParent: "orderedList" },
      { query: "bullet", name: "Bullet List", expectedType: "listItem", expectedParent: "bulletList" },
      { query: "todo", name: "To-do List", expectedType: "todoItem", expectedParent: "todoList" },
      { query: "bullet", name: "Bullet List", expectedType: "listItem", expectedParent: "bulletList" },
    ];

    for (const step of sequence) {
      const current = await getLeafByMarker(page, marker);
      await setSelection(page, current?.blockId ?? "root-target", 0);
      await runSlash(page, step.query, step.name);
      await expect.poll(() => getLeafByMarker(page, marker)).toMatchObject({
        blockType: step.expectedType,
        parentType: step.expectedParent,
      });
      const health = await getDocHealth(page);
      expect(health.text).toContain(deep);
      expect(health.text).toContain(keepA);
      expect(health.text).toContain(keepB);
      expect(health.hasInvalidId).toBe(false);
    }
  });

  test("DEF-014: backspace at start of non-empty list/todo items keeps policy stable", async ({ page }) => {
    const listMarker = `def014-list-${Math.random().toString(36).slice(2, 7)}`;
    const todoMarker = `def014-todo-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{
      id: "root-list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [{ id: "li-1", type: "listItem", attrs: {}, content: spans("alpha"), children: [{ id: "nested-b", type: "bulletList", attrs: {}, content: null, children: [{ id: "li-2", type: "listItem", attrs: {}, content: spans(listMarker), children: [] }] }] }],
    }, {
      id: "root-todo",
      type: "todoList",
      attrs: {},
      content: null,
      children: [{ id: "todo-1", type: "todoItem", attrs: { checked: false }, content: spans(todoMarker), children: [] }],
    }]);

    await setSelection(page, "li-2", 0);
    await page.keyboard.press("Backspace");
    await expect.poll(() => getLeafByMarker(page, listMarker)).toMatchObject({ blockType: "paragraph" });

    await setSelection(page, "todo-1", 0);
    await page.keyboard.press("Backspace");
    await expect.poll(() => getLeafByMarker(page, todoMarker)).toMatchObject({ blockType: "paragraph" });

    await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined)?.undo?.());
    await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { redo?: () => boolean } | undefined)?.redo?.());
    const health = await getDocHealth(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.text).toContain(listMarker);
    expect(health.text).toContain(todoMarker);
  });

});
