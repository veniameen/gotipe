/**
 * Attribute that marks DOM rendered *around* the document text: inline
 * widgets such as suggested insertions, phantom blocks, cursor carets.
 * Their text is not part of the document and must not count in offsets.
 */
export const WIDGET_ATTR = "data-gotipe-widget";

/** True when the node lives inside a widget subtree (below `root`). */
export function isInsideWidget(node: Node, root?: Node | null): boolean {
  let el: Element | null = node.nodeType === 1 ? (node as Element) : node.parentElement;
  while (el && el !== root) {
    if (el.hasAttribute(WIDGET_ATTR) || el.hasAttribute("data-gotipe-input")) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * A text-node walker over the document text of `root`, skipping widget
 * subtrees. Use it for every DOM ⇄ (blockId, offset) computation.
 */
export function createTextWalker(root: Node): TreeWalker {
  const doc = root.ownerDocument ?? document;
  return doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isInsideWidget(node, root) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
}

/** Text of `root` without widget text. */
export function documentTextOf(root: Node): string {
  const walker = createTextWalker(root);
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.nodeValue ?? "";
  return text;
}
