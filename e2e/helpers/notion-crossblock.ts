import type { Page } from "@playwright/test";

export type MarkName = "bold" | "italic" | "underline" | "strikethrough" | "code";
export type Span = { text: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

type EditorWithSelection = {
  setSelection?: (selection: {
    anchor: { blockId: string; offset: number };
    head: { blockId: string; offset: number };
  }) => void;
  focus?: () => void;
};

type EditorWithHistory = {
  undo?: () => boolean;
  redo?: () => boolean;
};

type EditorWithView = {
  getViewState?: () => { blocks: unknown };
};

export function mod(key: string): string {
  return process.platform === "darwin" ? `Meta+${key}` : `Control+${key}`;
}

export function spans(text: string): Span[] {
  return [{ text, marks: [] }];
}

export async function setSelection(
  page: Page,
  anchor: { blockId: string; offset: number },
  head = anchor,
): Promise<void> {
  await page.evaluate(({ anchor, head }) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | EditorWithSelection
      | undefined;
    editor?.setSelection?.({ anchor, head });
    editor?.focus?.();
  }, { anchor, head });
}

export async function selectAcross(
  page: Page,
  fromId: string,
  toId: string,
  from = 1,
  to = 6,
): Promise<string> {
  return page.evaluate(async ({ fromId, toId, from, to }) => {
    // Let the previous model edit finish its scheduled caret restoration first.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const root = document.querySelector<HTMLElement>("[data-gotipe-content]");
    if (!root) throw new Error("Editor content is missing");
    const point = (id: string, offset: number) => {
      const block = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
      if (!block) throw new Error(`Cannot select missing block ${id}`);
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          return parent?.closest("[data-block-id]") === block &&
            !parent.closest('button, select, input, [contenteditable="false"]')
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      let remaining = offset;
      let last: Node | null = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        last = node;
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) return { node, offset: remaining };
        remaining -= length;
      }
      if (!last) throw new Error(`Cannot select text in empty block ${id}`);
      return { node: last, offset: last.textContent?.length ?? 0 };
    };
    const anchor = point(fromId, from);
    const head = point(toId, to);
    root.focus();
    const selection = window.getSelection();
    if (!selection) throw new Error("Browser selection is unavailable");
    selection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    return selection.toString();
  }, { fromId, toId, from, to });
}

export async function toggleMark(page: Page, mark: MarkName): Promise<void> {
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

export async function undo(page: Page, n = 1): Promise<void> {
  await page.evaluate((k) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | EditorWithHistory
      | undefined;
    for (let i = 0; i < k; i++) editor?.undo?.();
  }, n);
}

export async function redo(page: Page, n = 1): Promise<void> {
  await page.evaluate((k) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | EditorWithHistory
      | undefined;
    for (let i = 0; i < k; i++) editor?.redo?.();
  }, n);
}

export async function snapshot(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify(
      ((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as EditorWithView | undefined)
        ?.getViewState?.().blocks ?? [],
    ),
  );
}

export async function getDocStats(
  page: Page,
): Promise<{
  hasInvalidId: boolean;
  text: string;
  blockCount: number;
  markCount: number;
  maxDepth: number;
}> {
  return page.evaluate(() => {
    type Block = {
      id: string;
      content: Array<{ text: string; marks?: Array<{ type: string }> }> | string | null;
      children: Block[];
    };

    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];

    let hasInvalidId = false;
    let blockCount = 0;
    let markCount = 0;
    let maxDepth = 0;
    const text: string[] = [];

    const walk = (nodes: Block[], depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      for (const node of nodes) {
        blockCount++;
        if (!node.id || typeof node.id !== "string") hasInvalidId = true;
        if (Array.isArray(node.content)) {
          text.push(node.content.map((s) => s.text ?? "").join(""));
          for (const s of node.content) markCount += s.marks?.length ?? 0;
        } else if (typeof node.content === "string") {
          text.push(node.content);
        }
        if (node.children?.length) walk(node.children, depth + 1);
      }
    };

    walk(blocks, 1);
    return { hasInvalidId, text: text.join("\n"), blockCount, markCount, maxDepth };
  });
}
