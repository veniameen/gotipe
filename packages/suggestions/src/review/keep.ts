import type { BlockView, Decoration } from "@gotipe/core";

/** Deep equality of plain data (JSON values); the same object is equal at once. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const key of ka) {
    if (!sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
      return false;
  }
  return true;
}

/** `next`, item by item what `keep` gives; `previous` itself when nothing changed. */
function keepList<T>(previous: T[], next: T[], keep: (was: T | undefined, now: T) => T): T[] {
  let same = previous.length === next.length;
  const out = next.map((now, index) => {
    const kept = keep(previous[index], now);
    if (kept !== previous[index]) same = false;
    return kept;
  });
  return same ? previous : out;
}

/** A new block: the block it was while nothing of it changed, its unchanged children kept. */
function keepBlock(was: BlockView | undefined, now: BlockView): BlockView {
  if (!was || was.id !== now.id) return now;
  const children = keepList(was.children, now.children, keepBlock);
  const decorations = keepList(was.decorations, now.decorations, keepDecoration);
  if (
    children === was.children &&
    decorations === was.decorations &&
    was.type === now.type &&
    sameData(was.attrs, now.attrs) &&
    sameData(was.content, now.content)
  )
    return was;
  return { ...now, children, decorations };
}

function keepDecoration(was: Decoration | undefined, now: Decoration): Decoration {
  if (!was || was.type !== now.type) return now;
  if (was.type === "blocks" && now.type === "blocks") {
    const blocks = keepList(was.blocks, now.blocks, keepBlock);
    const { blocks: _was, ...before } = was;
    const { blocks: _now, ...after } = now;
    if (blocks === was.blocks && sameData(before, after)) return was;
    // the attributes and style of the group keep their objects: a renderer compares them
    return {
      ...now,
      blocks,
      attrs: sameData(was.attrs, now.attrs) ? was.attrs : now.attrs,
      style: sameData(was.style, now.style) ? was.style : now.style,
    };
  }
  return sameData(was, now) ? was : now;
}

/**
 * `next` with the objects of `previous` wherever nothing changed: a decoration with the same
 * key and the same values is the same object, and so is an unchanged new block inside a changed
 * group. A renderer that redraws what is a new object then redraws only what changed.
 */
export function keepDecorations(previous: Decoration[], next: Decoration[]): Decoration[] {
  const byKey = new Map<string, Decoration>();
  for (const d of previous) if ("key" in d) byKey.set(d.key, d);
  return next.map((d) => ("key" in d ? keepDecoration(byKey.get(d.key), d) : d));
}
