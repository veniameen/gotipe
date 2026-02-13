import type { GoTipeEditor } from "./editor";
import type { BlockContent } from "./types/block";
import type { Step, Transaction } from "./types/state";
import type { BlockView } from "./types/view";

export class ChainableCommands {
  private steps: Step[] = [];
  /** @internal Set by cell navigation to signal that preventDefault should fire */
  _cellNavigated = false;
  private _focusPosition: "start" | "end" | undefined | null = null;
  private static readonly LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);
  private static readonly LIST_ITEM_TYPES = new Set(["listItem", "todoItem"]);

  constructor(private editor: GoTipeEditor) {}

  private getViewState() {
    return this.editor.getViewState();
  }

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
    const state = this.getViewState();
    const sel = state.selection;
    if (sel.type !== "text") return this;
    const from = Math.min(sel.anchor.offset, sel.head.offset);
    const to = Math.max(sel.anchor.offset, sel.head.offset);
    this.steps.push({
      type: "addMark",
      blockId: sel.anchor.blockId,
      from,
      to,
      mark: { type: "link", attrs: { href, target: target ?? "_blank" } },
    });
    return this;
  }

  removeLink(): this {
    const state = this.getViewState();
    const sel = state.selection;
    if (sel.type !== "text") return this;
    const from = Math.min(sel.anchor.offset, sel.head.offset);
    const to = Math.max(sel.anchor.offset, sel.head.offset);
    this.steps.push({
      type: "removeMark",
      blockId: sel.anchor.blockId,
      from,
      to,
      markType: "link",
    });
    return this;
  }

  toggleMark(markType: string, attrs?: Record<string, unknown>): this {
    const state = this.getViewState();
    const isActive = state.toolbar.activeMarks.includes(markType);
    const sel = state.selection;
    if (sel.type !== "text") return this;
    const from = Math.min(sel.anchor.offset, sel.head.offset);
    const to = Math.max(sel.anchor.offset, sel.head.offset);

    if (isActive) {
      this.steps.push({
        type: "removeMark",
        blockId: sel.anchor.blockId,
        from,
        to,
        markType,
      });
    } else {
      this.steps.push({
        type: "addMark",
        blockId: sel.anchor.blockId,
        from,
        to,
        mark: {
          type: markType,
          attrs: (attrs ?? {}) as Record<string, string | number | boolean | null>,
        },
      });
    }
    return this;
  }

  addMark(markType: string, from?: number, to?: number, attrs?: Record<string, unknown>): this {
    const state = this.getViewState();
    const sel = state.selection;
    const blockId = sel.anchor.blockId;
    const computedFrom = from ?? Math.min(sel.anchor.offset, sel.head.offset);
    const computedTo = to ?? Math.max(sel.anchor.offset, sel.head.offset);
    this.steps.push({
      type: "addMark",
      blockId,
      from: Math.min(computedFrom, computedTo),
      to: Math.max(computedFrom, computedTo),
      mark: {
        type: markType,
        attrs: (attrs ?? {}) as Record<string, string | number | boolean | null>,
      },
    });
    return this;
  }

  removeMark(markType: string, from?: number, to?: number): this {
    const state = this.getViewState();
    const sel = state.selection;
    const blockId = sel.anchor.blockId;
    const computedFrom = from ?? Math.min(sel.anchor.offset, sel.head.offset);
    const computedTo = to ?? Math.max(sel.anchor.offset, sel.head.offset);
    this.steps.push({
      type: "removeMark",
      blockId,
      from: Math.min(computedFrom, computedTo),
      to: Math.max(computedFrom, computedTo),
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
    const state = this.getViewState();
    const sel = state.selection;
    if (sel.type !== "text") return this;
    const from = Math.min(sel.anchor.offset, sel.head.offset);
    const to = Math.max(sel.anchor.offset, sel.head.offset);
    for (const mark of state.toolbar.activeMarks) {
      this.steps.push({
        type: "removeMark",
        blockId: sel.anchor.blockId,
        from,
        to,
        markType: mark,
      });
    }
    return this;
  }

  // Block operations
  setBlockType(type: string, attrs?: Record<string, unknown>): this {
    const state = this.getViewState();
    const blockId = state.selection.anchor.blockId;
    const block = this.findInTree(state.blocks, blockId);
    if (!block) return this;

    const parentInfo = this.findParentOf(state.blocks, blockId);
    const parent = parentInfo?.parent;
    const insideList =
      !!parent &&
      ChainableCommands.LIST_TYPES.has(parent.type) &&
      ChainableCommands.LIST_ITEM_TYPES.has(block.type);

    // Converting a list item to any non-list-item block should lift it out of the list.
    if (insideList && !ChainableCommands.LIST_ITEM_TYPES.has(type)) {
      const listLoc = this.findLocation(state.blocks, parent.id);
      if (listLoc) {
        const liftedBlock = {
          id: crypto.randomUUID(),
          type,
          attrs: (attrs ?? {}) as Record<string, string | number | boolean | null>,
          content: (Array.isArray(block.content) ? block.content : []) as BlockContent,
          children: [],
        };

        if (parent.children.length === 1) {
          this.steps.push({ type: "deleteBlock", blockId: parent.id });
          this.steps.push({
            type: "insertBlock",
            parentId: listLoc.parentId,
            index: listLoc.index,
            block: liftedBlock,
          });
        } else {
          this.steps.push({ type: "deleteBlock", blockId });
          this.steps.push({
            type: "insertBlock",
            parentId: listLoc.parentId,
            index: listLoc.index + 1,
            block: liftedBlock,
          });
        }
        return this;
      }
    }

    // Ensure todo items always keep a checked attr when directly converted.
    const normalizedAttrs =
      type === "todoItem"
        ? ({
            checked:
              typeof attrs?.checked === "boolean"
                ? attrs.checked
                : typeof block.attrs.checked === "boolean"
                  ? block.attrs.checked
                  : false,
          } as Record<string, string | number | boolean | null>)
        : ((attrs ?? {}) as Record<string, string | number | boolean | null>);

    this.steps.push({
      type: "setBlockType",
      blockId,
      newType: type,
      attrs: normalizedAttrs,
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

  private listItemAttrs(
    itemType: "listItem" | "todoItem",
    source?: BlockView,
  ): Record<string, string | number | boolean | null> {
    if (itemType === "todoItem") {
      return {
        checked:
          typeof source?.attrs.checked === "boolean" ? source.attrs.checked : false,
      };
    }
    return {};
  }

  private blockContent(type: string): BlockContent | null {
    return ChainableCommands.EMPTY_CONTENT_TYPES.has(type) ? null : ([] as unknown as BlockContent);
  }

  insertBlockAfter(type: string, attrs?: Record<string, unknown>): this {
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
    const id = blockId ?? state.selection.anchor.blockId;
    this.steps.push({ type: "deleteBlock", blockId: id });
    return this;
  }

  moveBlockUp(blockId?: string): this {
    const state = this.getViewState();
    const id = blockId ?? state.selection.anchor.blockId;
    const index = state.blocks.findIndex((b) => b.id === id);
    if (index > 0) {
      this.steps.push({ type: "moveBlock", blockId: id, newParentId: null, newIndex: index - 1 });
    }
    return this;
  }

  moveBlockDown(blockId?: string): this {
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
    const blockId = state.selection.anchor.blockId;
    const block = this.findInTree(state.blocks, blockId);
    if (!block) return this;

    const parentInfo = this.findParentOf(state.blocks, blockId);
    if (
      parentInfo &&
      ChainableCommands.LIST_TYPES.has(parentInfo.parent.type) &&
      ChainableCommands.LIST_ITEM_TYPES.has(block.type)
    ) {
      const listBlock = parentInfo.parent;

      // Same list command on current list type toggles it off (unwrap to paragraphs).
      if (listBlock.type === listType && block.type === itemType) {
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

      // Convert list kind in-place (bullet <-> ordered <-> todo) to avoid losing the active row.
      this.steps.push({
        type: "setBlockType",
        blockId: listBlock.id,
        newType: listType,
        attrs: (listAttrs ?? {}) as Record<string, string | number | boolean | null>,
      });

      for (const item of listBlock.children) {
        this.steps.push({
          type: "setBlockType",
          blockId: item.id,
          newType: itemType,
          attrs: this.listItemAttrs(itemType as "listItem" | "todoItem", item),
        });
      }
      return this;
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
              attrs: this.listItemAttrs(itemType as "listItem" | "todoItem", block),
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    const state = this.getViewState();
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
    this._focusPosition = _position;
    return this;
  }

  // Execute all queued commands as single Transaction
  run(): boolean {
    let didFocus = false;
    if (this._focusPosition !== null) {
      this.editor.focus(this._focusPosition);
      this._focusPosition = null;
      didFocus = true;
    }

    // Handle undo/redo before normal steps
    if (this._undo) {
      this._undo = false;
      return this.editor.undo();
    }
    if (this._redo) {
      this._redo = false;
      return this.editor.redo();
    }

    const cellNavigated = this._cellNavigated;
    this._cellNavigated = false;

    if (this.steps.length === 0 && !cellNavigated) return didFocus;
    if (this.steps.length > 0) {
      const preserveSelectionTypes = new Set(["addMark", "removeMark", "setBlockType", "setBlockAttrs"]);
      const shouldPreserveSelection = didFocus && this.steps.every((step) => preserveSelectionTypes.has(step.type));
      const selectionBefore = shouldPreserveSelection
        ? (() => {
            const markStep = this.steps.find((step) => step.type === "addMark" || step.type === "removeMark");
            if (markStep && "from" in markStep && "to" in markStep && "blockId" in markStep) {
              const from = Math.min(markStep.from, markStep.to);
              const to = Math.max(markStep.from, markStep.to);
              return {
                anchor: { blockId: markStep.blockId, offset: from },
                head: { blockId: markStep.blockId, offset: to },
              };
            }

            const sel = this.getViewState().selection;
            return {
              anchor: { ...sel.anchor },
              head: { ...sel.head },
            };
          })()
        : null;

      const tr: Transaction = { steps: this.steps };
      this.editor.dispatch(tr);
      if (selectionBefore) {
        this.editor.setSelection(selectionBefore);
      } else if (didFocus) {
        // Re-apply DOM range after mutation/re-render to avoid native selection drift.
        this.editor.focus();
      }
      this.steps = [];
    }
    return true;
  }
}
