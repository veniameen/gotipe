import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent } from "./helpers/notion-checklist";

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

async function placeCaretAtCurrentLeafEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Block = { id: string; type: string; content: Array<{ text: string }> | string | null; children: Block[] };
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
    const textLen = (node: Block): number =>
      Array.isArray(node.content)
        ? node.content.reduce((sum, s) => sum + (s.text ?? "").length, 0)
        : typeof node.content === "string"
          ? node.content.length
          : 0;

    const current = state.selection.type === "text" ? findById(state.blocks, state.selection.anchor.blockId) : null;
    const leaf = resolveLeaf(current ?? state.blocks[0]!);
    const offset = textLen(leaf);
    editor.setSelection({
      anchor: { blockId: leaf.id, offset },
      head: { blockId: leaf.id, offset },
    });
    editor.focus?.();
  });
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

test.describe("Notion-like backlog hardening (stress)", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("DEF-007: long-run mixed typing/slash/enter/backspace/undo stays healthy", async ({ page }) => {
    test.setTimeout(90_000);
    const seed = `def007-seed-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(seed), children: [] }]);
    await setSelection(page, "p", seed.length);
    const slashCycle = [
      { query: "bullet", name: "Bullet List" },
      { query: "todo", name: "To-do List" },
      { query: "text", name: "Text" },
      { query: "number", name: "Numbered List" },
    ];

    for (let i = 0; i < 45; i++) {
      await placeCaretAtCurrentLeafEnd(page);
      const cmd = slashCycle[i % slashCycle.length]!;
      await runSlash(page, cmd.query, cmd.name);
      await page.keyboard.type(` s${i}`, { delay: 0 });
      if (i % 2 === 0) await page.keyboard.press("Enter");
      if (i % 3 === 0) await page.keyboard.press("Backspace");
      if (i % 10 === 0) {
        await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined)?.undo?.());
        await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { redo?: () => boolean } | undefined)?.redo?.());
      }
    }

    await placeCaretAtCurrentLeafEnd(page);
    const finalMarker = `def007-final-${Math.random().toString(36).slice(2, 7)}`;
    await page.keyboard.type(` ${finalMarker}`, { delay: 0 });

    const health = await getDocHealth(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.blockCount).toBeGreaterThan(18);
    expect(health.text).toContain(seed);
    expect(health.text).toContain(finalMarker);
  });

  test("hover toolbar stays clickable on rapid repeated passes over multiple blocks", async ({ page }) => {
    await setNotionContent(page, [
      { id: "h", type: "heading", attrs: { level: 1 }, content: spans("Hover hardening"), children: [] },
      { id: "p", type: "paragraph", attrs: {}, content: spans("alpha"), children: [] },
      { id: "bl", type: "bulletList", attrs: {}, content: null, children: [{ id: "bli", type: "listItem", attrs: {}, content: spans("bullet"), children: [] }] },
      { id: "tl", type: "todoList", attrs: {}, content: null, children: [{ id: "tli", type: "todoItem", attrs: { checked: false }, content: spans("todo"), children: [] }] },
      { id: "c", type: "codeBlock", attrs: { language: "plaintext" }, content: "code-line", children: [] },
    ]);

    for (let pass = 0; pass < 3; pass++) {
      const ids = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]"))
          .map((el) => el.getAttribute("data-block-id") ?? "")
          .filter(Boolean),
      );
      for (const id of ids) {
        const point = await readHoverPoint(page, id);
        await page.mouse.move(4, 4);
        await page.mouse.move(point.textX, point.y, { steps: 1 });
        await page.mouse.move(point.gutterX, point.y, { steps: 1 });
        await expect(page.locator('[aria-label="Click to add below. Option-click to add a block above"]')).toBeVisible();
        await expect(page.locator("[data-gotipe-drag-handle]")).toBeVisible();
        const before = await page.locator("[data-gotipe-content] > [data-block-id]").count();
        await page.locator('[aria-label="Click to add below. Option-click to add a block above"]').click();
        await expect.poll(() => page.locator("[data-gotipe-content] > [data-block-id]").count()).toBe(before + 1);
        await page.evaluate(() => ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined)?.undo?.());
        await expect.poll(() => page.locator("[data-gotipe-content] > [data-block-id]").count()).toBe(before);
        await page.locator("[data-gotipe-drag-handle]").click();
        await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
        await page.keyboard.press("Escape");
      }
    }
  });
});
