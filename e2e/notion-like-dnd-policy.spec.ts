import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

type Span = { text: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

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
    editor?.setSelection?.({ anchor: { blockId, offset }, head: { blockId, offset } });
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

async function readHoverPoint(page: Page, blockId: string): Promise<{ textX: number; gutterX: number; y: number }> {
  const point = await page.evaluate((id) => {
    const block = document.querySelector(`[data-gotipe-content] > [data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return null;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    let textLeft = block.getBoundingClientRect().left + 20;
    while ((n = walker.nextNode())) {
      const text = n.textContent ?? "";
      if (!text.trim()) continue;
      const r = document.createRange();
      r.setStart(n, 0);
      r.setEnd(n, Math.min(1, text.length));
      const rr = r.getBoundingClientRect();
      if (rr.width > 0 || rr.height > 0) {
        textLeft = rr.left;
        break;
      }
    }
    const br = block.getBoundingClientRect();
    return {
      textX: textLeft + 10,
      gutterX: Math.max(4, textLeft - 28),
      y: br.top + Math.min(20, Math.max(10, br.height / 2)),
    };
  }, blockId);
  expect(point).not.toBeNull();
  return point!;
}

async function activateToolbarForBlock(page: Page, blockId: string): Promise<void> {
  const point = await readHoverPoint(page, blockId);
  await page.mouse.move(4, 4);
  await page.mouse.move(point.textX, point.y, { steps: 1 });
  await page.mouse.move(point.gutterX, point.y, { steps: 1 });
  await expect(page.locator(`[data-block-drag="${blockId}"], [data-block-drag-whole="${blockId}"]`)).toBeVisible();
}

async function topLevelOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]"))
      .map((n) => (n as HTMLElement).getAttribute("data-block-id") ?? ""),
  );
}

async function dragBlockToIndex(page: Page, blockId: string, targetIndex: number): Promise<void> {
  await page.evaluate(({ blockId, targetIndex }) => {
    const root = document.querySelector("[data-gotipe-block-editor]") as HTMLElement | null;
    const handle = document.querySelector(`[data-block-drag="${blockId}"], [data-block-drag-whole="${blockId}"]`) as HTMLElement | null;
    const blocks = Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")) as HTMLElement[];
    const target = blocks[targetIndex] ?? null;
    if (!root || !handle || !target) return;

    const data = new DataTransfer();
    data.setData("text/gotipe-block-id", blockId);
    handle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data, altKey: handle.getAttribute("data-block-drag") !== blockId }));
    const rect = target.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    root.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientY: y, dataTransfer: data }));
    root.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientY: y, dataTransfer: data }));
    handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: data }));
  }, { blockId, targetIndex });
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

async function getLeafByMarker(page: Page, marker: string): Promise<{ blockId: string; parentType: string | null; text: string } | null> {
  return page.evaluate((needle) => {
    type Block = { id: string; type: string; content: Array<{ text: string }> | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const plain = (content: Array<{ text: string }> | string | null): string =>
      Array.isArray(content) ? content.map((s) => s.text ?? "").join("") : typeof content === "string" ? content : "";
    const walk = (nodes: Block[], parentType: string | null): { blockId: string; parentType: string | null; text: string } | null => {
      for (const node of nodes) {
        const nested = walk(node.children ?? [], node.type);
        if (nested) return nested;
        const text = plain(node.content);
        if (text.includes(needle)) return { blockId: node.id, parentType, text };
      }
      return null;
    };
    return walk(editor?.getViewState?.().blocks ?? [], null);
  }, marker);
}

test.describe("Notion-like DnD policy hardening", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("DND-001: moving complex list block preserves deep subtree and supports undo/redo", async ({ page }) => {
    const deep = `dnd-deep-${Math.random().toString(36).slice(2, 7)}`;
    const tail = `dnd-tail-${Math.random().toString(36).slice(2, 7)}`;
    const blocks: BlockInput[] = [
      { id: "p1", type: "paragraph", attrs: {}, content: spans("alpha"), children: [] },
      { id: "list", type: "bulletList", attrs: {}, content: null, children: [{ id: "li-1", type: "listItem", attrs: {}, content: spans("parent"), children: [{ id: "deep-list", type: "bulletList", attrs: {}, content: null, children: [{ id: "deep-item", type: "listItem", attrs: {}, content: spans(deep), children: [] }] }] }] },
      { id: "code", type: "codeBlock", attrs: { language: "plaintext" }, content: "const x = 1;", children: [] },
      { id: "todo", type: "todoList", attrs: {}, content: null, children: [{ id: "todo-item", type: "todoItem", attrs: { checked: false }, content: spans(tail), children: [] }] },
      { id: "p2", type: "paragraph", attrs: {}, content: spans("omega"), children: [] },
    ];
    await setNotionContent(page, blocks);
    const before = await topLevelOrder(page);

    await activateToolbarForBlock(page, "list");
    await dragBlockToIndex(page, "list", 4);
    const moved = await topLevelOrder(page);
    expect(moved).not.toEqual(before);
    expect(moved.indexOf("list")).toBeGreaterThan(moved.indexOf("code"));
    expect((await getDocHealth(page)).text).toContain(deep);
    expect((await getDocHealth(page)).text).toContain(tail);

    await undo(page, 1);
    await expect.poll(() => topLevelOrder(page)).toEqual(before);
    await redo(page, 1);
    await expect.poll(() => topLevelOrder(page)).toEqual(moved);
  });

  test("DND-002: rapid alternating drag across document edges keeps healthy state", async ({ page }) => {
    test.setTimeout(80_000);
    await setNotionContent(page, [
      { id: "a", type: "paragraph", attrs: {}, content: spans("a"), children: [] },
      { id: "moving", type: "heading", attrs: { level: 2 }, content: spans("moving"), children: [] },
      { id: "b", type: "paragraph", attrs: {}, content: spans("b"), children: [] },
      { id: "c", type: "codeBlock", attrs: { language: "plaintext" }, content: "c", children: [] },
      { id: "d", type: "todoList", attrs: {}, content: null, children: [{ id: "d-item", type: "todoItem", attrs: { checked: false }, content: spans("d"), children: [] }] },
      { id: "e", type: "paragraph", attrs: {}, content: spans("e"), children: [] },
    ]);

    for (let i = 0; i < 20; i++) {
      const order = await topLevelOrder(page);
      const targetIndex = i % 2 === 0 ? order.length - 1 : 0;
      await activateToolbarForBlock(page, "moving");
      await dragBlockToIndex(page, "moving", targetIndex);
      const next = await topLevelOrder(page);
      expect(next).not.toEqual(order);
      const pos = next.indexOf("moving");
      if (i % 2 === 0) expect(pos).toBeGreaterThanOrEqual(order.length - 2);
      else expect(pos).toBe(0);
      if (i % 5 === 0) {
        await undo(page, 1);
        await redo(page, 1);
      }
      const health = await getDocHealth(page);
      expect(health.hasInvalidId).toBe(false);
      expect(health.text).toContain("moving");
    }
  });

  test("DND-003: drag works after slash transform and keeps immediate typing stable", async ({ page }) => {
    const marker = `dnd-slash-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [
      { id: "start", type: "paragraph", attrs: {}, content: spans("start"), children: [] },
      { id: "target", type: "paragraph", attrs: {}, content: spans(marker), children: [] },
      { id: "end", type: "paragraph", attrs: {}, content: spans("end"), children: [] },
    ]);

    await setSelection(page, "target", marker.length);
    await runSlash(page, "todo", "To-do List");
    const transformed = await getLeafByMarker(page, marker);
    expect(transformed?.parentType).toBe("todoList");
    const todoTopId = await page.evaluate((leafId) => {
      if (!leafId) return null;
      const leaf = document.querySelector(`[data-block-id="${leafId}"]`) as HTMLElement | null;
      return leaf?.parentElement?.getAttribute("data-block-id") ?? null;
    }, transformed?.blockId ?? null);
    expect(todoTopId).not.toBeNull();

    await activateToolbarForBlock(page, todoTopId!);
    await dragBlockToIndex(page, todoTopId!, 0);
    await expect.poll(() => topLevelOrder(page)).toContain(todoTopId!);

    await setSelection(page, transformed!.blockId, transformed!.text.length);
    const suffix = `-typed-${Math.random().toString(36).slice(2, 5)}`;
    await page.keyboard.type(suffix, { delay: 0 });
    await expect.poll(() => getLeafByMarker(page, marker)).toMatchObject({
      parentType: "todoList",
      text: expect.stringContaining(suffix),
    });
  });
});
