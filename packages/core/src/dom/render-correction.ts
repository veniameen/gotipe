import type { BlockView } from "../types/view";
import { createTextWalker } from "./text-walker";

export interface RenderCorrectionPort {
  getBlocks(): BlockView[];
  redrawBlocks(ids: string[]): void;
}

/** More changed top-level nodes than this between two checks: the next check reads them all. */
const CHANGED_LIMIT = 2048;
/** Searches of the whole surface before one pass over it indexes every block element. */
const SEARCH_LIMIT = 8;

/**
 * Finds blocks whose drawn text differs from the model after handled input: the browser may
 * insert nodes the renderer does not own although `beforeinput` was prevented. Such a block is
 * handed to the renderer to remount.
 *
 * A check reads only what may have changed since the one before it: top-level blocks that are
 * new objects in the view (an unchanged block keeps its object) and blocks under top-level nodes
 * whose subtree the DOM reported a mutation in. The first check reads every block.
 */
export function installRenderCorrection(
  element: HTMLElement,
  signal: AbortSignal,
  port: RenderCorrectionPort,
) {
  /** Top-level nodes of the surface with a mutation since the last check; null: all of them. */
  let changed: Set<Element> | null = null;
  /** Top-level view blocks whose drawn text matched at their last check. */
  let matched = new WeakSet<BlockView>();

  const note = (records: MutationRecord[]): void => {
    if (!changed) return;
    for (const record of records) {
      if (record.target === element) {
        for (const node of record.addedNodes) if (node instanceof Element) changed.add(node);
        continue;
      }
      // A target that has left the surface is covered by the record of its removal.
      let node: Node | null = record.target;
      while (node && node.parentNode !== element) node = node.parentNode;
      if (node instanceof Element) changed.add(node);
    }
    if (changed.size > CHANGED_LIMIT) changed = null;
  };
  const observer = new MutationObserver(note);
  if (!signal.aborted) {
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }

  const idOf = (node: Element): string | null => node.getAttribute("data-block-id");
  const blockElements = (root: Element): NodeListOf<Element> =>
    root.querySelectorAll("[data-block-id]");

  /** The block elements under the changed top-level nodes, by block id; null: every block. */
  const changedBlocks = (): Map<string, Element> | null => {
    if (!changed) return null;
    const found = new Map<string, Element>();
    const add = (node: Element): void => {
      const id = idOf(node);
      if (id !== null && !found.has(id)) found.set(id, node);
    };
    for (const top of changed) {
      if (top.parentNode !== element) continue;
      add(top);
      for (const node of blockElements(top)) add(node);
    }
    return found;
  };

  /** The first element of a block in document order, as `querySelector` finds it. */
  const createLookup = (changedNow: Map<string, Element> | null) => {
    let all: Map<string, Element> | null = null;
    let searches = 0;
    const index = (root: Element, into: Map<string, Element>): void => {
      for (const node of blockElements(root)) {
        const id = idOf(node) as string;
        if (!into.has(id)) into.set(id, node);
      }
    };
    return {
      within(id: string): Map<string, Element> {
        // Elements of the blocks drawn inside the element of the top-level block `id`.
        const found = new Map<string, Element>();
        const top = this.find(id, found);
        if (top && !all) index(top, found);
        return found;
      },
      find(id: string, near: Map<string, Element>): Element | null {
        const known = near.get(id) ?? changedNow?.get(id) ?? all?.get(id);
        if (known) return known;
        if (all) return null;
        searches += 1;
        if (searches > SEARCH_LIMIT) {
          all = new Map();
          index(element, all);
          return all.get(id) ?? null;
        }
        return element.querySelector(`[data-block-id="${id}"]`);
      },
    };
  };

  const ownText = (host: HTMLElement, ownerBlockId: string): string => {
    const walker = createTextWalker(host);
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const owner =
        node.parentElement?.closest("[data-block-id]")?.getAttribute("data-block-id") ??
        ownerBlockId;
      if (owner === ownerBlockId) text += node.nodeValue ?? "";
    }
    return text;
  };

  const matches = (block: BlockView, blockEl: Element): boolean => {
    if (!Array.isArray(block.content)) return true;
    const blockType = blockEl.getAttribute("data-block-type");
    const textHost =
      blockType === "todoItem"
        ? (blockEl.querySelector("[data-gotipe-todo-content]") ?? blockEl)
        : blockType === "callout"
          ? (blockEl.querySelector(".gotipe-callout-content") ?? blockEl)
          : blockEl;
    const expected = block.content.map((span) => span.text).join("");
    return ownText(textHost as HTMLElement, block.id) === expected;
  };

  return {
    correct(): boolean {
      // Asks the renderer to redraw the blocks that differ; true when there are any.
      if (signal.aborted) return false;
      note(observer.takeRecords());
      const ids = changedBlocks();
      const lookup = createLookup(ids);
      const stale: string[] = [];
      const next = ids ? matched : new WeakSet<BlockView>();
      for (const top of port.getBlocks()) {
        const read = !ids || !matched.has(top);
        if (!read && !inTree(top, ids)) continue;
        const near = read ? lookup.within(top.id) : NONE;
        const before = stale.length;
        const visit = (block: BlockView): void => {
          if (Array.isArray(block.content) && (read || ids?.has(block.id))) {
            const blockEl = lookup.find(block.id, near);
            // The browser inserted nodes the renderer does not own. Patching text nodes in
            // place cannot be trusted (decorations split spans, native nodes sit next to
            // rendered ones), so the renderer remounts this block from the model.
            if (blockEl && !matches(block, blockEl)) stale.push(block.id);
          }
          for (const child of block.children) visit(child);
        };
        visit(top);
        if (stale.length === before) next.add(top);
        else next.delete(top);
      }
      matched = next;
      changed = new Set();
      if (stale.length === 0) return false;
      port.redrawBlocks(stale);
      return true;
    },
  };
}

const NONE = new Map<string, Element>();

function inTree(block: BlockView, ids: Map<string, Element> | null): boolean {
  if (!ids || ids.size === 0) return false;
  if (ids.has(block.id)) return true;
  for (const child of block.children) if (inTree(child, ids)) return true;
  return false;
}
