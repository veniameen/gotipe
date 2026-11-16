import { flattenBlocks } from "../document/tree";
import type { BlockView } from "../types/view";
import { ownsInputTarget } from "./input-owner";
import { ATOM, createTextWalker, isInsideWidget } from "./text-walker";

export interface TextSelection {
  anchor: { blockId: string; offset: number };
  head: { blockId: string; offset: number };
}

export interface DOMSelectionPort {
  getSelection(): TextSelection;
  updateSelection(selection: TextSelection): void;
  getBlocks(): BlockView[];
  redrawBlocks(ids: string[]): void;
  isComposing(): boolean;
  consumeHandledInput(): boolean;
}

/** Owns native selection mapping and renderer reconciliation for one mounted surface. */
export function installDOMSelection(
  element: HTMLElement,
  signal: AbortSignal,
  port: DOMSelectionPort,
) {
  // Browser select-all can use the editable root's child boundaries instead
  // of text nodes. Descend to the first/last document leaf, preserving the end
  // offset even when formatting, lists, or table wrappers add DOM levels.
  const boundaryLeaf = (node: Node, end: boolean): { node: Node; offset: number } | null => {
    if (isInsideWidget(node, element)) return null;
    // An atom is not editable, but its text counts: the point before or after it.
    if (node instanceof Element && node.matches(ATOM)) {
      const text = createTextWalker(node).nextNode();
      return text ? { node: text, offset: end ? (text.textContent ?? "").length : 0 } : null;
    }
    if (node instanceof Element && node.matches("button, input, textarea, select")) return null;
    if (node instanceof Element && node !== element && node.hasAttribute("data-gotipe-editor"))
      return null;
    if (node.nodeType === Node.TEXT_NODE) {
      if (!ownsInputTarget(element, node)) return null;
      return { node, offset: end ? (node.textContent ?? "").length : 0 };
    }
    const children = Array.from(node.childNodes);
    if (end) children.reverse();
    for (const child of children) {
      const point = boundaryLeaf(child, end);
      if (point) return point;
    }
    return node instanceof Element && node.hasAttribute("data-block-id")
      ? { node, offset: 0 }
      : null;
  };
  // --- DOM selection → block/offset resolution ---
  const resolvePosition = (
    node: Node,
    offset: number,
  ): { blockId: string; offset: number } | null => {
    // If node is an element, resolve to the actual text position
    let resolvedNode = node;
    let resolvedOffset = offset;

    if (resolvedNode.nodeType === Node.ELEMENT_NODE) {
      const el = resolvedNode as HTMLElement;
      const childCount = el.childNodes.length;
      // Skip controls at the edge, retaining the same text boundary. Prefer
      // the following leaf; at the end of a container use the preceding one.
      const children = Array.from(el.childNodes);
      const following = children.slice(Math.min(offset, childCount));
      const preceding = children.slice(0, Math.min(offset, childCount)).reverse();
      let point: ReturnType<typeof boundaryLeaf> = null;
      // A nested block's text is not this point's: the own text before it wins (an atom
      // ending an item); without one, the nested text as before.
      const owner = el.closest("[data-block-id]");
      let foreign: ReturnType<typeof boundaryLeaf> = null;
      for (const child of following) {
        point = boundaryLeaf(child, false);
        if (point && owner && point.node.parentElement?.closest("[data-block-id]") !== owner) {
          foreign = point;
          point = null;
        }
        if (point || foreign) break;
      }
      if (!point) {
        for (const child of preceding) {
          point = boundaryLeaf(child, true);
          if (point) break;
        }
      }
      point ??= foreign;
      if (point) {
        resolvedNode = point.node;
        resolvedOffset = point.offset;
      }
    }

    // Walk up from the node to find the closest [data-block-id] element
    let blockEl: HTMLElement | null =
      resolvedNode instanceof HTMLElement ? resolvedNode : resolvedNode.parentElement;
    while (blockEl && !blockEl.hasAttribute("data-block-id")) {
      blockEl = blockEl.parentElement;
    }
    if (!blockEl) return null;

    const blockType = blockEl.getAttribute("data-block-type");
    if (blockType === "bulletList" || blockType === "orderedList" || blockType === "todoList") {
      const items = Array.from(
        blockEl.querySelectorAll(
          ':scope > [data-block-id][data-block-type="listItem"], :scope > [data-block-id][data-block-type="todoItem"]',
        ),
      ).filter((item): item is HTMLElement => item instanceof HTMLElement);

      if (items.length > 0) {
        let targetItem: HTMLElement | null = null;

        if (resolvedNode === blockEl) {
          const idx = Math.max(0, Math.min(items.length - 1, Math.max(0, resolvedOffset - 1)));
          targetItem = items[idx] ?? items[0]!;
        } else {
          const sourceEl =
            resolvedNode instanceof Element ? resolvedNode : resolvedNode.parentElement;
          const owner = sourceEl?.closest(
            '[data-block-id][data-block-type="listItem"], [data-block-id][data-block-type="todoItem"]',
          );
          if (owner instanceof HTMLElement && blockEl.contains(owner)) {
            targetItem = owner;
          }
        }

        blockEl = targetItem ?? items[0]!;
      }
    }

    const blockId = blockEl.getAttribute("data-block-id")!;
    const markedHost = Array.from(
      blockEl.querySelectorAll<HTMLElement>("[data-gotipe-text-content]"),
    ).find((candidate) => candidate.closest("[data-block-id]") === blockEl);
    const textHost =
      markedHost ??
      (blockType === "callout"
        ? ((blockEl.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? blockEl)
        : blockEl);

    if (blockType === "callout") {
      const anchorElement =
        resolvedNode instanceof Element ? resolvedNode : resolvedNode.parentElement;
      if (anchorElement && !textHost.contains(anchorElement)) {
        return { blockId, offset: 0 };
      }
    }

    // Calculate text offset within this block by walking the text nodes
    let textOffset = 0;
    const walker = createTextWalker(textHost);
    let textNode: Node | null;
    for (textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
      if (textNode === resolvedNode) {
        textOffset += resolvedOffset;
        break;
      }
      if (resolvedNode.nodeType !== Node.TEXT_NODE && resolvedNode.contains(textNode)) {
        // resolvedNode is an element containing this text node
        textOffset += resolvedOffset;
        break;
      }
      // The point sits before this text node (e.g. inside or before a
      // widget, whose text the walker skips): stop counting here.
      if (
        resolvedNode.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING &&
        !resolvedNode.contains(textNode)
      ) {
        break;
      }
      textOffset += (textNode.textContent ?? "").length;
    }
    return { blockId, offset: textOffset };
  };

  // Restore DOM selection to match currentSelection after React re-render
  let pendingSelectionRestore = false;
  let selectionRestoreGeneration = 0;
  const cancelSelectionRestore = () => {
    selectionRestoreGeneration++;
    pendingSelectionRestore = false;
  };
  const hasIndependentFocus = (): boolean => {
    const doc = element.ownerDocument;
    const active = doc.activeElement;
    if (active && active !== doc.body && active !== element && !ownsInputTarget(element, active))
      return true;
    const anchor = doc.getSelection()?.anchorNode;
    return (
      active !== element &&
      !!anchor &&
      element.contains(anchor) &&
      !ownsInputTarget(element, anchor)
    );
  };
  const beside = (atom: Element, after: number) => ({
    node: atom.parentNode!,
    offset: Array.prototype.indexOf.call(atom.parentNode!.childNodes, atom) + after,
  });
  const resolveDomPoint = (
    blockId: string,
    targetOffset: number,
  ): { node: Node; offset: number } | null => {
    if (signal.aborted) return null;
    const blockEl = element.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockEl) return null;

    const blockType = blockEl.getAttribute("data-block-type");
    if (blockType === "bulletList" || blockType === "orderedList" || blockType === "todoList") {
      const firstItem = blockEl.querySelector(
        ':scope > [data-block-id][data-block-type="listItem"], :scope > [data-block-id][data-block-type="todoItem"]',
      );
      if (firstItem instanceof HTMLElement) {
        const firstItemId = firstItem.getAttribute("data-block-id");
        if (firstItemId) {
          return resolveDomPoint(firstItemId, targetOffset);
        }
      }
    }

    const markedHost = Array.from(
      blockEl.querySelectorAll<HTMLElement>("[data-gotipe-text-content]"),
    ).find((candidate) => candidate.closest("[data-block-id]") === blockEl);
    const textHost =
      markedHost ??
      (blockType === "callout"
        ? ((blockEl.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? blockEl)
        : blockEl);
    const walker = createTextWalker(textHost);
    let accumulated = 0;
    let textNode: Node | null;
    let lastTextNode: Node | null = null;

    for (textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
      lastTextNode = textNode;
      const len = (textNode.textContent ?? "").length;
      if (accumulated + len >= targetOffset) {
        const localOffset = targetOffset - accumulated;
        const atom = textNode.parentElement?.closest(ATOM);
        // The caret stands beside an atom, never in its text: the following text's start
        // after it when that text is this block's own (not a nested block's), else the
        // element boundary.
        if (!atom) return { node: textNode, offset: Math.min(localOffset, len) };
        if (localOffset <= 0) return beside(atom, 0);
        const next = walker.nextNode();
        if (next?.parentElement?.closest("[data-block-id]") !== blockEl) return beside(atom, 1);
        walker.previousNode();
      }
      accumulated += len;
    }
    const last = lastTextNode?.parentElement?.closest(ATOM);
    if (last) return beside(last, 1);

    // Empty block (or no text nodes yet):
    // for todo items, place caret in the text content area after checkbox.
    if (!lastTextNode) {
      if (blockType === "todoItem") {
        const contentHost = blockEl.querySelector("[data-gotipe-todo-content]");
        if (contentHost) return { node: contentHost, offset: 0 };
      }
      if (textHost !== blockEl) {
        return { node: textHost, offset: 0 };
      }
      return { node: blockEl, offset: 0 };
    }

    const lastLen = (lastTextNode.textContent ?? "").length;
    return { node: lastTextNode, offset: lastLen };
  };

  const restoreDomSelection = (): boolean => {
    if (signal.aborted || hasIndependentFocus()) return false;

    const anchorPoint = resolveDomPoint(
      port.getSelection().anchor.blockId,
      port.getSelection().anchor.offset,
    );
    const headPoint = resolveDomPoint(
      port.getSelection().head.blockId,
      port.getSelection().head.offset,
    );
    if (!anchorPoint || !headPoint) return false;

    const sel = document.getSelection();
    if (!sel) return false;

    try {
      const anchorElement =
        anchorPoint.node instanceof Element ? anchorPoint.node : anchorPoint.node.parentElement;
      const editingHost = anchorElement?.closest<HTMLElement>('[contenteditable="true"]');
      if (
        editingHost &&
        ownsInputTarget(element, editingHost) &&
        document.activeElement !== editingHost
      )
        editingHost.focus({ preventScroll: true });
      sel.removeAllRanges();

      if (typeof sel.setBaseAndExtent === "function") {
        sel.setBaseAndExtent(
          anchorPoint.node,
          anchorPoint.offset,
          headPoint.node,
          headPoint.offset,
        );
        return true;
      }

      const range = document.createRange();
      range.setStart(anchorPoint.node, anchorPoint.offset);
      range.setEnd(headPoint.node, headPoint.offset);
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  };

  // Correct DOM text nodes if native input leaked through preventDefault()
  const correctDomFromWasmState = (): boolean => {
    if (signal.aborted) return false;
    const blocks = port.getBlocks();
    const stale: string[] = [];
    const collectOwnTextNodes = (host: HTMLElement, ownerBlockId: string): Text[] => {
      const walker = createTextWalker(host);
      const textNodes: Text[] = [];
      let node: Node | null;
      for (node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        const owner =
          parent?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? ownerBlockId;
        if (owner === ownerBlockId) {
          textNodes.push(node as Text);
        }
      }
      return textNodes;
    };

    for (const block of flattenBlocks(blocks)) {
      if (!Array.isArray(block.content)) continue;
      const blockEl = element.querySelector(`[data-block-id="${block.id}"]`);
      if (!blockEl) continue;

      const blockType = blockEl.getAttribute("data-block-type");
      const textHost =
        blockType === "todoItem"
          ? ((blockEl.querySelector("[data-gotipe-todo-content]") as HTMLElement | null) ?? blockEl)
          : blockType === "callout"
            ? ((blockEl.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? blockEl)
            : blockEl;

      const expected = block.content.map((s) => s.text).join("");
      const textNodes = collectOwnTextNodes(textHost as HTMLElement, block.id);
      const actual = textNodes.map((node) => node.nodeValue ?? "").join("");
      if (actual !== expected) {
        // The browser inserted nodes the renderer does not own. Patching
        // text nodes in place cannot be trusted (decorations split spans,
        // native nodes sit next to rendered ones), so ask the renderer to
        // remount this block from the model.
        stale.push(block.id);
      }
    }
    if (stale.length > 0) {
      port.redrawBlocks(stale);
      return true;
    }
    return false;
  };

  // Schedule selection restore after React re-render
  const scheduleSelectionRestore = () => {
    if (hasIndependentFocus()) {
      cancelSelectionRestore();
      return;
    }
    if (pendingSelectionRestore) return;
    pendingSelectionRestore = true;
    let attempts = 0;
    const generation = selectionRestoreGeneration;

    const tryRestore = () => {
      if (signal.aborted || generation !== selectionRestoreGeneration) return;
      attempts += 1;
      // Never move the caret under an active IME composition.
      if (port.isComposing() || hasIndependentFocus()) {
        pendingSelectionRestore = false;
        return;
      }

      // Fix DOM if native input leaked through preventDefault()
      if (port.consumeHandledInput()) {
        if (correctDomFromWasmState() && attempts < 4) {
          // The renderer remounts the stale blocks; restore on next frame.
          requestAnimationFrame(tryRestore);
          return;
        }
      }

      const restored = restoreDomSelection();
      if (!restored && attempts < 4) {
        requestAnimationFrame(tryRestore);
        return;
      }

      pendingSelectionRestore = false;
    };

    requestAnimationFrame(tryRestore);
  };

  // A renderer can replace the selected DOM node before the next animation
  // frame, or rewrite its text: React sets `nodeValue`, and a native caret in
  // the node goes to its start. Repair that pending caret at the commit's
  // microtask boundary so an immediate native keystroke still targets the model
  // caret (WebKit sends no `beforeinput` for Backspace at the start of the
  // editor). The scheduled frame retains ownership of reconciliation and
  // pending-state cleanup.
  const renderObserver = new MutationObserver(() => {
    if (pendingSelectionRestore && !signal.aborted && !port.isComposing()) {
      restoreDomSelection();
    }
  });
  if (!signal.aborted) {
    renderObserver.observe(element, { childList: true, characterData: true, subtree: true });
    signal.addEventListener("abort", () => renderObserver.disconnect(), { once: true });
  }

  const readSelectionFromDOM = () => {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const anchorNode = sel.anchorNode;
    const focusNode = sel.focusNode;
    if (!anchorNode || !focusNode) return null;
    if (!ownsInputTarget(element, anchorNode) || !ownsInputTarget(element, focusNode)) return null;

    const anchor = resolvePosition(anchorNode, sel.anchorOffset);
    const head = resolvePosition(focusNode, sel.focusOffset);
    if (!anchor || !head) return null;

    return {
      anchor: { blockId: anchor.blockId, offset: anchor.offset },
      head: { blockId: head.blockId, offset: head.offset },
    };
  };

  const shouldNormalizeCollapsedTodoCaret = (sel: Selection | null): boolean => {
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
    const anchorNode = sel.anchorNode;
    if (!anchorNode || !element.contains(anchorNode)) return false;

    const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
    const todoItem = anchorEl?.closest('[data-block-type="todoItem"]') as HTMLElement | null;
    if (!todoItem) return false;

    const textHost = todoItem.querySelector("[data-gotipe-todo-content]");
    if (!(textHost instanceof HTMLElement)) return false;

    if (textHost === anchorNode || textHost.contains(anchorEl ?? null)) {
      return false;
    }

    if (anchorNode === todoItem && sel.anchorOffset <= 1) {
      return true;
    }

    const checkbox = todoItem.querySelector('input[type="checkbox"]');
    if (checkbox && (checkbox === anchorNode || checkbox.contains(anchorEl ?? null))) {
      return true;
    }

    return true;
  };

  const onSelectionChange = () => {
    if (pendingSelectionRestore) return;
    if (port.isComposing()) return;
    const domSelection = document.getSelection();
    const normalizeTodoCaret = shouldNormalizeCollapsedTodoCaret(domSelection);
    const normalizeRootCaret = domSelection?.isCollapsed && domSelection.anchorNode === element;
    const selection = readSelectionFromDOM?.();
    if (!selection) return;
    const prevSelection = port.getSelection();
    const sameSelection =
      prevSelection.anchor.blockId === selection.anchor.blockId &&
      prevSelection.anchor.offset === selection.anchor.offset &&
      prevSelection.head.blockId === selection.head.blockId &&
      prevSelection.head.offset === selection.head.offset;

    if (!sameSelection) port.updateSelection(selection);
    // The model may have moved the caret off an inline atom: put the DOM caret there too.
    const model = port.getSelection();
    const snapped =
      !sameSelection &&
      (model.anchor.offset !== selection.anchor.offset ||
        model.head.offset !== selection.head.offset);

    if (normalizeTodoCaret || normalizeRootCaret || snapped) {
      const restoredNow = restoreDomSelection();
      if (!restoredNow) {
        scheduleSelectionRestore();
      }
    }
  };
  document.addEventListener("selectionchange", onSelectionChange, { signal });
  // Some engines report a click in empty editor space on the root boundary
  // and defer selectionchange until after the next native text insertion.
  element.addEventListener("pointerup", onSelectionChange, { signal });
  // A real click owns the next selection. A queued renderer restore must
  // not move the caret back after the browser places it under the pointer.
  document.addEventListener("pointerdown", cancelSelectionRestore, { signal, capture: true });
  // Tabbing into a caption/control transfers caret ownership without a pointer event.
  element.addEventListener(
    "focusin",
    (event) => {
      if (!ownsInputTarget(element, event.target)) cancelSelectionRestore();
    },
    { signal },
  );

  return {
    resolve: resolvePosition,
    read: readSelectionFromDOM,
    restore: restoreDomSelection,
    schedule: scheduleSelectionRestore,
    cancel: cancelSelectionRestore,
    get pending() {
      return pendingSelectionRestore;
    },
  };
}
