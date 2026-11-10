import { expect, test, type Page } from "@playwright/test";
import { enableClipboardForTest, openNotionAndReset, setNotionContent } from "./helpers/notion-checklist";

function spans(text: string) {
  return [{ text, marks: [] as Array<{ type: string; attrs?: Record<string, unknown> }> }];
}

async function setEditorSelection(page: Page, blockId: string, offset: number): Promise<void> {
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

    const textLength = (node: Block): number => {
      if (Array.isArray(node.content)) return node.content.reduce((sum, s) => sum + (s.text ?? "").length, 0);
      if (typeof node.content === "string") return node.content.length;
      return 0;
    };

    let target = state.selection.type === "text" ? findById(state.blocks, state.selection.anchor.blockId) : null;
    if (!target) target = state.blocks[0] ?? null;
    if (!target) return;
    const leaf = resolveLeaf(target);
    const offset = textLength(leaf);

    editor.setSelection({
      anchor: { blockId: leaf.id, offset },
      head: { blockId: leaf.id, offset },
    });
    editor.focus?.();
  });
}

async function openSlashMenu(page: Page, query: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  const variants = [`/${query}`, ` /${query}`];

  for (const typed of variants) {
    await page.keyboard.type(typed, { delay: 6 });
    try {
      await expect(menu).toBeVisible({ timeout: 1200 });
      return;
    } catch {
      for (let i = 0; i < typed.length; i++) await page.keyboard.press("Backspace");
      await page.waitForTimeout(30);
    }
  }

  await page.keyboard.type(` /${query}`, { delay: 6 });
  await expect(menu).toBeVisible();
}

async function runSlashByClick(page: Page, query: string, commandName: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await openSlashMenu(page, query);
  const item = menu.locator(".gotipe-slash-menu-item-title", { hasText: commandName }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).toBeHidden();
}

async function getLeafByMarker(page: Page, marker: string): Promise<{
  blockType: string | null;
  parentType: string | null;
  text: string;
} | null> {
  return page.evaluate((needle) => {
    type Span = { text: string };
    type Block = { type: string; content: Span[] | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];

    const plain = (content: Span[] | string | null): string => {
      if (Array.isArray(content)) return content.map((s) => s.text ?? "").join("");
      if (typeof content === "string") return content;
      return "";
    };

    const walk = (nodes: Block[], parentType: string | null): { blockType: string | null; parentType: string | null; text: string } | null => {
      for (const node of nodes) {
        const inChildren = walk(node.children ?? [], node.type);
        if (inChildren) return inChildren;
        const text = plain(node.content);
        if (!text.includes(needle)) continue;
        return { blockType: node.type, parentType, text };
      }
      return null;
    };
    return walk(blocks, null);
  }, marker);
}

async function getDocumentHealth(page: Page): Promise<{ blockCount: number; hasInvalidId: boolean; text: string }> {
  return page.evaluate(() => {
    type Span = { text: string };
    type Block = { id: string; content: Span[] | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];
    let blockCount = 0;
    let hasInvalidId = false;
    const textParts: string[] = [];

    const walk = (nodes: Block[]) => {
      for (const node of nodes) {
        blockCount++;
        if (!node.id || typeof node.id !== "string") hasInvalidId = true;
        if (Array.isArray(node.content)) textParts.push(node.content.map((s) => s.text ?? "").join(""));
        else if (typeof node.content === "string") textParts.push(node.content);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(blocks);
    return { blockCount, hasInvalidId, text: textParts.join("\n") };
  });
}

test.describe("Notion-like planned reliability matrix cases", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("REL-001: 50 sequential slash transforms keep DOM/state stable", async ({ page }) => {
    const seed = `rel001-seed-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(seed), children: [] }]);
    await setEditorSelection(page, "p", seed.length);

    const cycle = [
      { query: "h1", command: "Heading 1" },
      { query: "text", command: "Text" },
      { query: "bullet", command: "Bullet List" },
      { query: "todo", command: "To-do List" },
      { query: "number", command: "Numbered List" },
    ];

    for (let i = 0; i < 50; i++) {
      await placeCaretAtCurrentLeafEnd(page);
      const step = cycle[i % cycle.length]!;
      await runSlashByClick(page, step.query, step.command);
      if (i % 10 === 0) await page.keyboard.type(` rel001-step-${i}`);
      const health = await getDocumentHealth(page);
      expect(health.blockCount).toBeGreaterThan(0);
      expect(health.hasInvalidId).toBe(false);
    }

    const finalHealth = await getDocumentHealth(page);
    expect(finalHealth.text).toContain(seed);
  });

  test("REL-002: paste + slash + undo/redo chain stays stable", async ({ page }) => {
    const seed = `rel002-seed-${Math.random().toString(36).slice(2, 7)}`;
    const pasteChunk = " paste-alpha paste-beta";
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(seed), children: [] }]);
    await setEditorSelection(page, "p", seed.length);

    await enableClipboardForTest(page);
    // Firefox strips clipboardData from constructed ClipboardEvents; use the browser clipboard.
    await page.evaluate((text) => navigator.clipboard.writeText(text), pasteChunk);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await expect.poll(async () => (await getDocumentHealth(page)).text).toBe(seed + pasteChunk);

    await runSlashByClick(page, "bullet", "Bullet List");
    await expect.poll(() => getLeafByMarker(page, "paste-alpha")).toMatchObject({
      blockType: "listItem",
      parentType: "bulletList",
    });

    await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined)?.undo?.());
    await expect.poll(() => getLeafByMarker(page, "paste-alpha")).toMatchObject({
      blockType: "paragraph",
      parentType: null,
    });

    await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined)?.undo?.());
    await expect.poll(() => getLeafByMarker(page, seed)).toMatchObject({
      blockType: "paragraph",
      parentType: null,
    });

    await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { redo?: () => boolean } | undefined)?.redo?.());
    await expect.poll(() => getLeafByMarker(page, "paste-alpha")).toMatchObject({
      blockType: "paragraph",
      parentType: null,
    });

    await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { redo?: () => boolean } | undefined)?.redo?.());
    await expect.poll(() => getLeafByMarker(page, "paste-alpha")).toMatchObject({
      blockType: "listItem",
      parentType: "bulletList",
    });
  });

  test("REL-003: fast typing + Enter mash does not lose blocks/text", async ({ page }) => {
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(""), children: [] }]);
    await setEditorSelection(page, "p", 0);

    const markers = Array.from({ length: 30 }, (_, i) => `rel003-${i}`);
    for (const [i, marker] of markers.entries()) {
      await page.keyboard.type(marker, { delay: 0 });
      await page.keyboard.press("Enter");
      if (i % 6 === 0) await page.keyboard.press("Enter");
    }

    const health = await getDocumentHealth(page);
    expect(health.blockCount).toBeGreaterThanOrEqual(30);
    expect(health.hasInvalidId).toBe(false);
    for (const marker of markers) {
      expect(health.text).toContain(marker);
    }
  });
});
