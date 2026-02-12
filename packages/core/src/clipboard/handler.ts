import type { GoTipeEditor } from "../editor";
import { sanitizeHtml } from "../security/sanitizer";
import type { Block } from "../types/block";

export class ClipboardHandler {
  constructor(private editor: GoTipeEditor) {}

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();

    const data = event.clipboardData;
    if (!data) return;

    // 1. Internal GoTipe JSON (from copy within editor)
    const internalJson = data.getData("application/x-gotipe");
    if (internalJson) {
      try {
        const blocks = JSON.parse(internalJson) as Block[];
        for (const block of blocks) {
          this.editor
            .chain()
            .insertBlockAfter(block.type, block.attrs as Record<string, unknown>)
            .run();
        }
      } catch {
        // Ignore malformed internal data
      }
      return;
    }

    // 2. HTML
    const html = data.getData("text/html");
    if (html) {
      const sanitized = sanitizeHtml(html);
      // Parse sanitized HTML into blocks and insert
      this.editor.dispatch({
        steps: [
          {
            type: "insertText",
            blockId: this.editor.getViewState().selection.anchor.blockId,
            offset: this.editor.getViewState().selection.anchor.offset,
            text: this.stripTags(sanitized),
            marks: [],
          },
        ],
      });
      return;
    }

    // 3. Plain text (with markdown detection)
    const plain = data.getData("text/plain");
    if (plain) {
      if (this.looksLikeMarkdown(plain)) {
        // For now, insert as plain text; full MD parsing done via WASM
        this.insertPlainText(plain);
      } else {
        this.insertPlainText(plain);
      }
    }
  }

  onCopy(event: ClipboardEvent): void {
    event.preventDefault();
    const data = event.clipboardData;
    if (!data) return;

    const state = this.editor.getViewState();
    const sel = state.selection;

    if (sel.type === "text") {
      const block = state.blocks.find((b) => b.id === sel.anchor.blockId);
      if (block && Array.isArray(block.content)) {
        const text = block.content.map((s) => s.text).join("");
        const selectedText = text.slice(sel.anchor.offset, sel.head.offset);
        data.setData("text/plain", selectedText);
        data.setData("text/html", `<p>${selectedText}</p>`);
        data.setData(
          "application/x-gotipe",
          JSON.stringify([
            {
              id: crypto.randomUUID(),
              type: block.type,
              attrs: block.attrs,
              content: block.content.slice(sel.anchor.offset, sel.head.offset),
              children: [],
            },
          ]),
        );
      }
    } else if (sel.type === "block") {
      const block = state.blocks.find((b) => b.id === sel.anchor.blockId);
      if (block) {
        const text = Array.isArray(block.content)
          ? block.content.map((s) => s.text).join("")
          : (block.content ?? "");
        data.setData("text/plain", text);
        data.setData("application/x-gotipe", JSON.stringify([block]));
      }
    }
  }

  onCut(event: ClipboardEvent): void {
    this.onCopy(event);
    const state = this.editor.getViewState();
    const sel = state.selection;

    if (sel.type === "text") {
      this.editor.dispatch({
        steps: [
          {
            type: "deleteText",
            blockId: sel.anchor.blockId,
            from: sel.anchor.offset,
            to: sel.head.offset,
          },
        ],
      });
    } else if (sel.type === "block") {
      this.editor.chain().deleteBlock(sel.anchor.blockId).run();
    }
  }

  private looksLikeMarkdown(text: string): boolean {
    return /^#{1,6}\s|^\s*[-*]\s|^\s*\d+\.\s|\*\*.+\*\*|`.+`/.test(text);
  }

  private insertPlainText(text: string): void {
    const lines = text.split("\n");
    const state = this.editor.getViewState();

    if (lines.length === 1) {
      this.editor.dispatch({
        steps: [
          {
            type: "insertText",
            blockId: state.selection.anchor.blockId,
            offset: state.selection.anchor.offset,
            text: lines[0]!,
            marks: [],
          },
        ],
      });
    } else {
      // Multi-line: insert first line into current block, rest as new paragraphs
      const steps: import("../types/state").Step[] = [
        {
          type: "insertText",
          blockId: state.selection.anchor.blockId,
          offset: state.selection.anchor.offset,
          text: lines[0]!,
          marks: [],
        },
      ];

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

  private stripTags(html: string): string {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return doc.body.textContent || "";
    }
    return html.replace(/<[^>]*>/g, "");
  }
}
