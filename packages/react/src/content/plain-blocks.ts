import type { BlockView } from "@gotipe/core";
import type { BlockViews } from "./context";

/**
 * Built-in views that draw a block from the block itself, the caret being in it, the editor
 * being editable and React contexts, and from nothing else. A code block is not one of them:
 * its text keeps the native selection by the document version of its last render.
 */
const PLAIN_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "todoList",
  "todoItem",
  "blockquote",
  "divider",
  "callout",
  "toggle",
  "columns",
  "column",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);

const NO_VIEWS: BlockViews = {};
const plainByViews = new WeakMap<BlockViews, WeakMap<BlockView, boolean>>();

/**
 * Whether only such views draw `block` and every block under it: each is drawn by a built-in
 * view of `PLAIN_TYPES` or by a custom view that calls itself `pure`. Other custom views may
 * read the editor while they render, so they are always drawn again.
 */
export function isPlainTree(block: BlockView, views: BlockViews | null): boolean {
  const key = views ?? NO_VIEWS;
  let known = plainByViews.get(key);
  if (!known) {
    known = new WeakMap();
    plainByViews.set(key, known);
  }
  const plain = (node: BlockView): boolean => {
    const cached = known.get(node);
    if (cached !== undefined) return cached;
    const view = views?.[node.type];
    const result =
      (view ? view.pure === true : PLAIN_TYPES.has(node.type)) && node.children.every(plain);
    known.set(node, result);
    return result;
  };
  return plain(block);
}

/** Whether `id` names `block` or a block under it. */
export function holdsBlock(block: BlockView, id: string): boolean {
  if (!id) return false;
  if (block.id === id) return true;
  for (const child of block.children) if (holdsBlock(child, id)) return true;
  return false;
}
