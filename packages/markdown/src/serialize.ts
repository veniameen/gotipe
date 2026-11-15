import { atomsIn, carried } from "./atoms";
import { writeInline } from "./inline-serialize";
import { RICH_TYPES, asWritten, fingerprint, isBlockEmpty, richContent } from "./model";
import { parseInternal } from "./parse";
import { type RNode, type RenderOpts, renderTop, writesNoLine } from "./serialization/blocks";
import { closingLine } from "./serialization/closing";
import {
  LIST_TYPES,
  type Neighbour,
  alternateMarker,
  listSig,
  resolveHazards,
  riskyStart,
} from "./serialization/hazards";
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

interface Item extends Neighbour {
  fp: string;
  md: string;
  node?: RNode;
  start: number;
  end: number;
}

/** The blocks `text` reads as; a line ending first, so that a leading `---` opens no front matter. */
function blockPrints(text: string, eol: string): string[] {
  return parseInternal(eol + text, false).nodes.map((n) => fingerprint(n.block));
}

function readBlocks(text: string, eol: string): string {
  return JSON.stringify(blockPrints(text, eol));
}

/** The first lines of a block: how a block starts decides how it reads after another. */
function head(md: string): string {
  const breaks = /\r\n?|\n/g;
  for (let n = 0; n < 8; n++) if (!breaks.exec(md)) return md;
  return md.slice(0, breaks.lastIndex);
}

/** The blanks that end `s`: at the end of a gap, those before the first line of the next block. */
function indentOf(s: string): string {
  let i = s.length;
  while (i > 0 && (s[i - 1] === " " || s[i - 1] === "\t")) i--;
  return s.slice(i);
}

const withoutIndent = (s: string): string => s.slice(0, s.length - indentOf(s).length);

/**
 * The blanks before the first line of a block in its source. The snapshot keeps them at the end
 * of the gap before the block (of `leading` before the first one), not in the block (D-102).
 */
function sourceIndent(item: Neighbour, snap: MarkdownSnapshot): string {
  return indentOf(item.oi === 0 ? snap.leading : (snap.gaps[item.oi - 1] ?? ""));
}

/**
 * The blanks before its first line that a preserved block needs to read as itself: without them
 * an indented code block reads as a paragraph, and an indented fence keeps them in its code. They
 * move the first item of a list too, and its later lines with it: the whole block is read when
 * its first lines read the same. Raw source keeps them: what they mean in it is not read.
 */
function ownIndent(item: Item, snap: MarkdownSnapshot, eol: string): string {
  if (!item.preserved) return "";
  const blanks = sourceIndent(item, snap);
  if (!blanks || item.block.type === "markdownRaw") return blanks;
  const differs = (md: string): boolean => readBlocks(md, eol) !== readBlocks(blanks + md, eol);
  const start = head(item.md);
  return differs(start) || (start !== item.md && differs(item.md)) ? blanks : "";
}

/**
 * Whether two blocks, one of them rewritten, read the same with the gap of their source between
 * them as with `apart`, a blank line. A gap without a blank line may hold on how the source of a
 * block ended: the `>` line that ends the paragraph of a quote keeps the next paragraph out of it
 * (D-99), while a table with merged cells, rewritten as HTML, ends only at a blank line.
 */
function gapHolds(before: string, b: Item, [gap, apart]: [string, string], eol: string): boolean {
  const after = head(b.md);
  return readBlocks(before + gap + after, eol) === readBlocks(before + apart + after, eol);
}

/**
 * Whether `b`, written after `before` and `gap`, starts blocks of its own: blanks before its first
 * line can carry it into the block before it, code into the last item of a list or into code.
 * Where blocks begin and end is read, not what they hold: references resolve only in context.
 */
function standsApart(before: string, gap: string, b: Item, eol: string): boolean {
  const line = eol.length + before.length + withoutIndent(gap).length;
  const { nodes } = parseInternal(eol + before + gap + head(b.md), false);
  return nodes.some((n) => n.start >= line) && nodes.every((n) => n.start >= line || n.end <= line);
}

/**
 * The text between `a`, written after the blanks `aIndent`, and `b`; `null` when the blanks that
 * start `b` would carry it into `a`. Neighbours in the source keep their gap, and its blanks belong
 * to `b`: an untouched block keeps them where it stands apart with them, or else where it needs
 * them; a rewritten block is written without them.
 */
function gapBetween(
  a: Item,
  aIndent: string,
  b: Item,
  snap: MarkdownSnapshot | undefined,
  eol: string,
): string | null {
  if (!snap) return eol + eol;
  const near = a.oi >= 0 && b.oi === a.oi + 1;
  const g = near ? (snap.gaps[a.oi] ?? eol + eol) : eol + eol;
  if (near && a.preserved && b.preserved && aIndent === sourceIndent(a, snap)) return g;
  const own = ownIndent(b, snap, eol);
  const before = aIndent + a.md;
  const lines = near && countLineEndings(g) >= 2 ? withoutIndent(g) : eol + eol;
  let tries = b.preserved ? [lines + sourceIndent(b, snap), lines + own] : [lines];
  if (near && countLineEndings(g) < 2) {
    // a blank line, and the blanks a preserved block needs; a rewritten block does not take the
    // blanks of the gap: its lines are not those of its source
    const kept = b.preserved ? g : withoutIndent(g);
    const holds =
      a.block.type === snap.blocks[a.oi]!.type &&
      b.block.type === snap.blocks[b.oi]!.type &&
      !riskyStart(b) &&
      gapHolds(before, b, [kept, eol + eol + own], eol);
    tries = [holds ? kept : eol + eol + own];
  }
  // a preserved block may start with blanks of its own: indented code keeps a tab
  const blank = b.preserved && /^[ \t]/.test(b.md);
  for (const gap of new Set(tries)) {
    if (!b.preserved || !(blank || indentOf(gap)) || standsApart(before, gap, b, eol)) return gap;
  }
  return null;
}

/**
 * The text before each block: the gaps, and before the first block the empty lines of `leading`.
 * Where a preserved block would go into the block before it or lose the blanks of its source,
 * that block takes back its own blanks; failing that, the preserved block loses blanks it does
 * not need or is rewritten: indented code after a list or after indented code becomes a fence.
 */
function separators(
  items: Item[],
  snap: MarkdownSnapshot | undefined,
  eol: string,
  rewrite: (i: number) => void,
): string[] {
  const first = items[0];
  if (!first) return [];
  const seps = [snap ? withoutIndent(snap.leading) : ""];
  if (snap && first.preserved) seps[0] += sourceIndent(first, snap);
  // A block takes back the blanks of its source where it reads the same with them and stands
  // apart from the block before it, which may take back its own for that; more blanks before a
  // block take nothing after it in. What a failed attempt took back is given up again.
  const blanksOf = (x: Item): string => (snap && x.oi >= 0 ? sourceIndent(x, snap) : "");
  const takeBack = (j: number, taken: [number, string][]): boolean => {
    const x = items[j]!;
    const blanks = blanksOf(x);
    if (!blanks || blanks === indentOf(seps[j]!)) return false;
    const lead = withoutIndent(seps[j]!) + blanks;
    const prev = items[j - 1];
    const apart = (): boolean =>
      !prev || standsApart(indentOf(seps[j - 1]!) + prev.md, lead, x, eol);
    if (!x.preserved && readBlocks(blanks + x.md, eol) !== readBlocks(x.md, eol)) return false;
    if (!apart() && !(takeBack(j - 1, taken) && apart())) return false;
    taken.push([j, seps[j]!]);
    seps[j] = lead;
    return true;
  };
  for (let i = 1; i < items.length; i++) {
    const [a, b] = [items[i - 1]!, items[i]!];
    let gap = gapBetween(a, indentOf(seps[i - 1]!), b, snap, eol);
    // `b` would go into `a` or lose the blanks of its source: those of `a` may keep them
    const own = snap && b.preserved ? sourceIndent(b, snap) : "";
    const blanks = blanksOf(a);
    if ((gap === null || indentOf(gap) !== own) && blanks && blanks !== indentOf(seps[i - 1]!)) {
      const back = gapBetween(a, blanks, b, snap, eol);
      const taken: [number, string][] = [];
      if (back !== null && (gap === null || indentOf(back) === own)) {
        if (takeBack(i - 1, taken)) gap = back;
        else for (const [j, sep] of taken.reverse()) seps[j] = sep;
      }
    }
    if (gap === null) {
      rewrite(i);
      // a rewritten block is written without blanks: nothing carries it into `a`
      gap = gapBetween(a, indentOf(seps[i - 1]!), b, snap, eol)!;
    }
    seps.push(gap);
  }
  return seps;
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
    // a block that writes no line, such as a list without items (D-124) or raw source of blanks,
    // keeps no lists apart (D-123): it is not written
    if (!preserved && (isBlockEmpty(block) || writesNoLine(block))) continue;
    items.push({ block, oi, preserved, fp, md: "", start: 0, end: 0 });
  }
  resolveHazards(items, snap, fm, (item) => (snap ? sourceIndent(item, snap) : ""));
  // Names of the document's custom emoji: typed text that looks like one is escaped.
  const registry: InlineAtoms = {};
  for (const block of doc?.blocks ?? []) if (block) atomsIn(block, registry);
  const emoji = registry.customEmoji;

  const render = (item: Item): void => {
    if (item.preserved && snap) {
      const sb = snap.blocks[item.oi]!;
      item.md = item.raw ?? snap.text.slice(sb.start, sb.end);
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
      item.md = item.raw ?? r.md;
      item.node = r.node;
    }
    // a block the end of its file ended takes in the next one: written as it is, it gets its end
    // (D-106); the writer ends a code block and a formula itself
    const copied = item.preserved
      ? item.oi === snap!.blocks.length - 1
      : typeof item.block.content === "string" && !["codeBlock", "math"].includes(item.block.type);
    if (copied && item !== items[items.length - 1]) {
      item.md += closingLine(item.md, item.preserved ? sourceIndent(item, snap!) : "", eol);
    }
  };
  for (const item of items) render(item);
  const rewrite = (i: number): void => {
    const item = items[i]!;
    item.preserved = false;
    // its marker now comes from its attributes: not the marker of a list next to it
    const sig = listSig(item, snap);
    const around = [items[i - 1], items[i + 1]].map((n) => (n ? listSig(n, snap) : null));
    if (sig && LIST_TYPES.has(item.block.type) && around.includes(sig)) {
      item.markerOverride = alternateMarker(sig, around);
    }
    render(item);
  };

  const assemble = (): string => {
    let text = bom + fm;
    if (fm && items.length > 0 && !/[\r\n]$/.test(fm)) text += eol;
    if (items.length === 0) {
      if (!snap || snap.blocks.length === 0) text += (snap?.leading ?? "") + (snap?.trailing ?? "");
      return text;
    }
    const seps = separators(items, snap, eol, rewrite);
    items.forEach((item, i) => {
      text += seps[i]!;
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
    // the block with the end it got (D-106)
    tree.end = item.end - item.start;
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
