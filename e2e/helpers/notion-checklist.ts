import { expect, type Page } from "@playwright/test";

type Mark = { type: string; attrs?: Record<string, unknown> };
type Span = { text: string; marks?: Mark[] };

export type BlockInput = {
  id: string;
  type: string;
  attrs?: Record<string, unknown>;
  content?: Span[] | string | null;
  children?: BlockInput[];
};

export type CaretPosition = "start" | "middle" | "end";

export type SelectionState = {
  anchorBlockId: string | null;
  focusBlockId: string | null;
  anchorOffset: number;
  focusOffset: number;
  collapsed: boolean;
  anchorAtRootStart: boolean;
};

export function paragraph(id: string, text = "", marks: Mark[] = []): BlockInput {
  return {
    id,
    type: "paragraph",
    attrs: {},
    content: [{ text, marks }],
    children: [],
  };
}

export function heading(id: string, level: number, text = "", marks: Mark[] = []): BlockInput {
  return {
    id,
    type: "heading",
    attrs: { level },
    content: [{ text, marks }],
    children: [],
  };
}

export function bulletList(listId: string, itemId: string, text = ""): BlockInput {
  return {
    id: listId,
    type: "bulletList",
    attrs: {},
    content: null,
    children: [
      {
        id: itemId,
        type: "listItem",
        attrs: {},
        content: [{ text, marks: [] }],
        children: [],
      },
    ],
  };
}

export function orderedList(listId: string, itemId: string, text = ""): BlockInput {
  return {
    id: listId,
    type: "orderedList",
    attrs: {},
    content: null,
    children: [
      {
        id: itemId,
        type: "listItem",
        attrs: {},
        content: [{ text, marks: [] }],
        children: [],
      },
    ],
  };
}

export function todoList(listId: string, itemId: string, text = ""): BlockInput {
  return {
    id: listId,
    type: "todoList",
    attrs: {},
    content: null,
    children: [
      {
        id: itemId,
        type: "todoItem",
        attrs: { checked: false },
        content: [{ text, marks: [] }],
        children: [],
      },
    ],
  };
}

export async function openNotionAndReset(page: Page): Promise<void> {
  await page.goto("/#notion");
  await expect(page.locator('[data-gotipe-nav="notion"]')).toHaveClass(/active/);
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
  await setNotionContent(page, [paragraph("qa-root", "")]);
}

export async function setNotionContent(page: Page, blocks: BlockInput[]): Promise<void> {
  const ok = await page.evaluate((payload) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { setContent?: (content: unknown) => void; syncSelectionFromDOM?: () => void }
      | undefined;
    if (!editor || typeof editor.setContent !== "function") return false;
    editor.setContent({ version: 1, blocks: payload });
    editor.syncSelectionFromDOM?.();
    return true;
  }, blocks);

  expect(ok).toBe(true);
  await page.locator("[data-gotipe-content]").click();
}

export async function clickBlockAt(page: Page, blockId: string, position: CaretPosition): Promise<void> {
  const point = await page.evaluate(({ id, pos }) => {
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return null;

    const getRangeRect = (range: Range): DOMRect | null => {
      const rects = Array.from(range.getClientRects());
      const first = rects[0] ?? null;
      if (first && (first.width > 0 || first.height > 0)) return first;
      const bbox = range.getBoundingClientRect();
      if (bbox.width > 0 || bbox.height > 0) return bbox;
      return null;
    };

    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);

    const blockRect = block.getBoundingClientRect();
    let x = blockRect.left + 8;
    const y = blockRect.top + Math.max(8, blockRect.height / 2);

    if (textNodes.length > 0) {
      const fullText = textNodes.map((n) => n.textContent ?? "").join("");
      const total = fullText.length;
      const targetOffset =
        pos === "start" ? 0 : pos === "end" ? total : Math.max(0, Math.floor(total / 2));
      let acc = 0;
      let targetNode: Text = textNodes[textNodes.length - 1]!;
      let localOffset = (targetNode.textContent ?? "").length;
      for (const textNode of textNodes) {
        const len = (textNode.textContent ?? "").length;
        if (acc + len >= targetOffset) {
          targetNode = textNode;
          localOffset = Math.max(0, Math.min(len, targetOffset - acc));
          break;
        }
        acc += len;
      }

      const range = document.createRange();
      if (pos === "middle" && (targetNode.textContent ?? "").length > 0 && localOffset > 0) {
        const from = Math.max(0, localOffset - 1);
        range.setStart(targetNode, from);
        range.setEnd(targetNode, Math.min((targetNode.textContent ?? "").length, from + 1));
      } else {
        range.setStart(targetNode, localOffset);
        range.collapse(true);
      }

      const caretRect = getRangeRect(range);
      if (caretRect) {
        x = pos === "end" ? caretRect.right : caretRect.left;
      }
      if (pos === "end") {
        // Collapsed range rect can be unreliable across mixed inline spans.
        x = Math.max(blockRect.left + 8, blockRect.right - 8);
      }
    } else if (pos === "end") {
      x = blockRect.right - 8;
    } else if (pos === "middle") {
      x = blockRect.left + blockRect.width / 2;
    }

    return { x, y };
  }, { id: blockId, pos: position });

  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

export async function setCaretAt(page: Page, blockId: string, position: CaretPosition): Promise<void> {
  await page.evaluate(({ id, pos }) => {
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return;
    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);

    const range = document.createRange();
    if (textNodes.length === 0) {
      range.setStart(block, 0);
      range.collapse(true);
    } else {
      const text = textNodes.map((n) => n.textContent ?? "").join("");
      const total = text.length;
      const targetOffset =
        pos === "start" ? 0 : pos === "end" ? total : Math.max(0, Math.floor(total / 2));
      let acc = 0;
      let targetNode: Text = textNodes[textNodes.length - 1]!;
      let localOffset = (targetNode.textContent ?? "").length;
      for (const textNode of textNodes) {
        const len = (textNode.textContent ?? "").length;
        if (acc + len >= targetOffset) {
          targetNode = textNode;
          localOffset = Math.max(0, Math.min(len, targetOffset - acc));
          break;
        }
        acc += len;
      }
      range.setStart(targetNode, localOffset);
      range.collapse(true);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    (document.querySelector("[data-gotipe-content]") as HTMLElement | null)?.focus();
  }, { id: blockId, pos: position });
}

export async function dragSelectionBetween(page: Page, fromBlockId: string, toBlockId: string): Promise<void> {
  const points = await page.evaluate(({ fromId, toId }) => {
    const from = document.querySelector(`[data-block-id="${fromId}"]`) as HTMLElement | null;
    const to = document.querySelector(`[data-block-id="${toId}"]`) as HTMLElement | null;
    if (!from || !to) return null;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    return {
      fromX: fromRect.left + Math.min(20, Math.max(8, fromRect.width / 3)),
      fromY: fromRect.top + fromRect.height / 2,
      toX: toRect.left + Math.min(20, Math.max(8, toRect.width / 3)),
      toY: toRect.top + toRect.height / 2,
    };
  }, { fromId: fromBlockId, toId: toBlockId });

  expect(points).not.toBeNull();
  await page.mouse.move(points!.fromX, points!.fromY);
  await page.mouse.down();
  await page.mouse.move(points!.toX, points!.toY, { steps: 8 });
  await page.mouse.up();
}

export async function readSelectionState(page: Page): Promise<SelectionState> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    const content = document.querySelector("[data-gotipe-content]");
    const anchorEl =
      sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const focusEl =
      sel?.focusNode instanceof Element ? sel.focusNode : sel?.focusNode?.parentElement;

    return {
      anchorBlockId: anchorEl?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null,
      focusBlockId: focusEl?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null,
      anchorOffset: sel?.anchorOffset ?? -1,
      focusOffset: sel?.focusOffset ?? -1,
      collapsed: sel?.isCollapsed ?? true,
      anchorAtRootStart: !!(content && sel?.anchorNode === content && sel.anchorOffset === 0),
    };
  });
}
