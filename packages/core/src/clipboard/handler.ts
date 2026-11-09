import type { GoTipeEditor } from "../editor";
import { sanitizeHtml } from "../security/sanitizer";
import type { AttrValue, Block, Mark } from "../types/block";
import type { Step } from "../types/state";

export class ClipboardHandler {
  private pendingShortcutFallbackTimer: number | null = null;
  private lastPasteEventTimestamp = 0;

  constructor(private editor: GoTipeEditor) {}

  onPaste(event: ClipboardEvent): void {
    this.editor.syncSelectionFromDOM();
    this.lastPasteEventTimestamp = Date.now();
    this.clearPendingShortcutFallback();
    event.preventDefault();

    const data = event.clipboardData;
    if (data) {
      // 1. Internal GoTipe JSON (from copy within editor)
      const internalJson = data.getData("application/x-gotipe");
      if (internalJson) {
        try {
          const payload = JSON.parse(internalJson) as { blocks?: Block[]; spans?: { text: string; marks: Mark[] }[] };
          if (payload.spans && payload.spans.length > 0) {
            this.deleteSelectionIfNeeded();
            // Inline content — insert spans into current block
            this.insertSpans(payload.spans);
            return;
          }
          if (payload.blocks && payload.blocks.length > 0) {
            this.deleteSelectionIfNeeded();
            this.insertBlocks(payload.blocks);
            return;
          }
        } catch {
          // Ignore malformed internal data
        }
      }

      // 2. HTML
      const html = data.getData("text/html");
      if (html) {
        const sanitized = sanitizeHtml(html);
        const blocks = this.parseHtmlToBlocks(sanitized);
        if (blocks.length > 0) {
          this.deleteSelectionIfNeeded();
          this.insertParsedBlocks(blocks);
          return;
        }
      }

      // 3. Plain text (with markdown detection)
      const plain = data.getData("text/plain");
      if (plain) {
        this.deleteSelectionIfNeeded();
        this.insertPlainText(plain);
        return;
      }
    }

    // Chromium shortcut paste can occasionally dispatch with empty DataTransfer.
    // Try async clipboard read as a last-resort fallback.
    this.tryAsyncPlainTextPaste();
  }

  onPasteShortcut(): void {
    if (typeof window === "undefined") return;
    this.clearPendingShortcutFallback();
    const shortcutTimestamp = Date.now();
    this.pendingShortcutFallbackTimer = window.setTimeout(() => {
      this.pendingShortcutFallbackTimer = null;
      // Real paste event won the race; do not duplicate insertion.
      if (this.lastPasteEventTimestamp >= shortcutTimestamp) return;
      this.tryAsyncPlainTextPaste();
    }, 24);
  }

  canReadClipboardText(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.clipboard &&
      typeof navigator.clipboard.readText === "function"
    );
  }

  pasteFromSystemClipboard(): void {
    if (!this.canReadClipboardText()) return;
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (!text) return;
        this.editor.syncSelectionFromDOM();
        this.deleteSelectionIfNeeded();
        this.insertPlainText(text);
      })
      .catch(() => {
        // Leave as no-op when browser blocks clipboard read.
      });
  }

  onCopy(event: ClipboardEvent): void {
    this.editor.syncSelectionFromDOM();
    event.preventDefault();
    const data = event.clipboardData;
    if (!data) return;

    const state = this.editor.getViewState();
    const sel = state.selection;

    if (sel.type === "text") {
      const block = state.blocks.find((b) => b.id === sel.anchor.blockId);
      if (block && Array.isArray(block.content)) {
        const from = Math.min(sel.anchor.offset, sel.head.offset);
        const to = Math.max(sel.anchor.offset, sel.head.offset);

        // Extract selected spans preserving marks
        const selectedSpans = this.extractSpans(block.content as { text: string; marks: Mark[] }[], from, to);
        const selectedText = selectedSpans.map((s) => s.text).join("");

        data.setData("text/plain", selectedText);
        data.setData("text/html", this.spansToHtml(selectedSpans));
        data.setData(
          "application/x-gotipe",
          JSON.stringify({ spans: selectedSpans }),
        );
      }
    } else if (sel.type === "block") {
      const block = state.blocks.find((b) => b.id === sel.anchor.blockId);
      if (block) {
        const text = Array.isArray(block.content)
          ? block.content.map((s) => s.text).join("")
          : (block.content ?? "");
        data.setData("text/plain", String(text));
        data.setData("application/x-gotipe", JSON.stringify({ blocks: [block] }));
      }
    }
  }

  onCut(event: ClipboardEvent): void {
    this.editor.syncSelectionFromDOM();
    this.onCopy(event);
    const state = this.editor.getViewState();
    const sel = state.selection;

    if (sel.type === "text") {
      const from = Math.min(sel.anchor.offset, sel.head.offset);
      const to = Math.max(sel.anchor.offset, sel.head.offset);
      if (from !== to) {
        this.editor.dispatch({
          steps: [{ type: "deleteText", blockId: sel.anchor.blockId, from, to }],
        });
      }
    } else if (sel.type === "block") {
      this.editor.chain().deleteBlock(sel.anchor.blockId).run();
    }
  }

  /** Delete current selection before inserting pasted content */
  private deleteSelectionIfNeeded(): void {
    const state = this.editor.getViewState();
    const sel = state.selection;
    if (sel.type === "text") {
      const from = Math.min(sel.anchor.offset, sel.head.offset);
      const to = Math.max(sel.anchor.offset, sel.head.offset);
      if (from !== to) {
        this.editor.dispatch({
          steps: [{ type: "deleteText", blockId: sel.anchor.blockId, from, to }],
        });
      }
    }
  }

  /** Extract spans from content within a character range, preserving marks */
  private extractSpans(
    content: { text: string; marks: Mark[] }[],
    from: number,
    to: number,
  ): { text: string; marks: Mark[] }[] {
    const result: { text: string; marks: Mark[] }[] = [];
    let pos = 0;
    for (const span of content) {
      const spanEnd = pos + span.text.length;
      if (spanEnd <= from) { pos = spanEnd; continue; }
      if (pos >= to) break;
      const sliceFrom = Math.max(from - pos, 0);
      const sliceTo = Math.min(to - pos, span.text.length);
      result.push({ text: span.text.slice(sliceFrom, sliceTo), marks: [...span.marks] });
      pos = spanEnd;
    }
    return result;
  }

  /** Convert spans to HTML for clipboard */
  private spansToHtml(spans: { text: string; marks: Mark[] }[]): string {
    const inner = spans.map((span) => {
      let html = this.escapeHtml(span.text);
      for (const mark of span.marks) {
        switch (mark.type) {
          case "bold": html = `<strong>${html}</strong>`; break;
          case "italic": html = `<em>${html}</em>`; break;
          case "underline": html = `<u>${html}</u>`; break;
          case "strikethrough": html = `<s>${html}</s>`; break;
          case "code": html = `<code>${html}</code>`; break;
          case "superscript": html = `<sup>${html}</sup>`; break;
          case "subscript": html = `<sub>${html}</sub>`; break;
          case "link": {
            const href = this.escapeHtml(String((mark.attrs as Record<string, string>)?.href ?? ""));
            html = `<a href="${href}">${html}</a>`;
            break;
          }
          case "highlight": {
            const color = (mark.attrs as Record<string, string>)?.color;
            html = color ? `<mark style="background:${this.escapeHtml(color)}">${html}</mark>` : `<mark>${html}</mark>`;
            break;
          }
        }
      }
      return html;
    }).join("");
    return `<p>${inner}</p>`;
  }

  /** Parse sanitized HTML into block-like structures */
  private parseHtmlToBlocks(html: string): { type: string; content: string; attrs: Record<string, unknown> }[] {
    if (typeof DOMParser === "undefined") {
      return [{ type: "paragraph", content: html.replace(/<[^>]*>/g, ""), attrs: {} }];
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks: { type: string; content: string; attrs: Record<string, unknown> }[] = [];

    for (const node of Array.from(doc.body.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) blocks.push({ type: "paragraph", content: text, attrs: {} });
        continue;
      }
      if (!(node instanceof HTMLElement)) continue;

      const tag = node.tagName.toLowerCase();
      const text = node.textContent || "";

      switch (tag) {
        case "h1": blocks.push({ type: "heading", content: text, attrs: { level: 1 } }); break;
        case "h2": blocks.push({ type: "heading", content: text, attrs: { level: 2 } }); break;
        case "h3": blocks.push({ type: "heading", content: text, attrs: { level: 3 } }); break;
        case "h4": blocks.push({ type: "heading", content: text, attrs: { level: 4 } }); break;
        case "h5": blocks.push({ type: "heading", content: text, attrs: { level: 5 } }); break;
        case "h6": blocks.push({ type: "heading", content: text, attrs: { level: 6 } }); break;
        case "pre": {
          const code = node.querySelector("code");
          const lang = code?.className?.replace("language-", "") || "plain";
          blocks.push({ type: "codeBlock", content: code?.textContent || text, attrs: { language: lang } });
          break;
        }
        case "blockquote":
          blocks.push({ type: "blockquote", content: text, attrs: {} });
          break;
        case "hr":
          blocks.push({ type: "divider", content: "", attrs: {} });
          break;
        case "ul":
        case "ol": {
          // Flatten list items into separate paragraph entries for simplicity
          for (const li of Array.from(node.querySelectorAll("li"))) {
            blocks.push({ type: "paragraph", content: li.textContent || "", attrs: {} });
          }
          break;
        }
        default:
          if (text.trim()) blocks.push({ type: "paragraph", content: text, attrs: {} });
          break;
      }
    }

    return blocks;
  }

  /** Insert parsed HTML blocks */
  private insertParsedBlocks(blocks: { type: string; content: string; attrs: Record<string, unknown> }[]): void {
    const state = this.editor.getViewState();
    const blockIndex = state.blocks.findIndex((b) => b.id === state.selection.anchor.blockId);

    if (blocks.length === 1 && blocks[0]!.type === "paragraph") {
      // Single paragraph — insert as text into current block
      this.editor.dispatch({
        steps: [{
          type: "insertText",
          blockId: state.selection.anchor.blockId,
          offset: state.selection.anchor.offset,
          text: blocks[0]!.content,
          marks: [],
        }],
      });
      return;
    }

    // Multiple blocks — insert first as text, rest as new blocks
    const steps: Step[] = [];
    if (blocks[0]!.content) {
      steps.push({
        type: "insertText",
        blockId: state.selection.anchor.blockId,
        offset: state.selection.anchor.offset,
        text: blocks[0]!.content,
        marks: [],
      });
    }

    for (let i = 1; i < blocks.length; i++) {
      const b = blocks[i]!;
      if (b.type === "divider") {
        steps.push({
          type: "insertBlock",
          parentId: null,
          index: blockIndex + i,
          block: {
            id: crypto.randomUUID(),
            type: "divider",
            attrs: {},
            content: null,
            children: [],
          },
        });
      } else if (b.type === "codeBlock") {
        steps.push({
          type: "insertBlock",
          parentId: null,
          index: blockIndex + i,
          block: {
            id: crypto.randomUUID(),
            type: "codeBlock",
            attrs: b.attrs as Record<string, AttrValue>,
            content: b.content,
            children: [],
          },
        });
      } else {
        steps.push({
          type: "insertBlock",
          parentId: null,
          index: blockIndex + i,
          block: {
            id: crypto.randomUUID(),
            type: b.type,
            attrs: b.attrs as Record<string, AttrValue>,
            content: b.content ? [{ text: b.content, marks: [] }] : [],
            children: [],
          },
        });
      }
    }

    if (steps.length > 0) {
      this.editor.dispatch({ steps });
    }
  }

  /** Insert internal spans into current block */
  private insertSpans(spans: { text: string; marks: Mark[] }[]): void {
    const state = this.editor.getViewState();
    const sel = state.selection;
    const text = spans.map((s) => s.text).join("");

    // Insert text first
    this.editor.dispatch({
      steps: [{
        type: "insertText",
        blockId: sel.anchor.blockId,
        offset: sel.anchor.offset,
        text,
        marks: [],
      }],
    });

    // Then apply marks for each span
    let offset = sel.anchor.offset;
    for (const span of spans) {
      for (const mark of span.marks) {
        this.editor.dispatch({
          steps: [{
            type: "addMark",
            blockId: sel.anchor.blockId,
            from: offset,
            to: offset + span.text.length,
            mark,
          }],
        });
      }
      offset += span.text.length;
    }
  }

  /** Insert internal blocks after current block */
  private insertBlocks(blocks: Block[]): void {
    const state = this.editor.getViewState();
    const blockIndex = state.blocks.findIndex((b) => b.id === state.selection.anchor.blockId);

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;
      this.editor.dispatch({
        steps: [{
          type: "insertBlock",
          parentId: null,
          index: blockIndex + 1 + i,
          block: {
            ...block,
            id: crypto.randomUUID(),
          },
        }],
      });
    }
  }

  private insertPlainText(text: string): void {
    const lines = text.split("\n");
    const state = this.editor.getViewState();

    if (lines.length === 1) {
      this.editor.dispatch({
        steps: [{
          type: "insertText",
          blockId: state.selection.anchor.blockId,
          offset: state.selection.anchor.offset,
          text: lines[0]!,
          marks: [],
        }],
      });
    } else {
      // Multi-line: insert first line into current block, rest as new paragraphs
      const steps: Step[] = [{
        type: "insertText",
        blockId: state.selection.anchor.blockId,
        offset: state.selection.anchor.offset,
        text: lines[0]!,
        marks: [],
      }];

      const blockIndex = state.blocks.findIndex((b) => b.id === state.selection.anchor.blockId);
      for (let i = 1; i < lines.length; i++) {
        steps.push({
          type: "insertBlock",
          parentId: null,
          index: blockIndex + i,
          block: {
            id: crypto.randomUUID(),
            type: "paragraph",
            attrs: {},
            content: [{ text: lines[i]!, marks: [] }],
            children: [],
          },
        });
      }

      this.editor.dispatch({ steps });
    }
  }

  private tryAsyncPlainTextPaste(): void {
    if (!this.canReadClipboardText()) return;
    this.pasteFromSystemClipboard();
  }

  private clearPendingShortcutFallback(): void {
    if (typeof window === "undefined") return;
    if (this.pendingShortcutFallbackTimer === null) return;
    window.clearTimeout(this.pendingShortcutFallbackTimer);
    this.pendingShortcutFallbackTimer = null;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
