import type { GoTipeEditor } from "./editor";
import type { Step, Transaction } from "./types/state";

export class ChainableCommands {
  private steps: Step[] = [];

  constructor(private editor: GoTipeEditor) {}

  // Text formatting
  toggleBold(): this {
    return this.toggleMark("bold");
  }

  toggleItalic(): this {
    return this.toggleMark("italic");
  }

  toggleUnderline(): this {
    return this.toggleMark("underline");
  }

  toggleStrikethrough(): this {
    return this.toggleMark("strikethrough");
  }

  toggleCode(): this {
    return this.toggleMark("code");
  }

  toggleHighlight(color?: string): this {
    return this.toggleMark("highlight", color ? { color } : undefined);
  }

  toggleSuperscript(): this {
    return this.toggleMark("superscript");
  }

  toggleSubscript(): this {
    return this.toggleMark("subscript");
  }

  setLink(href: string, target?: string): this {
    const state = this.editor.getViewState();
    const sel = state.selection;
    if (sel.type !== "text") return this;
    this.steps.push({
      type: "addMark",
      blockId: sel.anchor.blockId,
      from: sel.anchor.offset,
      to: sel.head.offset,
      mark: { type: "link", attrs: { href, target: target ?? "_blank" } },
    });
    return this;
  }

  removeLink(): this {
    const state = this.editor.getViewState();
    const sel = state.selection;
    if (sel.type !== "text") return this;
    this.steps.push({
      type: "removeMark",
      blockId: sel.anchor.blockId,
      from: sel.anchor.offset,
      to: sel.head.offset,
      markType: "link",
    });
    return this;
  }

  toggleMark(markType: string, attrs?: Record<string, unknown>): this {
    const state = this.editor.getViewState();
    const isActive = state.toolbar.activeMarks.includes(markType);
    const sel = state.selection;
    if (sel.type !== "text") return this;

    if (isActive) {
      this.steps.push({
        type: "removeMark",
        blockId: sel.anchor.blockId,
        from: sel.anchor.offset,
        to: sel.head.offset,
        markType,
      });
    } else {
      this.steps.push({
        type: "addMark",
        blockId: sel.anchor.blockId,
        from: sel.anchor.offset,
        to: sel.head.offset,
        mark: {
          type: markType,
          attrs: (attrs ?? {}) as Record<string, string | number | boolean | null>,
        },
      });
    }
    return this;
  }

  addMark(markType: string, from?: number, to?: number, attrs?: Record<string, unknown>): this {
    const state = this.editor.getViewState();
    const sel = state.selection;
    const blockId = sel.anchor.blockId;
    this.steps.push({
      type: "addMark",
      blockId,
      from: from ?? sel.anchor.offset,
      to: to ?? sel.head.offset,
      mark: {
        type: markType,
        attrs: (attrs ?? {}) as Record<string, string | number | boolean | null>,
      },
    });
    return this;
  }

  removeMark(markType: string, from?: number, to?: number): this {
    const state = this.editor.getViewState();
    const sel = state.selection;
    const blockId = sel.anchor.blockId;
    this.steps.push({
      type: "removeMark",
      blockId,
      from: from ?? sel.anchor.offset,
      to: to ?? sel.head.offset,
      markType,
    });
    return this;
  }

  // Block operations
  setBlockType(type: string, attrs?: Record<string, unknown>): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    this.steps.push({
      type: "setBlockType",
      blockId,
      newType: type,
      attrs: (attrs ?? {}) as Record<string, string | number | boolean | null>,
    });
    return this;
  }

  setBlockAttrs(blockId: string, attrs: Record<string, unknown>): this {
    this.steps.push({
      type: "setBlockAttrs",
      blockId,
      attrs: attrs as Record<string, string | number | boolean | null>,
    });
    return this;
  }

  insertBlockAfter(type: string, attrs?: Record<string, unknown>): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const blockIndex = state.blocks.findIndex((b) => b.id === blockId);
    this.steps.push({
      type: "insertBlock",
      parentId: null,
      index: blockIndex + 1,
      block: {
        id: crypto.randomUUID(),
        type,
        attrs: (attrs ?? {}) as Record<string, string | number | boolean | null>,
        content: type === "divider" ? null : [],
        children: [],
      },
    });
    return this;
  }

  insertBlockBefore(type: string, attrs?: Record<string, unknown>): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const blockIndex = state.blocks.findIndex((b) => b.id === blockId);
    this.steps.push({
      type: "insertBlock",
      parentId: null,
      index: Math.max(0, blockIndex),
      block: {
        id: crypto.randomUUID(),
        type,
        attrs: (attrs ?? {}) as Record<string, string | number | boolean | null>,
        content: type === "divider" ? null : [],
        children: [],
      },
    });
    return this;
  }

  deleteBlock(blockId?: string): this {
    const state = this.editor.getViewState();
    const id = blockId ?? state.selection.anchor.blockId;
    this.steps.push({ type: "deleteBlock", blockId: id });
    return this;
  }

  moveBlockUp(blockId?: string): this {
    const state = this.editor.getViewState();
    const id = blockId ?? state.selection.anchor.blockId;
    const index = state.blocks.findIndex((b) => b.id === id);
    if (index > 0) {
      this.steps.push({ type: "moveBlock", blockId: id, newParentId: null, newIndex: index - 1 });
    }
    return this;
  }

  moveBlockDown(blockId?: string): this {
    const state = this.editor.getViewState();
    const id = blockId ?? state.selection.anchor.blockId;
    const index = state.blocks.findIndex((b) => b.id === id);
    if (index < state.blocks.length - 1) {
      this.steps.push({ type: "moveBlock", blockId: id, newParentId: null, newIndex: index + 1 });
    }
    return this;
  }

  duplicateBlock(blockId?: string): this {
    const state = this.editor.getViewState();
    const id = blockId ?? state.selection.anchor.blockId;
    const block = state.blocks.find((b) => b.id === id);
    if (block) {
      const index = state.blocks.indexOf(block);
      this.steps.push({
        type: "insertBlock",
        parentId: null,
        index: index + 1,
        block: {
          ...block,
          id: crypto.randomUUID(),
          content: Array.isArray(block.content)
            ? block.content.map((s) => ({ ...s, marks: s.marks.map((m) => ({ ...m })) }))
            : block.content,
          children: [],
        } as import("./types/block").Block,
      });
    }
    return this;
  }

  // Lists
  toggleBulletList(): this {
    return this.setBlockType("bulletList");
  }

  toggleOrderedList(attrs?: { start?: number }): this {
    return this.setBlockType("orderedList", attrs);
  }

  toggleTodoList(): this {
    return this.setBlockType("todoList");
  }

  indent(): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const index = state.blocks.findIndex((b) => b.id === blockId);
    if (index > 0) {
      const prevBlock = state.blocks[index - 1]!;
      this.steps.push({
        type: "moveBlock",
        blockId,
        newParentId: prevBlock.id,
        newIndex: prevBlock.children.length,
      });
    }
    return this;
  }

  outdent(): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    this.steps.push({
      type: "moveBlock",
      blockId,
      newParentId: null,
      newIndex: state.blocks.length,
    });
    return this;
  }

  // Block splitting/merging
  splitBlock(): this {
    const state = this.editor.getViewState();
    const sel = state.selection;
    this.steps.push({
      type: "splitBlock",
      blockId: sel.anchor.blockId,
      offset: sel.anchor.offset,
    });
    return this;
  }

  splitListItem(): this {
    return this.splitBlock();
  }

  mergeWithPrevious(): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const index = state.blocks.findIndex((b) => b.id === blockId);
    if (index > 0) {
      this.steps.push({
        type: "mergeBlocks",
        blockId,
        targetId: state.blocks[index - 1]!.id,
      });
    }
    return this;
  }

  insertHardBreak(): this {
    const state = this.editor.getViewState();
    const sel = state.selection;
    this.steps.push({
      type: "insertText",
      blockId: sel.anchor.blockId,
      offset: sel.anchor.offset,
      text: "\n",
      marks: [],
    });
    return this;
  }

  // Table
  insertTable(options: { rows: number; cols: number; withHeader?: boolean }): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const index = state.blocks.findIndex((b) => b.id === blockId);
    const rows: import("./types/block").Block[] = [];

    for (let r = 0; r < options.rows; r++) {
      const cells: import("./types/block").Block[] = [];
      for (let c = 0; c < options.cols; c++) {
        cells.push({
          id: crypto.randomUUID(),
          type: r === 0 && options.withHeader ? "tableHeader" : "tableCell",
          attrs: {},
          content: [],
          children: [],
        });
      }
      rows.push({
        id: crypto.randomUUID(),
        type: "tableRow",
        attrs: {},
        content: null,
        children: cells,
      });
    }

    this.steps.push({
      type: "insertBlock",
      parentId: null,
      index: index + 1,
      block: {
        id: crypto.randomUUID(),
        type: "table",
        attrs: {},
        content: null,
        children: rows,
      },
    });
    return this;
  }

  goToNextCell(): this {
    // Navigation handled at view level — this is a no-op step placeholder
    return this;
  }

  goToPrevCell(): this {
    return this;
  }

  // Selection
  selectAll(): this {
    // Handled via selection change, not steps
    return this;
  }

  selectBlock(_blockId?: string): this {
    return this;
  }

  // Text
  insertText(text: string): this {
    const state = this.editor.getViewState();
    const sel = state.selection;
    this.steps.push({
      type: "insertText",
      blockId: sel.anchor.blockId,
      offset: sel.anchor.offset,
      text,
      marks: [],
    });
    return this;
  }

  // History
  undo(): this {
    // Dispatched as metadata on the transaction
    return this;
  }

  redo(): this {
    return this;
  }

  // Focus
  focus(_position?: "start" | "end"): this {
    return this;
  }

  // Execute all queued commands as single Transaction
  run(): boolean {
    if (this.steps.length === 0) return false;
    const tr: Transaction = { steps: this.steps };
    this.editor.dispatch(tr);
    this.steps = [];
    return true;
  }
}
