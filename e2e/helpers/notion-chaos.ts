import { expect, type Page } from "@playwright/test";
import type { BlockInput } from "./notion-checklist";
import { spans } from "./notion-crossblock";

export function buildMixedDoc(seed: string): BlockInput[] {
  return [
    { id: "p-a", type: "paragraph", attrs: {}, content: spans(`${seed}-p-a`), children: [] },
    {
      id: "bl-root",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        {
          id: "li-a",
          type: "listItem",
          attrs: {},
          content: spans(`${seed}-li-a`),
          children: [
            {
              id: "bl-nested",
              type: "bulletList",
              attrs: {},
              content: null,
              children: [
                { id: "li-a1", type: "listItem", attrs: {}, content: spans(`${seed}-li-a1`), children: [] },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "tl-root",
      type: "todoList",
      attrs: {},
      content: null,
      children: [
        {
          id: "ti-a",
          type: "todoItem",
          attrs: { checked: false },
          content: spans(`${seed}-ti-a`),
          children: [
            {
              id: "tl-nested",
              type: "todoList",
              attrs: {},
              content: null,
              children: [
                {
                  id: "ti-a1",
                  type: "todoItem",
                  attrs: { checked: false },
                  content: spans(`${seed}-ti-a1`),
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "code",
      type: "codeBlock",
      attrs: { language: "plaintext" },
      content: `${seed}-code`,
      children: [],
    },
    { id: "p-anchor", type: "paragraph", attrs: {}, content: spans(`${seed}-anchor-fixed`), children: [] },
    { id: "p-tail", type: "paragraph", attrs: {}, content: spans(`${seed}-tail`), children: [] },
  ];
}

export async function topLevelOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")).map(
      (el) => (el as HTMLElement).getAttribute("data-block-id") ?? "",
    ),
  );
}

async function readHoverPoint(page: Page, blockId: string): Promise<{ textX: number; gutterX: number; y: number }> {
  const point = await page.evaluate((id) => {
    const block = document.querySelector(`[data-gotipe-content] > [data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return null;

    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let textLeft = block.getBoundingClientRect().left + 20;
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const text = n.textContent ?? "";
      if (!text.trim()) continue;
      const r = document.createRange();
      r.setStart(n, 0);
      r.setEnd(n, Math.min(1, text.length));
      const rect = r.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        textLeft = rect.left;
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

export async function activateToolbarForBlock(page: Page, blockId: string): Promise<void> {
  const handle = page.locator(`[data-block-drag="${blockId}"]`);
  for (let attempt = 0; attempt < 6; attempt++) {
    const point = await readHoverPoint(page, blockId);
    await page.mouse.move(4, 4);
    await page.mouse.move(point.textX, point.y, { steps: 1 });
    await page.mouse.move(point.gutterX, point.y, { steps: 1 });
    if (await handle.isVisible()) return;
    await page.waitForTimeout(40);
  }
  await expect(handle).toBeVisible();
}

export async function dragBlockToIndex(page: Page, blockId: string, targetIndex: number): Promise<void> {
  await page.evaluate(({ blockId, targetIndex }) => {
    const root = document.querySelector("[data-gotipe-block-editor]") as HTMLElement | null;
    const handle = document.querySelector(`[data-block-drag="${blockId}"]`) as HTMLElement | null;
    const blocks = Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")) as HTMLElement[];
    const target = blocks[targetIndex] ?? null;
    if (!root || !handle || !target) return;

    const data = new DataTransfer();
    data.setData("text/gotipe-block-id", blockId);
    handle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data }));
    const rect = target.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    root.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientY: y, dataTransfer: data }));
    root.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientY: y, dataTransfer: data }));
    handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: data }));
  }, { blockId, targetIndex });
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

export async function runSlash(page: Page, query: string, commandName: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await openSlashMenu(page, query);
  const item = menu.locator(".gotipe-slash-menu-item-title", { hasText: commandName }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).toBeHidden();
}

export async function getLeafByMarker(
  page: Page,
  marker: string,
): Promise<{ blockId: string; parentType: string | null; text: string } | null> {
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
