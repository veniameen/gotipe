import { readBlockNodes } from "../grammar/blocks";
import type { List } from "../grammar/types";
import { listStart, richContent } from "../model";
import type { Block, MarkdownSnapshot } from "../types";
import { bulletMarker } from "./blocks";

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
 * Neighbours that would read as one block: a divider that starts the file is `***`, and of two
 * lists with one marker the later takes another, the earlier one beside a raw list (unless that
 * joins it to the list before it), and of two raw lists the source of the later (or else of the
 * earlier) gets another marker. Neighbours in the source written as their source stay as they
 * are. `blanks` gives the blanks before the first line of an untouched block in its source.
 */
export function resolveHazards(
  items: Neighbour[],
  snap: MarkdownSnapshot | undefined,
  fm: string,
  blanks: (item: Neighbour) => string,
): void {
  const first = items[0];
  if (first && !fm && first.block.type === "divider" && !first.preserved) first.dividerAlt = true;
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1]!;
    const b = items[i]!;
    // neighbours in the source written as they are there read as they did there
    const asSource = a.raw === undefined && b.raw === undefined;
    if (a.preserved && b.preserved && b.oi === a.oi + 1 && asSource) continue;
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
