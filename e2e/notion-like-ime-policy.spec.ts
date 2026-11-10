import { expect, test, type Page } from "@playwright/test";
import { insertComposedText, openNotionAndReset, setNotionContent } from "./helpers/notion-checklist";

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

async function composeInsert(page: Page, text: string): Promise<void> {
  // Chromium exercises native composition; Firefox/WebKit exercise Unicode
  // insertion because Playwright does not expose their OS composition protocol.
  await insertComposedText(page, text);
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

async function getDocHealth(page: Page): Promise<{ hasInvalidId: boolean; text: string; blockCount: number }> {
  return page.evaluate(() => {
    type Block = { id: string; content: Array<{ text: string }> | string | null; children: Block[] };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];
    let hasInvalidId = false;
    let blockCount = 0;
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
    return { hasInvalidId, text: text.join("\n"), blockCount };
  });
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

test.describe("Notion-like IME policy hardening", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("IME-001: composition insert in paragraph appends text without state corruption", async ({ page }) => {
    const marker = `ime-p-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(marker), children: [] }]);
    await setSelection(page, "p", marker.length);
    const imeText = " привет";
    await composeInsert(page, imeText);
    await expect.poll(() => getLeafByMarker(page, marker)).toMatchObject({
      text: expect.stringContaining(imeText.trim()),
      parentType: null,
    });
    const health = await getDocHealth(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.text).toContain(marker);
    expect(health.text).toContain(imeText.trim());
  });

  test("IME-002: composition in todo item keeps enter behavior and stable tree", async ({ page }) => {
    const marker = `ime-todo-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{
      id: "todo",
      type: "todoList",
      attrs: {},
      content: null,
      children: [{ id: "todo-item", type: "todoItem", attrs: { checked: false }, content: spans(marker), children: [] }],
    }]);
    await setSelection(page, "todo-item", marker.length);
    await composeInsert(page, "-комп");
    await page.keyboard.press("Enter");
    await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="todoList"] > [data-block-type="todoItem"]').count()).toBe(2);
    await expect.poll(() => getLeafByMarker(page, marker)).toMatchObject({
      parentType: "todoList",
      text: expect.stringContaining("комп"),
    });
    const health = await getDocHealth(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.blockCount).toBeGreaterThanOrEqual(3);
  });

  test("IME-003: slash transform + composition + undo/redo stays consistent", async ({ page }) => {
    const marker = `ime-slash-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(marker), children: [] }]);
    await setSelection(page, "p", marker.length);
    await runSlash(page, "bullet", "Bullet List");
    const leaf = await getLeafByMarker(page, marker);
    expect(leaf?.parentType).toBe("bulletList");
    await setSelection(page, leaf!.blockId, leaf!.text.length);

    await composeInsert(page, "-име");
    await expect.poll(() => getLeafByMarker(page, marker)).toMatchObject({
      parentType: "bulletList",
      text: expect.stringContaining("име"),
    });

    await undo(page, 1);
    await redo(page, 1);
    const finalState = await getLeafByMarker(page, marker);
    expect(finalState?.parentType).toBe("bulletList");
    expect(finalState?.text ?? "").toContain("име");
    expect((await getDocHealth(page)).hasInvalidId).toBe(false);
  });
});
