interface Snapshot {
  node: Node;
  text: string | null;
  children: Snapshot[];
}
function capture(node: Node): Snapshot {
  return { node, text: node.nodeValue, children: Array.from(node.childNodes, capture) };
}
function restore(snapshot: Snapshot): void {
  const { node, children } = snapshot;
  if (node.nodeValue !== snapshot.text) node.nodeValue = snapshot.text;
  const original = children.map((child) => child.node);
  if (
    node instanceof Element &&
    (node.childNodes.length !== original.length ||
      original.some((child, index) => node.childNodes[index] !== child))
  )
    node.replaceChildren(...original);
  for (const child of children) restore(child);
}

/** Roll back a late browser mutation to the current renderer tree, never an old document. */
export function captureRendererDOM(root: HTMLElement): () => void {
  const snapshot = capture(root);
  return () => restore(snapshot);
}

/** Preserve actual renderer-owned nodes while native IME temporarily edits their DOM. */
export function captureCompositionDOM(
  root: HTMLElement,
  anchorId: string,
  headId: string,
): () => void {
  const children: Node[] = Array.from(root.childNodes);
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-block-id]"));
  const top = (id: string): Node | undefined => {
    let node: Node | undefined = blocks.find((block) => block.dataset.blockId === id);
    while (node?.parentNode && node.parentNode !== root) node = node.parentNode;
    return node;
  };
  const anchor = top(anchorId);
  const head = top(headId);
  if (!anchor || !head) return () => {};
  const a = children.indexOf(anchor);
  const b = children.indexOf(head);
  if (a < 0 || b < 0) return () => {};
  const snapshots = children.slice(Math.min(a, b), Math.max(a, b) + 1).map(capture);
  return () => {
    if (
      root.childNodes.length !== children.length ||
      children.some((child, index) => root.childNodes[index] !== child)
    )
      root.replaceChildren(...children);
    snapshots.forEach(restore);
  };
}
