import { atomsIn, carried } from "./atoms";
import { writeInline } from "./inline-serialize";
import { RICH_TYPES, asWritten, fingerprint, isBlockEmpty, listStart, richContent } from "./model";
import { parseInternal } from "./parse";
import { type RNode, type RenderOpts, bulletMarker, renderTop } from "./serialization/blocks";
import { type KeptBreaks, blockText, keptBreaks, snapshotLines } from "./serialization/line-breaks";
import type {
  Block,
  Doc,
  InlineAtoms,
  MapBlock,
  MarkdownMap,
  MarkdownSnapshot,
  SerializeResult,
  SnapshotBlock,
  SnapshotNode,
  TextSegment,
} from "./types";
import { countLineEndings, detectFrontMatter } from "./util";

function walkBlocks(block: Block, fn: (b: Block) => void): void {
  fn(block);
  for (const c of block.children ?? []) walkBlocks(c, fn);
}

function verificationTiers(block: Block): number[] | null {
  let rich = block.type === "image" || block.type === "file";
  let links = false;
  let marks = false;
  walkBlocks(block, (b) => {
    if (RICH_TYPES.has(b.type) || Array.isArray(b.content)) rich = true;
    if (Array.isArray(b.content)) {
      for (const s of b.content) {
        for (const m of s?.marks ?? []) {
          marks = true;
          if (m.type === "link") links = true;
        }
      }
    }
  });
  if (!rich) return null;
  if (links) return [0, 1, 2];
  return marks ? [1, 2] : [1];
}

/**
 * Render a top-level block; the output is re-parsed and the first rendering
 * strategy that round-trips (same fingerprint) wins.
 */
function renderVerified(
  block: Block,
  eol: string,
  options: Pick<
    RenderOpts,
    "dividerAlt" | "markerOverride" | "emoji" | "softBreaks" | "spelling"
  > = {},
): { md: string; node: RNode } {
  const emoji = options.emoji ?? atomsIn(block)?.customEmoji;
  const extra = emoji ? { ...options, emoji } : options;
  const tiers = verificationTiers(block);
  if (!tiers) return renderTop(block, { eol, tier: 1, ...extra });
  // Atoms are read back when asked for, with the reader's own keys: compare what is carried.
  // Custom emoji are read with every name the document registers.
  const found = atomsIn(block);
  const atoms =
    found || emoji ? { ...found, ...(emoji ? { customEmoji: { ...emoji } } : {}) } : undefined;
  const print = (b: Block): string => fingerprint(asWritten(atoms ? carried(b) : b));
  const target = print(block);
  let first: { md: string; node: RNode } | null = null;
  for (const tier of tiers) {
    const r = renderTop(block, { eol, tier, ...extra });
    if (!first) first = r;
    const p = parseInternal(r.md, false, atoms);
    if (p.nodes.length === 1 && print(p.nodes[0]!.block) === target) return r;
  }
  // a kept line ending that does not read back the same (a space at an edge, in code before
  // indentation): the block is written with the kept lines in canonical syntax, then without the
  // snapshot's lines rather than changed
  if (options.softBreaks && options.spelling !== false)
    return renderVerified(block, eol, { ...options, spelling: false });
  if (options.softBreaks) return renderVerified(block, eol, { ...options, softBreaks: undefined });
  return first!;
}

/** Serialize a single block to Markdown (no surrounding blank lines). */
export function blockToMarkdown(block: Block, eol = "\n"): string {
  switch (block.type) {
    case "listItem":
      return renderVerified(
        { id: "", type: "bulletList", attrs: {}, content: null, children: [block] },
        eol,
      ).md;
    case "todoItem":
      return renderVerified(
        { id: "", type: "todoList", attrs: {}, content: null, children: [block] },
        eol,
      ).md;
    case "tableCell":
    case "tableHeader":
      return writeInline(richContent(block), {
        kind: "cell",
        eol,
        newline: " ",
        tier: 1,
        emoji: atomsIn(block)?.customEmoji,
      }).md;
    case "tableRow": {
      const cells = (block.children ?? []).map(
        (c) => writeInline(richContent(c), { kind: "cell", eol, newline: " ", tier: 1 }).md,
      );
      return `|${cells.map((c) => ` ${c} |`).join("")}`;
    }
    default:
      return renderVerified(block, eol).md;
  }
}

/**
 * Where an edited block keeps the line endings of its soft breaks (D-88) and how its source
 * spelled its line breaks (D-93): read from its source in the snapshot, with the atoms its text
 * was read with; once per block.
 */
function keptLines(
  text: string,
  old: SnapshotBlock,
  block: Block,
  emoji: Readonly<Record<string, string>> | undefined,
): RenderOpts["softBreaks"] {
  const found = atomsIn(block);
  const atoms =
    found || emoji ? { ...found, ...(emoji ? { customEmoji: { ...emoji } } : {}) } : undefined;
  const lines = snapshotLines(text, old, atoms);
  if (lines.size === 0) return undefined;
  const cache = new Map<string, KeptBreaks | undefined>();
  return (inner) => {
    if (!cache.has(inner.id)) {
      const before = lines.get(inner.id);
      cache.set(inner.id, before && keptBreaks(before, blockText(inner)));
    }
    return cache.get(inner.id);
  };
}

interface Item {
  block: Block;
  oi: number;
  preserved: boolean;
  fp: string;
  md: string;
  node?: RNode;
  dividerAlt?: boolean;
  markerOverride?: string;
  start: number;
  end: number;
}

const LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);

function listSig(item: Item, snap: MarkdownSnapshot | undefined): string | null {
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

function alternateMarker(sig: string, avoid: (string | null)[]): string {
  if (sig[0] === "o") return sig[1] === "." ? ")" : ".";
  for (const m of ["-", "*", "+"]) {
    if (`b${m}` !== sig && !avoid.includes(`b${m}`)) return m;
  }
  return sig[1] === "-" ? "*" : "-";
}

function resolveHazards(items: Item[], snap: MarkdownSnapshot | undefined, fm: string): void {
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
    // An indented code block after a list would become part of the last list item.
    if (
      sa &&
      b.preserved &&
      b.block.type === "codeBlock" &&
      snap &&
      /^[ \t]/.test(snap.text.slice(snap.blocks[b.oi]!.start, snap.blocks[b.oi]!.end))
    ) {
      b.preserved = false;
    }
  }
}

function riskyStart(item: Item): boolean {
  if (item.preserved) return false;
  const b = item.block;
  if (b.type === "orderedList" && listStart(b.attrs?.start) !== 1) return true;
  if (LIST_TYPES.has(b.type)) {
    const firstItem = b.children?.[0];
    if (!firstItem || richContent(firstItem).length === 0) return true;
  }
  return false;
}

/** The blocks `text` reads as; a line ending first, so that a leading `---` opens no front matter. */
function readBlocks(text: string, eol: string): string {
  return JSON.stringify(parseInternal(eol + text, false).nodes.map((n) => fingerprint(n.block)));
}

/** The first lines of a block: how a block starts decides how it reads after another. */
function head(md: string): string {
  const breaks = /\r\n?|\n/g;
  for (let n = 0; n < 8; n++) if (!breaks.exec(md)) return md;
  return md.slice(0, breaks.lastIndex);
}

/**
 * The blanks before the first line of a preserved block that it needs to read as itself. The
 * snapshot keeps them in the gap before the block (in `leading` before the first one); without
 * them an indented code block reads as a paragraph, and an indented fence keeps them in its code.
 */
function ownIndent(item: Item, snap: MarkdownSnapshot, eol: string): string {
  if (!item.preserved) return "";
  const blanks = /[ \t]*$/.exec(item.oi === 0 ? snap.leading : (snap.gaps[item.oi - 1] ?? ""))![0];
  const start = head(item.md);
  return blanks && readBlocks(start, eol) !== readBlocks(blanks + start, eol) ? blanks : "";
}

/**
 * Whether two blocks, one of them rewritten, read the same with the gap of their source between
 * them as with `apart`, a blank line. A gap without a blank line may hold on how the source of a
 * block ended: the `>` line that ends the paragraph of a quote keeps the next paragraph out of it
 * (D-99), while a table with merged cells, rewritten as HTML, ends only at a blank line.
 */
function gapHolds(
  a: Item,
  b: Item,
  [gap, apart]: [string, string],
  snap: MarkdownSnapshot,
  eol: string,
): boolean {
  const before = ownIndent(a, snap, eol) + a.md;
  const after = head(b.md);
  return readBlocks(before + gap + after, eol) === readBlocks(before + apart + after, eol);
}

function gapBetween(a: Item, b: Item, snap: MarkdownSnapshot | undefined, eol: string): string {
  if (snap && a.oi >= 0 && b.oi === a.oi + 1) {
    const g = snap.gaps[a.oi] ?? eol + eol;
    if (countLineEndings(g) >= 2) return g;
    if (a.preserved && b.preserved) return g;
    // a blank line, and the blanks the first line of a preserved block needs
    const apart = eol + eol + ownIndent(b, snap, eol);
    if (
      a.block.type === snap.blocks[a.oi]!.type &&
      b.block.type === snap.blocks[b.oi]!.type &&
      !riskyStart(b) &&
      gapHolds(a, b, [g, apart], snap, eol)
    ) {
      return g;
    }
    return apart;
  }
  return eol + eol;
}

function remapTree(sn: SnapshotNode, b: Block, ids: Map<string, string>): SnapshotNode {
  ids.set(sn.id, b.id);
  return {
    id: b.id,
    type: b.type,
    start: sn.start,
    end: sn.end,
    children: sn.children.map((c, i) => {
      const child = b.children?.[i];
      return child ? remapTree(c, child, ids) : c;
    }),
  };
}

function rnodeToSnapshot(n: RNode, segs: TextSegment[]): SnapshotNode {
  for (const s of n.segs) segs.push({ blockId: n.id, ...s });
  return {
    id: n.id,
    type: n.type,
    start: n.start,
    end: n.end,
    children: n.children.map((c) => rnodeToSnapshot(c, segs)),
  };
}

/**
 * Serialize a document. Blocks whose id and fingerprint match the snapshot are
 * emitted verbatim (with their original gaps); others are re-serialized.
 */
export function serializeMarkdown(doc: Doc, snapshot?: MarkdownSnapshot): SerializeResult {
  const snap = snapshot && snapshot.version === 1 ? snapshot : undefined;
  const eol = snap?.eol ?? "\n";
  const bom = snap?.bom ?? "";
  const fm = snap?.frontMatter ?? "";
  const origIndex = new Map<string, number>();
  snap?.blocks.forEach((b, i) => {
    if (!origIndex.has(b.id)) origIndex.set(b.id, i);
  });
  const usedOrig = new Set<number>();
  const items: Item[] = [];
  for (const block of doc?.blocks ?? []) {
    if (!block || typeof block.type !== "string") continue;
    let oi = origIndex.get(block.id) ?? -1;
    if (oi >= 0 && usedOrig.has(oi)) oi = -1;
    if (oi >= 0) usedOrig.add(oi);
    const fp = fingerprint(block);
    const preserved = oi >= 0 && snap!.blocks[oi]!.fingerprint === fp;
    if (!preserved && isBlockEmpty(block)) continue;
    items.push({ block, oi, preserved, fp, md: "", start: 0, end: 0 });
  }
  resolveHazards(items, snap, fm);
  // Names of the document's custom emoji: typed text that looks like one is escaped.
  const registry: InlineAtoms = {};
  for (const block of doc?.blocks ?? []) if (block) atomsIn(block, registry);
  const emoji = registry.customEmoji;

  const render = (item: Item): void => {
    if (item.preserved && snap) {
      const sb = snap.blocks[item.oi]!;
      item.md = snap.text.slice(sb.start, sb.end);
      item.node = undefined;
    } else {
      const r = renderVerified(item.block, eol, {
        dividerAlt: item.dividerAlt,
        markerOverride: item.markerOverride,
        emoji,
        softBreaks:
          item.oi >= 0 && snap
            ? keptLines(snap.text, snap.blocks[item.oi]!, item.block, emoji)
            : undefined,
      });
      item.md = r.md;
      item.node = r.node;
    }
  };
  for (const item of items) render(item);

  const assemble = (): string => {
    let text = bom + fm;
    if (fm && items.length > 0 && !/[\r\n]$/.test(fm)) text += eol;
    if (items.length === 0) {
      if (!snap || snap.blocks.length === 0) text += (snap?.leading ?? "") + (snap?.trailing ?? "");
      return text;
    }
    text += snap?.leading ?? "";
    items.forEach((item, i) => {
      if (i > 0) text += gapBetween(items[i - 1]!, item, snap, eol);
      item.start = text.length;
      text += item.md;
      item.end = text.length;
    });
    const last = items[items.length - 1]!;
    text += snap && last.oi >= 0 && last.oi === snap.blocks.length - 1 ? snap.trailing : eol;
    return text;
  };
  let text = assemble();
  // A leading `---` divider must not be read back as front matter.
  if (!fm && items[0] && detectFrontMatter(text, bom.length) > bom.length) {
    const first = items[0];
    if (first.block.type === "divider") {
      first.preserved = false;
      first.dividerAlt = true;
      render(first);
      text = assemble();
    }
  }

  const blocks: SnapshotBlock[] = [];
  const mapBlocks: MapBlock[] = [];
  const segments: TextSegment[] = [];
  for (const item of items) {
    let tree: SnapshotNode;
    let segs: TextSegment[];
    if (item.preserved && snap) {
      const sb = snap.blocks[item.oi]!;
      const ids = new Map<string, string>();
      tree = remapTree(
        sb.tree ?? { id: sb.id, type: sb.type, start: 0, end: sb.end - sb.start, children: [] },
        item.block,
        ids,
      );
      segs = (sb.segments ?? []).map((s) => ({ ...s, blockId: ids.get(s.blockId) ?? s.blockId }));
    } else {
      segs = [];
      tree = rnodeToSnapshot(item.node!, segs);
    }
    blocks.push({
      id: item.block.id,
      type: item.block.type,
      start: item.start,
      end: item.end,
      fingerprint: item.fp,
      tree,
      segments: segs,
    });
    const walk = (n: SnapshotNode, depth: number): void => {
      mapBlocks.push({
        blockId: n.id,
        start: n.start + item.start,
        end: n.end + item.start,
        depth,
      });
      for (const c of n.children) walk(c, depth + 1);
    };
    walk(tree, 0);
    for (const s of segs) {
      segments.push({ ...s, mdFrom: s.mdFrom + item.start, mdTo: s.mdTo + item.start });
    }
  }
  segments.sort((a, b) => a.mdFrom - b.mdFrom || a.mdTo - b.mdTo);
  const gaps: string[] = [];
  for (let i = 0; i + 1 < items.length; i++) {
    gaps.push(text.slice(items[i]!.end, items[i + 1]!.start));
  }
  const prefixLen = bom.length + fm.length;
  const firstItem = items[0];
  const lastItem = items[items.length - 1];
  const map: MarkdownMap = { blocks: mapBlocks, segments };
  return {
    text,
    map,
    snapshot: {
      version: 1,
      text,
      bom,
      frontMatter: fm,
      eol,
      leading: text.slice(prefixLen, firstItem ? firstItem.start : text.length),
      blocks,
      gaps,
      trailing: lastItem ? text.slice(lastItem.end) : "",
    },
  };
}
