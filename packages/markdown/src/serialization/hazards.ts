import { readBlockNodes } from "../grammar/blocks";
import type { List } from "../grammar/types";
import { bulletMarker, hasRichText, isBlockEmpty, listStart, richContent } from "../model";
import type { Block, MarkdownSnapshot } from "../types";

/**
 * What the protections of a file against its blocks reading as one another know of a top-level
 * block: whether it is written as its source, and how it is written otherwise.
 */
export interface Neighbour {
  block: Block;
  /** Its index in the snapshot; -1 for a block the snapshot does not hold. */
  oi: number;
  /** Written as its source: its id and fingerprint match the snapshot. */
  preserved: boolean;
  /** A divider written as `***`. */
  dividerAlt?: boolean;
  /** The bullet or numbering delimiter a list is written with instead of its own. */
  markerOverride?: string;
  /** The text a raw list is written with instead of its own: its items take another marker. */
  raw?: string;
}

export const LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);

/** Blocks written in syntax of their own: without text they still write a line. */
const OWN_LINE = new Set([
  "heading",
  "codeBlock",
  "blockquote",
  "callout",
  "divider",
  "image",
  "file",
  "embed",
  "math",
  "table",
]);

/** Blocks that hold their children in their syntax: a list its items, a table its rows, a quote. */
const INSIDE = new Set([...LIST_TYPES, "table", "blockquote", "callout"]);

/** An empty formula or an embed without an address has no Markdown at any depth. */
const omitted = (block: Block): boolean =>
  (block.type === "math" || block.type === "embed" || block.type === "table") &&
  isBlockEmpty(block);

/**
 * Whether `block` writes nothing before its children: a block without syntax of its own (a
 * paragraph, a toggle, columns) without text (D-191).
 */
function transparent(block: Block): boolean {
  if (LIST_TYPES.has(block.type) || OWN_LINE.has(block.type)) return false;
  return typeof block.content === "string"
    ? !/[^ \t\r\n]/.test(block.content)
    : !hasRichText(block);
}

/**
 * A block that writes no line but blanks of its own, so it keeps no lists apart and is not
 * written: raw source of blanks, a list without items, and a block without syntax of its own
 * without text whose children write none (D-157). Its blank line after the marker of an item
 * without text would end the item (D-117).
 */
export function writesNoLine(block: Block): boolean {
  if (omitted(block)) return true;
  if (block.type === "markdownRaw")
    return typeof block.content !== "string" || !/[^ \t\r\n]/.test(block.content);
  if (LIST_TYPES.has(block.type)) return !block.children?.length;
  return transparent(block) && (block.children ?? []).every(writesNoLine);
}

/**
 * The neighbours `item` is written as, one after another (D-191): the children of a block that
 * does not hold them in its syntax follow it at its level, and a block that writes nothing before
 * them is only its children. Source written as it is stays one neighbour.
 */
function flat(item: Neighbour): Neighbour[] {
  const { block } = item;
  if (item.preserved || INSIDE.has(block.type)) return [item];
  const children = (block.children ?? [])
    .filter((child) => !writesNoLine(child))
    .flatMap((child) => flat({ block: child, oi: -1, preserved: false }));
  return transparent(block) ? children : [item, ...children];
}

/** `block` with the blocks below it at its level that the protection of lists changed. */
function rebuilt(block: Block, changed: Map<Block, Block>): Block {
  const old = block.children;
  const children = INSIDE.has(block.type)
    ? old
    : old?.map((child) => rebuilt(changed.get(child) ?? child, changed));
  return children?.some((child, i) => child !== old![i]) ? { ...block, children } : block;
}

/** The list that `s` starts with: its bullet, or its numbering delimiter. */
function fromSource(s: string): string | null {
  const b = /^[ \t]*([-*+])(?:[ \t]|\r|\n|$)/.exec(s);
  if (b) return `b${b[1]}`;
  const o = /^[ \t]*\d{1,9}([.)])/.exec(s);
  if (o) return `o${o[1]}`;
  return null;
}

/** The text a block is written with as it is: its source while untouched, or its raw text. */
function written(item: Neighbour, snap: MarkdownSnapshot | undefined): string | null {
  if (item.raw !== undefined) return item.raw;
  if (item.preserved && snap) {
    const sb = snap.blocks[item.oi]!;
    return snap.text.slice(sb.start, sb.end);
  }
  return typeof item.block.content === "string" ? item.block.content : null;
}

export function listSig(item: Neighbour, snap: MarkdownSnapshot | undefined): string | null {
  const t = item.block.type;
  if (t === "markdownRaw") {
    const text = item.block.attrs?.kind === "list" ? written(item, snap) : null;
    return text === null ? null : fromSource(text);
  }
  if (!LIST_TYPES.has(t)) return null;
  if (item.preserved && snap) return fromSource(written(item, snap)!);
  if (t === "orderedList") {
    return `o${(item.markerOverride ?? item.block.attrs?.delimiter) === ")" ? ")" : "."}`;
  }
  return `b${bulletMarker(item.block.attrs ?? {}, item.markerOverride)}`;
}

export function alternateMarker(sig: string, avoid: (string | null)[]): string {
  if (sig[0] === "o") return sig[1] === "." ? ")" : ".";
  for (const m of ["-", "*", "+"]) {
    if (`b${m}` !== sig && !avoid.includes(`b${m}`)) return m;
  }
  return sig[1] === "-" ? "*" : "-";
}

/** The one list that `text` holds; null where it holds other blocks. */
function oneList(text: string): List | null {
  const nodes = readBlockNodes(text);
  const list = nodes[0];
  return nodes.length === 1 && list?.type === "list" ? list : null;
}

/** Where the items of `list` begin and end. */
const spans = (list: List): string =>
  JSON.stringify(list.children.map((item) => [item.position?.start, item.position?.end]));

/**
 * `text`, the source of a list written after the blanks `indent`, with `marker` as the bullet or
 * numbering delimiter of each of its items; null where it would not read as the same items: a line
 * of three `*` is a thematic break, not an item.
 */
function remarked(text: string, indent: string, marker: string): string | null {
  const list = oneList(indent + text);
  if (!list) return null;
  let out = "";
  let from = 0;
  for (const item of list.children) {
    let at = (item.position?.start.offset ?? 0) - indent.length;
    while (/\d/.test(text[at] ?? "")) at++;
    if (!/[-*+.)]/.test(text[at] ?? "")) return null;
    out += text.slice(from, at) + marker;
    from = at + 1;
  }
  out += text.slice(from);
  const again = oneList(indent + out);
  return again && spans(again) === spans(list) ? out : null;
}

/**
 * Gives `item`, a raw list of signature `sig`, another marker at each of its items than its
 * neighbour's and, where it can, than the one of `other`, the list on its other side (D-107): raw
 * source is written as it is, so its own marker would join it to the neighbour. A list `behind`
 * it is never joined: the loop does not come back to it.
 */
function remarkRaw(
  item: Neighbour,
  sig: string,
  other: Neighbour | undefined,
  behind: boolean,
  snap: MarkdownSnapshot | undefined,
  blanks: (item: Neighbour) => string,
): boolean {
  const text = written(item, snap);
  if (text === null) return false;
  const avoid = other ? listSig(other, snap) : null;
  const first = alternateMarker(sig, [avoid]);
  const rest = sig[0] === "o" ? [] : ["-", "*", "+"].filter((m) => m !== first && `b${m}` !== sig);
  for (const marker of [first, ...rest]) {
    if (behind && `${sig[0]}${marker}` === avoid) continue;
    const raw = remarked(text, item.preserved ? blanks(item) : "", marker);
    if (raw !== null) {
      item.raw = raw;
      return true;
    }
  }
  return false;
}

/**
 * Neighbours that would read as one block: a divider that starts the file is `***`, and lists stay
 * apart (`separateLists`). `blanks` gives the blanks before the first line of an untouched block in
 * its source.
 */
export function resolveHazards(
  items: Neighbour[],
  snap: MarkdownSnapshot | undefined,
  fm: string,
  blanks: (item: Neighbour) => string,
): void {
  const first = items[0];
  if (first && !fm && first.block.type === "divider" && !first.preserved) first.dividerAlt = true;
  const kept = items.map((item) => item.preserved);
  for (;;) {
    const changed = separateLists(items, snap, blanks);
    // Source of a block whose children follow it at its level hides from the protection the list
    // it starts or ends with: beside a block not written as its source, the block is written
    // again, and the protection runs anew (D-215). The reader gives no such block: its source is
    // the writer's own.
    const stale = items.flatMap((item, i) =>
      item.preserved &&
      edgeList(item.block) &&
      !(asSource(items[i - 1], item) && asSource(item, items[i + 1]))
        ? [i]
        : [],
    );
    if (!stale.length) {
      for (const item of items) item.block = rebuilt(item.block, changed);
      return;
    }
    for (const i of stale) kept[i] = false;
    items.forEach((item, i) =>
      Object.assign(item, { preserved: kept[i], markerOverride: undefined, raw: undefined }),
    );
  }
}

/** Whether `a` and `b` are neighbours in the source written as they are there, or one is none. */
const asSource = (a: Neighbour | undefined, b: Neighbour | undefined): boolean =>
  !a ||
  !b ||
  (a.preserved && b.preserved && b.oi === a.oi + 1 && a.raw === undefined && b.raw === undefined);

/** Whether `block`, its children written after it at its level, starts or ends with a list. */
function edgeList(block: Block): boolean {
  const parts = INSIDE.has(block.type) ? [] : flat({ block, oi: -1, preserved: false });
  return [parts[0], parts.at(-1)].some(
    (part) => part && part.block !== block && listSig(part, undefined),
  );
}

/**
 * The children `blocks` of one block as they are written one after another, where the protection
 * of lists of the top level changes them, at any depth (D-105): a list with another marker, raw
 * source of a list with another marker at each item, a toggle with such blocks (D-191).
 */
export function siblingBlocks(blocks: readonly Block[]): Map<Block, Block> {
  const items: Neighbour[] = blocks.map((block) => ({ block, oi: -1, preserved: false }));
  const changed = separateLists(items, undefined, () => "");
  return new Map(blocks.map((block) => [block, rebuilt(changed.get(block) ?? block, changed)]));
}

/**
 * Of two lists with one marker the later takes another, the earlier one beside a raw list (unless
 * that joins it to the list before it), and of two raw lists the source of the later (or else of
 * the earlier) gets another marker; the blocks they are written as, one after another (`flat`).
 * Neighbours in the source written as their source stay as they are. The blocks changed, as they
 * are written.
 */
function separateLists(
  top: Neighbour[],
  snap: MarkdownSnapshot | undefined,
  blanks: (item: Neighbour) => string,
): Map<Block, Block> {
  const items = top.flatMap(flat);
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1]!;
    const b = items[i]!;
    // neighbours in the source written as they are there read as they did there
    if (asSource(a, b)) continue;
    const sa = listSig(a, snap);
    const sb = listSig(b, snap);
    if (sa && sb && sa === sb) {
      if (LIST_TYPES.has(b.block.type)) {
        b.preserved = false;
        b.markerOverride = alternateMarker(sa, [
          items[i + 1] ? listSig(items[i + 1]!, snap) : null,
        ]);
      } else if (LIST_TYPES.has(a.block.type)) {
        // a numbered list has one other delimiter: where it would join the list before it, the
        // raw list after it takes another marker instead
        const before = i >= 2 ? listSig(items[i - 2]!, snap) : null;
        const marker = alternateMarker(sa, [before]);
        if (`${sa[0]}${marker}` === before && remarkRaw(b, sa, items[i + 1], false, snap, blanks))
          continue;
        a.preserved = false;
        a.markerOverride = marker;
      } else if (!remarkRaw(b, sa, items[i + 1], false, snap, blanks)) {
        remarkRaw(a, sa, items[i - 2], true, snap, blanks);
      }
    }
  }
  const changed = new Map<Block, Block>();
  for (const { block, markerOverride, raw } of items) {
    if (raw !== undefined) changed.set(block, { ...block, content: raw });
    else if (markerOverride) {
      const name = block.type === "orderedList" ? "delimiter" : "marker";
      changed.set(block, { ...block, attrs: { ...block.attrs, [name]: markerOverride } });
    }
  }
  return changed;
}

export function riskyStart(item: Neighbour): boolean {
  if (item.preserved) return false;
  const b = item.block;
  if (b.type === "orderedList" && listStart(b.attrs?.start) !== 1) return true;
  if (LIST_TYPES.has(b.type)) {
    const firstItem = b.children?.[0];
    if (!firstItem || richContent(firstItem).length === 0) return true;
  }
  return false;
}
