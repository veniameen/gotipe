import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent } from "./helpers/notion-checklist";

function spans(text: string) {
  return [{ text, marks: [] as Array<{ type: string; attrs?: Record<string, unknown> }> }];
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

async function placeCaretAtCurrentLeafEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Span = { text: string };
    type Block = { id: string; type: string; content: Span[] | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          getViewState?: () => { blocks: Block[]; selection: { type: string; anchor: { blockId: string } } };
          setSelection?: (selection: {
            anchor: { blockId: string; offset: number };
            head: { blockId: string; offset: number };
          }) => void;
          focus?: () => void;
        }
      | undefined;
    if (!editor?.getViewState || !editor?.setSelection) return;
    const state = editor.getViewState();

    const findById = (nodes: Block[], id: string): Block | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const nested = findById(node.children ?? [], id);
        if (nested) return nested;
      }
      return null;
    };

    const resolveLeaf = (node: Block): Block => {
      if ((node.type === "bulletList" || node.type === "orderedList" || node.type === "todoList") && node.children.length > 0) {
        return resolveLeaf(node.children[0]!);
      }
      return node;
    };

    const textLen = (node: Block): number => {
      if (Array.isArray(node.content)) return node.content.reduce((sum, s) => sum + (s.text ?? "").length, 0);
      if (typeof node.content === "string") return node.content.length;
      return 0;
    };

    let target = state.selection.type === "text" ? findById(state.blocks, state.selection.anchor.blockId) : null;
    if (!target) target = state.blocks[0] ?? null;
    if (!target) return;
    const leaf = resolveLeaf(target);
    const offset = textLen(leaf);
    editor.setSelection({
      anchor: { blockId: leaf.id, offset },
      head: { blockId: leaf.id, offset },
    });
    editor.focus?.();
  });
}

async function openSlashMenu(page: Page, query: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  for (const typed of [`/${query}`, ` /${query}`]) {
    await page.keyboard.type(typed, { delay: 6 });
    try {
      await expect(menu).toBeVisible({ timeout: 1000 });
      return;
    } catch {
      for (let i = 0; i < typed.length; i++) await page.keyboard.press("Backspace");
      await page.waitForTimeout(30);
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

async function getLeafByMarker(page: Page, marker: string): Promise<{ blockType: string | null; parentType: string | null; text: string } | null> {
  return page.evaluate((needle) => {
    type Span = { text: string };
    type Block = { type: string; content: Span[] | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];
    const plain = (content: Span[] | string | null): string =>
      Array.isArray(content) ? content.map((s) => s.text ?? "").join("") : typeof content === "string" ? content : "";

    const walk = (nodes: Block[], parentType: string | null): { blockType: string | null; parentType: string | null; text: string } | null => {
      for (const node of nodes) {
        const nested = walk(node.children ?? [], node.type);
        if (nested) return nested;
        const text = plain(node.content);
        if (text.includes(needle)) return { blockType: node.type, parentType, text };
      }
      return null;
    };
    return walk(blocks, null);
  }, marker);
}

async function getDocHealth(page: Page): Promise<{ blockCount: number; hasInvalidId: boolean; text: string }> {
  return page.evaluate(() => {
    type Span = { text: string };
    type Block = { id: string; content: Span[] | string | null; children: Block[] };
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

test.describe("Notion-like backlog policy and stress", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("DEF-005: nested multi-step list<->todo conversions keep deep subtree", async ({ page }) => {
    const target = `def005-target-${Math.random().toString(36).slice(2, 7)}`;
    const deep = `def005-deep-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [
      {
        id: "root-list",
        type: "bulletList",
        attrs: {},
        content: null,
        children: [
          {
            id: "root-item",
            type: "listItem",
            attrs: {},
            content: spans("root"),
            children: [
              {
                id: "nested-list",
                type: "bulletList",
                attrs: {},
                content: null,
                children: [
                  {
                    id: "nested-item",
                    type: "listItem",
                    attrs: {},
                    content: spans(target),
                    children: [
                      { id: "deep-list", type: "bulletList", attrs: {}, content: null, children: [{ id: "deep-item", type: "listItem", attrs: {}, content: spans(deep), children: [] }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const sequence: Array<{ query: string; name: string; expectedType: string; expectedParent: string }> = [
      { query: "todo", name: "To-do List", expectedType: "todoItem", expectedParent: "todoList" },
      { query: "number", name: "Numbered List", expectedType: "listItem", expectedParent: "orderedList" },
      { query: "bullet", name: "Bullet List", expectedType: "listItem", expectedParent: "bulletList" },
      { query: "todo", name: "To-do List", expectedType: "todoItem", expectedParent: "todoList" },
      { query: "bullet", name: "Bullet List", expectedType: "listItem", expectedParent: "bulletList" },
    ];

    for (const step of sequence) {
      await setSelection(page, "nested-item", 0);
      await runSlash(page, step.query, step.name);
      await expect.poll(() => getLeafByMarker(page, target)).toMatchObject({
        blockType: step.expectedType,
        parentType: step.expectedParent,
      });
      await expect.poll(async () => (await getDocHealth(page)).text.includes(deep)).toBe(true);
    }
  });

  test("DEF-014: nested list backspace boundary keeps markers and healthy tree", async ({ page }) => {
    const alpha = `def014-alpha-${Math.random().toString(36).slice(2, 7)}`;
    const beta = `def014-beta-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [
      {
        id: "list",
        type: "bulletList",
        attrs: {},
        content: null,
        children: [
          { id: "item-1", type: "listItem", attrs: {}, content: spans("root"), children: [{ id: "nested", type: "bulletList", attrs: {}, content: null, children: [{ id: "child-1", type: "listItem", attrs: {}, content: spans(alpha), children: [] }, { id: "child-2", type: "listItem", attrs: {}, content: spans(beta), children: [] }] }] },
        ],
      },
    ]);

    await setSelection(page, "child-2", 0);
    await page.keyboard.press("Backspace");
    const afterBackspace = await getDocHealth(page);
    expect(afterBackspace.hasInvalidId).toBe(false);
    expect(afterBackspace.text).toContain(alpha);
    expect(afterBackspace.text).toContain(beta);

    await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined)?.undo?.());
    await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { redo?: () => boolean } | undefined)?.redo?.());
    const afterHistory = await getDocHealth(page);
    expect(afterHistory.hasInvalidId).toBe(false);
    expect(afterHistory.text).toContain(alpha);
    expect(afterHistory.text).toContain(beta);
  });

  test("DEF-007: high-frequency mixed typing/slash/enter/backspace keeps editor stable", async ({ page }) => {
    const seed = `def007-seed-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(seed), children: [] }]);
    await setSelection(page, "p", seed.length);

    const slashCycle = [
      { query: "bullet", name: "Bullet List" },
      { query: "todo", name: "To-do List" },
      { query: "text", name: "Text" },
      { query: "number", name: "Numbered List" },
    ];

    for (let i = 0; i < 20; i++) {
      await placeCaretAtCurrentLeafEnd(page);
      const s = slashCycle[i % slashCycle.length]!;
      await runSlash(page, s.query, s.name);
      await page.keyboard.type(` def007-${i}`, { delay: 0 });
      await page.keyboard.press("Enter");
      if (i % 3 === 0) await page.keyboard.press("Backspace");
    }

    const health = await getDocHealth(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.blockCount).toBeGreaterThan(10);
    expect(health.text).toContain(seed);
    expect(health.text).toContain("def007-19");
  });
});
