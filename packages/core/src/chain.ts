import { documentTransaction } from "./clipboard/document";
import { insertPayload } from "./clipboard/insertion";
import { blockContent, cloneBlockTree } from "./commands/content";
import { insertionPoint } from "./commands/insertion-point";
import { ListCommands } from "./commands/list-commands";
import { MarkCommands } from "./commands/mark-commands";
import type { CommandPort } from "./commands/port";
import { type AllowsChild, type CommandSchema, chainSchema } from "./commands/schema";
import { StructureCommands } from "./commands/structure-commands";
import { cloneAttributes } from "./document/attributes";
import { createId } from "./document/id";
import { findBlockInTree, findBlockLocation, flattenBlocks } from "./document/tree";
import { adjacentCell } from "./table/navigation";
import type { Document } from "./types/block";
import type { GoTipeEditor } from "./types/editor";
import type { Selection, Step, Transaction } from "./types/state";

export class ChainableCommands {
  private steps: Step[] = [];
  /** @internal Set by cell navigation to signal that preventDefault should fire */
  _cellNavigated = false;
  private _focusPosition: "start" | "end" | undefined | null = null;
  private selectionOverride: Transaction["selection"] | null = null;

  private marks: MarkCommands;
  private lists: ListCommands;
  private structures: StructureCommands;
  private schema: CommandSchema;
  /** `schema` is the editor's schema query; an `allowsChild(parent, child)` function still works. */
  constructor(
    private editor: GoTipeEditor,
    schema?: CommandSchema | AllowsChild,
  ) {
    this.schema = chainSchema(schema);
    const port: CommandPort = {
      getState: () => this.getViewState(),
      allowsChild: this.schema.allowsChild,
      schema: this.schema,
      append: (...steps) => this.steps.push(...steps),
      select: (selection) => {
        this.selectionOverride = selection ?? null;
      },
    };
    this.lists = new ListCommands(port);
    this.marks = new MarkCommands(port);
    this.structures = new StructureCommands(port);
  }

  setBlockType(type: string, attrs?: Record<string, unknown>): this {
    this.lists.setBlockType(type, attrs);
    return this;
  }
  /** Stage a selection for subsequent commands without changing the live caret. */
  setSelection(selection: Selection): this {
    this.selectionOverride = structuredClone(selection);
    return this;
  }
  indent(): this {
    this.lists.indent();
    return this;
  }
  outdent(): this {
    this.lists.outdent();
    return this;
  }
  private toggleList(
    listType: string,
    itemType: string,
    attrs?: Record<string, unknown>,
    unwrap = true,
  ): this {
    this.lists.toggleList(listType, itemType, attrs, unwrap);
    return this;
  }
  insertTable(options: { rows: number; cols: number; withHeader?: boolean }): this {
    this.structures.insertTable(options);
    return this;
  }
  insertColumns(count = 2): this {
    this.structures.insertColumns(count);
    return this;
  }
  insertToggle(): this {
    this.structures.insertToggle();
    return this;
  }

  private getViewState() {
    const state = this.editor.getViewState();
    const selection = this.selectionOverride;
    if (!selection) return state;
    const point = (blockId: string, offset: number) => ({ blockId, offset });
    if (selection.type === "cursor")
      return {
        ...state,
        selection: {
          type: "text" as const,
          anchor: point(selection.blockId, selection.offset),
          head: point(selection.blockId, selection.offset),
        },
      };
    if (selection.type === "text")
      return {
        ...state,
        selection: {
          type: "text" as const,
          anchor: point(selection.blockId, selection.from),
          head: point(selection.blockId, selection.to),
        },
      };
    if (selection.type === "range")
      return {
        ...state,
        selection: { type: "text" as const, anchor: selection.anchor, head: selection.head },
      };
    if (selection.type === "block")
      return {
        ...state,
        selection: {
          type: "block" as const,
          anchor: point(selection.blockId, 0),
          head: point(selection.blockId, 0),
        },
      };
    return state;
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
    this.marks.add("link", undefined, undefined, { href, target: target ?? "_blank" });
    return this;
  }
  removeLink(): this {
    this.marks.remove("link");
    return this;
  }
  toggleMark(markType: string, attrs?: Record<string, unknown>): this {
    this.marks.toggle(markType, attrs);
    return this;
  }
  addMark(markType: string, from?: number, to?: number, attrs?: Record<string, unknown>): this {
    this.marks.add(markType, from, to, attrs);
    return this;
  }
  removeMark(markType: string, from?: number, to?: number): this {
    this.marks.remove(markType, from, to);
    return this;
  }
  setMark(markType: string, attrs?: Record<string, unknown>): this {
    return this.addMark(markType, undefined, undefined, attrs);
  }
  unsetMark(markType: string): this {
    return this.removeMark(markType);
  }
  clearFormatting(): this {
    this.marks.clear();
    return this;
  }

  // Block operations
  setBlockAttrs(blockId: string, attrs: Record<string, unknown>): this {
    this.steps.push({
      type: "setBlockAttrs",
      blockId,
      attrs: cloneAttributes(attrs),
    });
    return this;
  }

  insertBlockAfter(type: string, attrs?: Record<string, unknown>): this {
    return this.insertBlock(type, attrs, "after");
  }

  insertBlockBefore(type: string, attrs?: Record<string, unknown>): this {
    return this.insertBlock(type, attrs, "before");
  }

  /** A new block gets the declared attribute defaults; values outside `values` stage nothing. */
  private insertBlock(
    type: string,
    attrs: Record<string, unknown> | undefined,
    side: "after" | "before",
  ): this {
    const filled = this.schema.withDefaults("node", type, attrs);
    if (!this.schema.acceptsAttrs(type, filled)) return this;
    const state = this.getViewState();
    const blockId = state.selection.anchor.blockId;
    const location = insertionPoint(state.blocks, blockId, type, side, this.schema.allowsChild);
    this.steps.push({
      type: "insertBlock",
      ...location,
      block: {
        id: createId(),
        type,
        attrs: filled,
        content: blockContent(type),
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
    const location = findBlockLocation(state.blocks, id);
    if (location && location.index > 0) {
      this.steps.push({
        type: "moveBlock",
        blockId: id,
        newParentId: location.parentId,
        newIndex: location.index - 1,
      });
    }
    return this;
  }

  moveBlockDown(blockId?: string): this {
    const state = this.getViewState();
    const id = blockId ?? state.selection.anchor.blockId;
    const location = findBlockLocation(state.blocks, id);
    const siblings = location?.parentId
      ? findBlockInTree(state.blocks, location.parentId)?.children
      : state.blocks;
    if (location && siblings && location.index < siblings.length - 1) {
      this.steps.push({
        type: "moveBlock",
        blockId: id,
        newParentId: location.parentId,
        newIndex: location.index + 1,
      });
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
    const block = findBlockInTree(state.blocks, id);
    const location = findBlockLocation(state.blocks, id);
    if (block && location) {
      const index = location.index;
      this.steps.push({
        type: "insertBlock",
        parentId: location.parentId,
        index: index + 1,
        block: cloneBlockTree(block),
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

  // Idempotent list setters for slash/turn-into flows (no unwrap on same type).
  setBulletList(): this {
    return this.toggleList("bulletList", "listItem", undefined, false);
  }

  setOrderedList(attrs?: { start?: number }): this {
    return this.toggleList("orderedList", "listItem", attrs, false);
  }

  setTodoList(): this {
    return this.toggleList("todoList", "todoItem", undefined, false);
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
    const loc = findBlockLocation(state.blocks, blockId);
    if (!loc || loc.index <= 0) return this;

    if (loc.parentId) {
      const parent = findBlockInTree(state.blocks, loc.parentId);
      const prev = parent?.children[loc.index - 1];
      if (prev) {
        this.steps.push({
          type: "mergeBlocks",
          blockId,
          targetId: prev.id,
        });
      }
    } else {
      this.steps.push({
        type: "mergeBlocks",
        blockId,
        targetId: state.blocks[loc.index - 1]!.id,
      });
    }
    return this;
  }

  insertHardBreak(): this {
    return this.insertText("\n");
  }

  goToNextCell(): this {
    this.navigateCell("next");
    return this;
  }

  goToPrevCell(): this {
    this.navigateCell("prev");
    return this;
  }

  /** Within the cell's own table; at its edge nothing happens and `run()` returns false. */
  private navigateCell(direction: "next" | "prev"): void {
    const state = this.getViewState();
    const cell = adjacentCell(state.blocks, state.selection.anchor.blockId, direction);
    if (!cell) return;

    this.selectionOverride = {
      type: "text",
      blockId: cell.id,
      from: 0,
      to: Array.isArray(cell.content)
        ? cell.content.reduce((sum, span) => sum + span.text.length, 0)
        : 0,
    };

    // Mark that navigation happened so the keybinding can preventDefault
    this._cellNavigated = true;
  }

  // Selection
  selectAll(): this {
    const blocks = flattenBlocks(this.getViewState().blocks).filter(
      (block) => block.content !== null,
    );
    const first = blocks[0];
    const last = blocks.at(-1);
    if (first && last)
      this.selectionOverride = {
        type: "range",
        anchor: { blockId: first.id, offset: 0 },
        head: {
          blockId: last.id,
          offset: Array.isArray(last.content)
            ? last.content.reduce((sum, span) => sum + span.text.length, 0)
            : (last.content?.length ?? 0),
        },
      };
    return this;
  }

  selectBlock(blockId?: string): this {
    const id = blockId ?? this.getViewState().selection.anchor.blockId;
    if (findBlockInTree(this.getViewState().blocks, id))
      this.selectionOverride = { type: "block", blockId: id };
    return this;
  }

  // Text
  insertText(text: string): this {
    const state = this.getViewState();
    const sel = state.selection;
    if (sel.type !== "text" || sel.anchor.blockId !== sel.head.blockId) {
      const before = this.editor.getJSON() as Document;
      const change = insertPayload(before, sel, { spans: [{ text, marks: [] }] });
      const transaction = documentTransaction(before, change.document, change.caret);
      this.steps.push(...transaction.steps);
      this.selectionOverride = transaction.selection ?? null;
      return this;
    }
    const from = Math.min(sel.anchor.offset, sel.head.offset);
    const to = Math.max(sel.anchor.offset, sel.head.offset);
    if (from !== to) this.steps.push({ type: "deleteText", blockId: sel.anchor.blockId, from, to });
    this.steps.push({
      type: "insertText",
      blockId: sel.anchor.blockId,
      offset: from,
      text,
      marks: [],
    });
    this.selectionOverride = {
      type: "cursor",
      blockId: sel.anchor.blockId,
      offset: from + text.length,
    };
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
    const selectionOverride = this.selectionOverride;

    // Handle undo/redo before normal steps
    if (this._undo) {
      this._undo = false;
      this.selectionOverride = null;
      return this.editor.undo();
    }
    if (this._redo) {
      this._redo = false;
      this.selectionOverride = null;
      return this.editor.redo();
    }

    const cellNavigated = this._cellNavigated;
    this._cellNavigated = false;

    if (this.steps.length === 0 && !cellNavigated && !selectionOverride) {
      this.selectionOverride = null;
      return didFocus;
    }
    if (this.steps.length > 0 || selectionOverride) {
      const preserveSelectionTypes = new Set([
        "addMark",
        "removeMark",
        "setBlockType",
        "setBlockAttrs",
      ]);
      const shouldPreserveSelection =
        didFocus &&
        selectionOverride === null &&
        this.steps.every((step) => preserveSelectionTypes.has(step.type));
      const selectionBefore = shouldPreserveSelection
        ? (() => {
            const sel = this.getViewState().selection;
            return {
              anchor: { ...sel.anchor },
              head: { ...sel.head },
            };
          })()
        : null;

      const tr: Transaction = selectionOverride
        ? { steps: this.steps, selection: selectionOverride }
        : { steps: this.steps };
      if (!this.editor.dispatch(tr)) return false;
      if (selectionBefore) {
        this.editor.setSelection(selectionBefore);
      } else if (selectionOverride?.type === "cursor") {
        this.editor.setSelection({
          anchor: { blockId: selectionOverride.blockId, offset: selectionOverride.offset },
          head: { blockId: selectionOverride.blockId, offset: selectionOverride.offset },
        });
      } else if (didFocus) {
        // Re-apply DOM range after mutation/re-render to avoid native selection drift.
        this.editor.focus();
      }
      this.steps = [];
      this.selectionOverride = null;
    }
    this.selectionOverride = null;
    return true;
  }
}
