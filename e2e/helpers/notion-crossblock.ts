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
  return page.evaluate(({ fromId, toId, from, to }) => {
    const root = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const fromBlock = document.querySelector(`[data-block-id="${fromId}"]`) as HTMLElement | null;
    const toBlock = document.querySelector(`[data-block-id="${toId}"]`) as HTMLElement | null;

    const firstText = (el: HTMLElement | null): Text | null => {
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if ((n.textContent ?? "").length > 0) return n as Text;
      }
      return null;
    };

    const a = firstText(fromBlock);
    const b = firstText(toBlock);
    if (!root || !a || !b) return "";

    const range = document.createRange();
    range.setStart(a, Math.min(from, a.length));
    range.setEnd(b, Math.min(to, b.length));

    const sel = window.getSelection();
    if (!sel) return "";
    sel.removeAllRanges();
    sel.addRange(range);
    root.focus();
    return sel.toString();
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
