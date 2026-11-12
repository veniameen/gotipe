import { cloneAttributes } from "../document/attributes";
import { findBlockInTree, findBlockLocation, findParentBlock } from "../document/tree";
import {
  blockContentTextLength,
  cloneBlockTree,
  cloneInlineContent,
  contentForTargetType,
  listItemAttrs,
} from "./content";
import type { CommandPort } from "./port";

const LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);
const LIST_ITEM_TYPES = new Set(["listItem", "todoItem"]);

/** List wrapping/lifting and indentation are planned into one caller-owned transaction. */
export class ListCommands {
  constructor(private port: CommandPort) {}
  setBlockType(type: string, attrs?: Record<string, unknown>): this {
    const state = this.port.getState();
    const blockId = state.selection.anchor.blockId;
    const block = findBlockInTree(state.blocks, blockId);
    if (!block) return this;
    const sourceOffset =
      state.selection.anchor.blockId === block.id ? state.selection.anchor.offset : 0;

    const parentInfo = findParentBlock(state.blocks, blockId);
    const parent = parentInfo?.parent;
    const insideList = !!parent && LIST_TYPES.has(parent.type) && LIST_ITEM_TYPES.has(block.type);

    // Lift in place: split the list around the selected row, retaining existing IDs.
    if (insideList && !LIST_ITEM_TYPES.has(type)) {
      const listLoc = findBlockLocation(state.blocks, parent.id);
      if (listLoc && parentInfo) {
        const content = contentForTargetType(type, block.content);
        const lifted = {
          id: block.id,
          type,
          attrs: cloneAttributes(attrs ?? {}),
          content,
          children: [],
        };
        const before = parent.children.slice(0, parentInfo.index);
        const after = parent.children.slice(parentInfo.index + 1);
        const replacements = [];
        const list = cloneBlockTree(parent, false);
        if (before.length)
          replacements.push({
            ...list,
            children: before.map((child) => cloneBlockTree(child, false)),
          });
        replacements.push(lifted, ...block.children.map((child) => cloneBlockTree(child, false)));
        if (after.length)
          replacements.push({
            ...list,
            id: before.length ? crypto.randomUUID() : list.id,
            children: after.map((child) => cloneBlockTree(child, false)),
          });
        this.port.append({ type: "deleteBlock", blockId: parent.id });
        replacements.forEach((replacement, index) =>
          this.port.append({
            type: "insertBlock",
            parentId: listLoc.parentId,
            index: listLoc.index + index,
            block: replacement,
          }),
        );
        this.port.select({
          type: "cursor",
          blockId: block.id,
          offset: Math.min(sourceOffset, blockContentTextLength(content)),
        });
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

    if (type === "codeBlock") {
      const targetContent = contentForTargetType(type, block.content);
      const maxOffset = blockContentTextLength(targetContent);
      const offset = Math.max(0, Math.min(sourceOffset, maxOffset));
      this.port.select({ type: "cursor", blockId, offset });
    }

    this.port.append({
      type: "setBlockType",
      blockId,
      newType: type,
      attrs: normalizedAttrs,
    });
    return this;
  }

  toggleList(
    listType: string,
    itemType: string,
    listAttrs?: Record<string, unknown>,
    allowUnwrapSame = true,
  ): this {
    const state = this.port.getState();
    const blockId = state.selection.anchor.blockId;
    const block = findBlockInTree(state.blocks, blockId);
    if (!block) return this;

    const parentInfo = findParentBlock(state.blocks, blockId);
    if (parentInfo && LIST_TYPES.has(parentInfo.parent.type) && LIST_ITEM_TYPES.has(block.type)) {
      const listBlock = parentInfo.parent;

      // Same list command on current list type toggles it off (unwrap to paragraphs).
      if (listBlock.type === listType && block.type === itemType) {
        if (!allowUnwrapSame) return this;
        const listLoc = findBlockLocation(state.blocks, listBlock.id);
        if (listLoc) {
          this.port.append({ type: "deleteBlock", blockId: listBlock.id });
          let insertionIndex = listLoc.index;
          for (let i = 0; i < listBlock.children.length; i++) {
            const item = listBlock.children[i]!;
            this.port.append({
              type: "insertBlock",
              parentId: listLoc.parentId,
              index: insertionIndex,
              block: {
                id: item.id,
                type: "paragraph",
                attrs: {},
                content: cloneInlineContent(item.content),
                children: [],
              },
            });
            insertionIndex += 1;
            for (const child of item.children) {
              this.port.append({
                type: "insertBlock",
                parentId: listLoc.parentId,
                index: insertionIndex,
                block: cloneBlockTree(child, false),
              });
              insertionIndex += 1;
            }
          }
        }
        return this;
      }

      // Convert list kind in-place (bullet <-> ordered <-> todo) to avoid losing the active row.
      this.port.append({
        type: "setBlockType",
        blockId: listBlock.id,
        newType: listType,
        attrs: cloneAttributes(listAttrs ?? {}),
      });

      for (const item of listBlock.children) {
        this.port.append({
          type: "setBlockType",
          blockId: item.id,
          newType: itemType,
          attrs: listItemAttrs(itemType as "listItem" | "todoItem", item),
        });
      }
      return this;
    }

    // Wrap top-level text-capable blocks in list while preserving inline content.
    if (
      block.type === "paragraph" ||
      block.type === "heading" ||
      block.type === "blockquote" ||
      block.type === "codeBlock" ||
      block.type === "callout"
    ) {
      const location = findBlockLocation(state.blocks, blockId);
      if (!location) return this;

      this.port.append({ type: "deleteBlock", blockId });
      this.port.append({
        type: "insertBlock",
        parentId: location.parentId,
        index: location.index,
        block: {
          id: crypto.randomUUID(),
          type: listType,
          attrs: cloneAttributes(listAttrs ?? {}),
          content: null,
          children: [
            {
              id: block.id,
              type: itemType,
              attrs: listItemAttrs(itemType as "listItem" | "todoItem", block),
              content: cloneInlineContent(block.content),
              children: block.children.map((child) => cloneBlockTree(child, false)),
            },
          ],
        },
      });
      return this;
    }

    return this.setBlockType(listType, listAttrs);
  }

  indent(): this {
    const state = this.port.getState();
    const blockId = state.selection.anchor.blockId;
    const block = findBlockInTree(state.blocks, blockId);
    if (!block || !LIST_ITEM_TYPES.has(block.type)) return this;

    const location = findBlockLocation(state.blocks, blockId);
    if (!location || location.index <= 0) return this;

    const parent = location.parentId ? findBlockInTree(state.blocks, location.parentId) : null;
    if (!parent || !LIST_TYPES.has(parent.type)) return this;

    const prevBlock = parent.children[location.index - 1];
    if (!prevBlock || !LIST_ITEM_TYPES.has(prevBlock.type)) return this;

    const existingNestedList =
      prevBlock.children.find((child) => child.type === parent.type) ?? null;
    if (existingNestedList) {
      this.port.append({
        type: "moveBlock",
        blockId,
        newParentId: existingNestedList.id,
        newIndex: existingNestedList.children.length,
      });
      return this;
    }

    const nestedListId = crypto.randomUUID();
    this.port.append({
      type: "insertBlock",
      parentId: prevBlock.id,
      index: prevBlock.children.length,
      block: {
        id: nestedListId,
        type: parent.type,
        attrs: cloneAttributes(parent.attrs),
        content: null,
        children: [],
      },
    });

    this.port.append({
      type: "moveBlock",
      blockId,
      newParentId: nestedListId,
      newIndex: 0,
    });
    return this;
  }

  outdent(): this {
    const state = this.port.getState();
    const blockId = state.selection.anchor.blockId;
    const block = findBlockInTree(state.blocks, blockId);
    if (!block || !LIST_ITEM_TYPES.has(block.type)) return this;

    const parentInfo = findParentBlock(state.blocks, blockId);
    if (!parentInfo || !LIST_TYPES.has(parentInfo.parent.type)) return this;

    const listParentInfo = findParentBlock(state.blocks, parentInfo.parent.id);
    if (!listParentInfo) return this;

    const hostLoc = findBlockLocation(state.blocks, listParentInfo.parent.id);
    if (!hostLoc) return this;

    this.port.append({
      type: "moveBlock",
      blockId,
      newParentId: hostLoc.parentId,
      newIndex: hostLoc.index + 1,
    });
    if (parentInfo.parent.children.length === 1) {
      this.port.append({ type: "deleteBlock", blockId: parentInfo.parent.id });
    }
    return this;
  }
}
