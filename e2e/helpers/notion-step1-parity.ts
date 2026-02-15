import type { Page } from "@playwright/test";
import type { BlockInput } from "./notion-checklist";

type Mark = { type: string };

export function spans(text: string): Array<{ text: string; marks: Mark[] }> {
  return [{ text, marks: [] }];
}

export function paragraph(id: string, text: string): BlockInput {
  return { id, type: "paragraph", attrs: {}, content: spans(text), children: [] };
}

export function blockquote(id: string, text: string): BlockInput {
  return { id, type: "blockquote", attrs: {}, content: spans(text), children: [] };
}

export function callout(id: string, text: string): BlockInput {
  return { id, type: "callout", attrs: { type: "info", emoji: "💡" }, content: spans(text), children: [] };
}

export function codeBlock(id: string, text: string): BlockInput {
  return { id, type: "codeBlock", attrs: { language: "ts" }, content: spans(text), children: [] };
}

export function todoList(
  listId: string,
  items: Array<{ id: string; text: string; checked?: boolean }>,
): BlockInput {
  return {
    id: listId,
    type: "todoList",
    attrs: {},
    content: null,
    children: items.map((item) => ({
      id: item.id,
      type: "todoItem",
      attrs: { checked: !!item.checked },
      content: spans(item.text),
      children: [],
    })),
  };
}

export async function syncSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  });
}

export async function setCaret(
  page: Page,
  blockId: string,
  position: "start" | "middle" | "end",
): Promise<void> {
  await page.evaluate(({ id, pos }) => {
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return;
    const blockType = block.getAttribute("data-block-type");
    const host =
      blockType === "todoItem"
        ? (block.querySelector("[data-gotipe-todo-content]") as HTMLElement | null) ?? block
        : blockType === "callout"
          ? (block.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? block
          : block;

    const sel = window.getSelection();
    if (!sel) return;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      if ((textNode.textContent ?? "").length > 0 || pos === "start") {
        nodes.push(textNode);
      }
    }

    const range = document.createRange();
    if (nodes.length === 0) {
      range.setStart(host, 0);
      range.collapse(true);
    } else {
      const full = nodes.map((n) => n.textContent ?? "").join("");
      const offset = pos === "start" ? 0 : pos === "end" ? full.length : Math.floor(full.length / 2);
      let remaining = offset;
      let target = nodes[nodes.length - 1]!;
      let local = (target.textContent ?? "").length;
      for (const textNode of nodes) {
        const len = (textNode.textContent ?? "").length;
        if (remaining <= len) {
          target = textNode;
          local = remaining;
          break;
        }
        remaining -= len;
      }
      range.setStart(target, local);
      range.collapse(true);
    }

    sel.removeAllRanges();
    sel.addRange(range);
    (document.querySelector("[data-gotipe-content]") as HTMLElement | null)?.focus();

    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  }, { id: blockId, pos: position });
}

export async function getSelectionContext(page: Page): Promise<{
  blockId: string | null;
  blockType: string | null;
  parentType: string | null;
}> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    const anchor = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const block = anchor?.closest("[data-block-id]") as HTMLElement | null;
    const parent = block?.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    return {
      blockId: block?.getAttribute("data-block-id") ?? null,
      blockType: block?.getAttribute("data-block-type") ?? null,
      parentType: parent?.getAttribute("data-block-type") ?? null,
    };
  });
}

export async function textOf(page: Page, blockId: string): Promise<string> {
  return page.evaluate((id) => {
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return "";
    const blockType = block.getAttribute("data-block-type");
    const host =
      blockType === "todoItem"
        ? (block.querySelector("[data-gotipe-todo-content]") as HTMLElement | null) ?? block
        : blockType === "callout"
          ? (block.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? block
          : block;
    return host.textContent ?? "";
  }, blockId);
}

export async function topLevelCount(page: Page, type: string): Promise<number> {
  return page.evaluate(
    (t) => document.querySelectorAll(`[data-gotipe-content] > [data-block-type="${t}"]`).length,
    type,
  );
}
