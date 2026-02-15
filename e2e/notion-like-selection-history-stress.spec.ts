import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

type MarkName = "bold" | "italic" | "underline" | "strikethrough" | "code";
type Span = { text: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

function spans(text: string): Span[] {
  return [{ text, marks: [] }];
}

async function setSelection(
  page: Page,
  anchor: { blockId: string; offset: number },
  head = anchor,
): Promise<void> {
  await page.evaluate(({ anchor, head }) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          setSelection?: (selection: {
            anchor: { blockId: string; offset: number };
            head: { blockId: string; offset: number };
          }) => void;
          focus?: () => void;
        }
      | undefined;
    editor?.setSelection?.({ anchor, head });
    editor?.focus?.();
  }, { anchor, head });
}

async function toggleMark(page: Page, mark: MarkName): Promise<void> {
  await page.evaluate((name) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          chain?: () => {
            toggleBold?: () => { run: () => boolean };
            toggleItalic?: () => { run: () => boolean };
            toggleUnderline?: () => { run: () => boolean };
            toggleStrikethrough?: () => { run: () => boolean };
            toggleCode?: () => { run: () => boolean };
          };
        }
      | undefined;
    const chain = editor?.chain?.();
    if (!chain) return;
    if (name === "bold") chain.toggleBold?.().run();
    if (name === "italic") chain.toggleItalic?.().run();
    if (name === "underline") chain.toggleUnderline?.().run();
    if (name === "strikethrough") chain.toggleStrikethrough?.().run();
    if (name === "code") chain.toggleCode?.().run();
  }, mark);
}

async function undo(page: Page, n = 1): Promise<void> {
  await page.evaluate((k) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined;
    for (let i = 0; i < k; i++) editor?.undo?.();
  }, n);
}

async function redo(page: Page, n = 1): Promise<void> {
  await page.evaluate((k) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { redo?: () => boolean } | undefined;
    for (let i = 0; i < k; i++) editor?.redo?.();
  }, n);
}

async function getDocStats(page: Page): Promise<{
  blockCount: number;
  hasInvalidId: boolean;
  text: string;
  markCount: number;
  markTypes: string[];
}> {
  return page.evaluate(() => {
    type Block = { id: string; content: Array<{ text: string; marks?: Array<{ type: string }> }> | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];
    let blockCount = 0;
    let hasInvalidId = false;
    let markCount = 0;
    const markTypes = new Set<string>();
    const text: string[] = [];
    const walk = (nodes: Block[]) => {
      for (const node of nodes) {
        blockCount++;
        if (!node.id || typeof node.id !== "string") hasInvalidId = true;
        if (Array.isArray(node.content)) {
          text.push(node.content.map((s) => s.text ?? "").join(""));
          for (const s of node.content) {
            for (const m of s.marks ?? []) {
              markCount++;
              if (m.type) markTypes.add(m.type);
            }
          }
        } else if (typeof node.content === "string") {
          text.push(node.content);
        }
        if (node.children?.length) walk(node.children);
      }
    };
    walk(blocks);
    return {
      blockCount,
      hasInvalidId,
      text: text.join("\n"),
      markCount,
      markTypes: Array.from(markTypes),
    };
  });
}

function buildLargeDoc(seed: string): { blocks: BlockInput[]; leafIds: string[] } {
  const blocks: BlockInput[] = [];
  const leafIds: string[] = [];
  for (let i = 0; i < 36; i++) {
    const pId = `p-${i}`;
    const pText = `${seed}-para-${i}-abcdefgh`;
    blocks.push({ id: pId, type: "paragraph", attrs: {}, content: spans(pText), children: [] });
    leafIds.push(pId);
    if (i % 6 === 0) {
      const li = `li-${i}`;
      blocks.push({
        id: `bl-${i}`,
        type: "bulletList",
        attrs: {},
        content: null,
        children: [{ id: li, type: "listItem", attrs: {}, content: spans(`${seed}-li-${i}-abcdef`), children: [] }],
      });
      leafIds.push(li);
    }
    if (i % 9 === 0) {
      const ti = `ti-${i}`;
      blocks.push({
        id: `tl-${i}`,
        type: "todoList",
        attrs: {},
        content: null,
        children: [{ id: ti, type: "todoItem", attrs: { checked: false }, content: spans(`${seed}-todo-${i}-abcdef`), children: [] }],
      });
      leafIds.push(ti);
    }
  }
  blocks.push({
    id: "anchor-fixed",
    type: "paragraph",
    attrs: {},
    content: spans(`${seed}-anchor-fixed`),
    children: [],
  });
  return { blocks, leafIds };
}

test.describe("Notion-like selection/history stress", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("SELH-001: bulk mark toggles across large doc keep mark integrity and history", async ({ page }) => {
    const seed = `selh1-${Math.random().toString(36).slice(2, 7)}`;
    const { blocks, leafIds } = buildLargeDoc(seed);
    await setNotionContent(page, blocks);
    const marks: MarkName[] = ["bold", "italic", "underline", "strikethrough", "code"];

    for (let i = 0; i < 45; i++) {
      const blockId = leafIds[i % leafIds.length]!;
      const from = 1 + (i % 2);
      const to = from + 4;
      await setSelection(page, { blockId, offset: from }, { blockId, offset: to });
      await toggleMark(page, marks[i % marks.length]!);
    }

    const mid = await getDocStats(page);
    expect(mid.hasInvalidId).toBe(false);
    expect(mid.blockCount).toBeGreaterThan(40);
    expect(mid.text).toContain(seed);
    expect(mid.markCount).toBeGreaterThan(25);
    expect(mid.markTypes.length).toBeGreaterThanOrEqual(4);

    await undo(page, 20);
    await redo(page, 20);
    const after = await getDocStats(page);
    expect(after.hasInvalidId).toBe(false);
    expect(after.text).toContain(seed);
    expect(after.markCount).toBeGreaterThan(10);
  });

  test("SELH-002: list/todo mark toggles with typing remain stable through undo/redo", async ({ page }) => {
    const seed = `selh2-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [
      { id: "a", type: "paragraph", attrs: {}, content: spans(`${seed}-a-abcdef`), children: [] },
      { id: "bl", type: "bulletList", attrs: {}, content: null, children: [{ id: "li", type: "listItem", attrs: {}, content: spans(`${seed}-li-abcdef`), children: [] }] },
      { id: "tl", type: "todoList", attrs: {}, content: null, children: [{ id: "ti", type: "todoItem", attrs: { checked: false }, content: spans(`${seed}-ti-abcdef`), children: [] }] },
    ]);

    await setSelection(page, { blockId: "li", offset: 2 }, { blockId: "li", offset: 6 });
    await toggleMark(page, "bold");
    await setSelection(page, { blockId: "ti", offset: 1 }, { blockId: "ti", offset: 5 });
    await toggleMark(page, "italic");
    await setSelection(page, { blockId: "ti", offset: 12 });
    await page.keyboard.type("-x", { delay: 0 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("next", { delay: 0 });

    const beforeUndo = await getDocStats(page);
    expect(beforeUndo.hasInvalidId).toBe(false);
    expect(beforeUndo.text).toContain("next");
    expect(beforeUndo.markCount).toBeGreaterThan(1);

    await undo(page, 4);
    await redo(page, 4);
    const afterHistory = await getDocStats(page);
    expect(afterHistory.hasInvalidId).toBe(false);
    expect(afterHistory.text).toContain(seed);
    expect(afterHistory.text).toContain("next");
  });

  test("SELH-003: rapid mixed selection/mark/typing loop on large doc keeps healthy state", async ({ page }) => {
    test.setTimeout(80_000);
    const seed = `selh3-${Math.random().toString(36).slice(2, 7)}`;
    const { blocks, leafIds } = buildLargeDoc(seed);
    await setNotionContent(page, blocks);
    const marks: MarkName[] = ["bold", "italic", "underline", "strikethrough", "code"];

    for (let i = 0; i < 60; i++) {
      const blockId = leafIds[i % leafIds.length]!;
      const at = 3 + (i % 3);
      await setSelection(page, { blockId, offset: at }, { blockId, offset: at + 2 });
      await toggleMark(page, marks[i % marks.length]!);
      await setSelection(page, { blockId, offset: at + 2 });
      await page.keyboard.type(`z${i % 10}`, { delay: 0 });
      if (i % 4 === 0) await page.keyboard.press("Enter");
      if (i % 6 === 0) {
        await undo(page, 1);
        await redo(page, 1);
      }
    }

    const health = await getDocStats(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.blockCount).toBeGreaterThan(42);
    expect(health.text).toContain(`${seed}-anchor-fixed`);
    expect(health.markCount).toBeGreaterThan(40);
  });
});
