import type { GoTipeEditor } from "./editor";
import type { BlockContent } from "./types/block";
import type { Step, Transaction } from "./types/state";
import type { BlockView } from "./types/view";

export class ChainableCommands {
  private steps: Step[] = [];
  /** @internal Set by cell navigation to signal that preventDefault should fire */
  _cellNavigated = false;

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

  setMark(markType: string, attrs?: Record<string, unknown>): this {
    return this.addMark(markType, undefined, undefined, attrs);
  }

  unsetMark(markType: string): this {
    return this.removeMark(markType);
  }

  clearFormatting(): this {
    const state = this.editor.getViewState();
    const sel = state.selection;
    if (sel.type !== "text") return this;
    for (const mark of state.toolbar.activeMarks) {
      this.steps.push({
        type: "removeMark",
        blockId: sel.anchor.blockId,
        from: sel.anchor.offset,
        to: sel.head.offset,
        markType: mark,
      });
    }
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

  private static readonly EMPTY_CONTENT_TYPES = new Set([
    "divider", "image", "columns", "column", "table", "tableRow",
  ]);

  private blockContent(type: string): BlockContent | null {
    return ChainableCommands.EMPTY_CONTENT_TYPES.has(type) ? null : ([] as unknown as BlockContent);
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
        content: this.blockContent(type),
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
        content: this.blockContent(type),
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

  moveBlock(blockId: string, targetIndex: number): this {
    this.steps.push({ type: "moveBlock", blockId, newParentId: null, newIndex: targetIndex });
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

  /**
   * Wrap the current paragraph into a bulletList > listItem structure,
   * or unwrap a listItem back to a paragraph.
   */
  toggleBulletList(): this {
    return this.toggleList("bulletList", "listItem");
  }

  toggleOrderedList(attrs?: { start?: number }): this {
    return this.toggleList("orderedList", "listItem", attrs);
  }

  toggleTodoList(): this {
    return this.toggleList("todoList", "todoItem");
  }

  private toggleList(
    listType: string,
    itemType: string,
    listAttrs?: Record<string, unknown>,
  ): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const block = this.findInTree(state.blocks, blockId);
    if (!block) return this;

    // Already a listItem inside the matching list type → unwrap to paragraph
    if (block.type === itemType || block.type === "listItem") {
      const parentInfo = this.findParentOf(state.blocks, blockId);
      if (parentInfo && parentInfo.parent.type === listType) {
        const listBlock = parentInfo.parent;
        const listLoc = this.findLocation(state.blocks, listBlock.id);
        if (listLoc) {
          this.steps.push({ type: "deleteBlock", blockId: listBlock.id });
          for (let i = 0; i < listBlock.children.length; i++) {
            const item = listBlock.children[i]!;
            this.steps.push({
              type: "insertBlock",
              parentId: listLoc.parentId,
              index: listLoc.index + i,
              block: {
                id: crypto.randomUUID(),
                type: "paragraph",
                attrs: {},
                content: (Array.isArray(item.content) ? item.content : []) as BlockContent,
                children: [],
              },
            });
          }
        }
        return this;
      }
    }

    // Paragraph or heading at top level → wrap in list
    if (block.type === "paragraph" || block.type === "heading") {
      const blockIndex = state.blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return this;

      this.steps.push({ type: "deleteBlock", blockId });
      this.steps.push({
        type: "insertBlock",
        parentId: null,
        index: blockIndex,
        block: {
          id: crypto.randomUUID(),
          type: listType,
          attrs: (listAttrs ?? {}) as Record<string, string | number | boolean | null>,
          content: null,
          children: [
            {
              id: crypto.randomUUID(),
              type: itemType,
              attrs: itemType === "todoItem" ? { checked: false } : {},
              content: (Array.isArray(block.content) ? block.content : []) as BlockContent,
              children: [],
            },
          ],
        },
      });
      return this;
    }

    return this.setBlockType(listType, listAttrs);
  }

  private findInTree(blocks: BlockView[], id: string): BlockView | null {
    for (const b of blocks) {
      if (b.id === id) return b;
      const found = this.findInTree(b.children, id);
      if (found) return found;
    }
    return null;
  }

  private findParentOf(
    blocks: BlockView[],
    childId: string,
  ): { parent: BlockView; index: number } | null {
    for (const b of blocks) {
      for (let i = 0; i < b.children.length; i++) {
        if (b.children[i]!.id === childId) return { parent: b, index: i };
      }
      const found = this.findParentOf(b.children, childId);
      if (found) return found;
    }
    return null;
  }

  private findLocation(
    blocks: BlockView[],
    id: string,
    parentId: string | null = null,
  ): { parentId: string | null; index: number } | null {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i]!.id === id) return { parentId, index: i };
      const found = this.findLocation(blocks[i]!.children, id, blocks[i]!.id);
      if (found) return found;
    }
    return null;
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

  insertColumns(count = 2): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const blockIndex = state.blocks.findIndex((b) => b.id === blockId);

    const columns: import("./types/block").Block[] = [];
    for (let i = 0; i < count; i++) {
      columns.push({
        id: crypto.randomUUID(),
        type: "column",
        attrs: {},
        content: null,
        children: [
          {
            id: crypto.randomUUID(),
            type: "paragraph",
            attrs: {},
            content: [],
            children: [],
          },
        ],
      });
    }

    this.steps.push({
      type: "insertBlock",
      parentId: null,
      index: blockIndex + 1,
      block: {
        id: crypto.randomUUID(),
        type: "columns",
        attrs: { count },
        content: null,
        children: columns,
      },
    });
    return this;
  }

  insertToggle(): this {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const blockIndex = state.blocks.findIndex((b) => b.id === blockId);

    this.steps.push({
      type: "insertBlock",
      parentId: null,
      index: blockIndex + 1,
      block: {
        id: crypto.randomUUID(),
        type: "toggle",
        attrs: { open: true },
        content: [{ text: "Toggle heading", marks: [] }],
        children: [
          {
            id: crypto.randomUUID(),
            type: "paragraph",
            attrs: {},
            content: [],
            children: [],
          },
        ],
      },
    });
    return this;
  }

  goToNextCell(): this {
    this.navigateCell("next");
    return this;
  }

  goToPrevCell(): this {
    this.navigateCell("prev");
    return this;
  }

  private navigateCell(direction: "next" | "prev"): void {
    const state = this.editor.getViewState();
    const blockId = state.selection.anchor.blockId;
    const cell = this.findCellNavTarget(state.blocks, blockId, direction);
    if (!cell) return;

    // Find the target cell DOM element and set selection into it
    const cellEl = document.querySelector(`[data-block-id="${cell.id}"]`);
    if (!cellEl) return;

    const sel = window.getSelection();
    if (!sel) return;

    // Find the first text node or focus the element itself
    const walker = document.createTreeWalker(cellEl, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    const range = document.createRange();
    if (textNode) {
      range.setStart(textNode, 0);
      range.setEnd(textNode, textNode.textContent?.length ?? 0);
    } else {
      range.selectNodeContents(cellEl);
    }
    sel.removeAllRanges();
    sel.addRange(range);

    // Mark that navigation happened so the keybinding can preventDefault
    this._cellNavigated = true;
  }

  private findCellNavTarget(
    blocks: BlockView[],
    currentCellId: string,
    direction: "next" | "prev",
  ): BlockView | null {
    // Collect all cells in document order
    const cells: BlockView[] = [];
    const collectCells = (bs: BlockView[]) => {
      for (const b of bs) {
        if (b.type === "tableCell" || b.type === "tableHeader") {
          cells.push(b);
        }
        collectCells(b.children);
      }
    };
    collectCells(blocks);
    const idx = cells.findIndex((c) => c.id === currentCellId);
    if (idx === -1) return null;
    if (direction === "next") return cells[idx + 1] ?? null;
    return cells[idx - 1] ?? null;
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
  private _undo = false;
  private _redo = false;

  undo(): this {
    this._undo = true;
    return this;
  }

  redo(): this {
    this._redo = true;
    return this;
  }

  // Focus
  focus(_position?: "start" | "end"): this {
    return this;
  }

  // Execute all queued commands as single Transaction
  run(): boolean {
    // Handle undo/redo before normal steps
    if (this._undo) {
      this._undo = false;
      return this.editor.undo();
    }
    if (this._redo) {
      this._redo = false;
      return this.editor.redo();
    }

    if (this.steps.length === 0 && !this._cellNavigated) return false;
    if (this.steps.length > 0) {
      const tr: Transaction = { steps: this.steps };
      this.editor.dispatch(tr);
      this.steps = [];
    }
    return true;
  }
}
