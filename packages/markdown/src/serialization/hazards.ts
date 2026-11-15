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
}

export const LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);

export function listSig(item: Neighbour, snap: MarkdownSnapshot | undefined): string | null {
  const t = item.block.type;
  const src =
    item.preserved && snap
      ? snap.text.slice(snap.blocks[item.oi]!.start, snap.blocks[item.oi]!.end)
      : null;
  const fromSource = (s: string): string | null => {
    const b = /^[ \t]*([-*+])(?:[ \t]|\r|\n|$)/.exec(s);
    if (b) return `b${b[1]}`;
    const o = /^[ \t]*\d{1,9}([.)])/.exec(s);
    if (o) return `o${o[1]}`;
    return null;
  };
  if (t === "markdownRaw") {
    return item.block.attrs?.kind === "list" && typeof item.block.content === "string"
      ? fromSource(item.block.content)
      : null;
  }
  if (!LIST_TYPES.has(t)) return null;
  if (src !== null) return fromSource(src);
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

export function resolveHazards(
  items: Neighbour[],
  snap: MarkdownSnapshot | undefined,
  fm: string,
): void {
  const first = items[0];
  if (first && !fm && first.block.type === "divider" && !first.preserved) first.dividerAlt = true;
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1]!;
    const b = items[i]!;
    const sa = listSig(a, snap);
    const sb = listSig(b, snap);
    if (sa && sb && sa === sb) {
      if (LIST_TYPES.has(b.block.type)) {
        b.preserved = false;
        b.markerOverride = alternateMarker(sa, [
          items[i + 1] ? listSig(items[i + 1]!, snap) : null,
        ]);
      } else if (LIST_TYPES.has(a.block.type)) {
        a.preserved = false;
        a.markerOverride = alternateMarker(sa, [i >= 2 ? listSig(items[i - 2]!, snap) : null]);
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
