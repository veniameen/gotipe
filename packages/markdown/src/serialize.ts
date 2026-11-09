import { type InlineOptions, linkDestination, linkTitle, writeInline } from "./inline-serialize";
import {
  AGENT_LABEL,
  RICH_TYPES,
  calloutKind,
  clampLevel,
  fingerprint,
  isBlockEmpty,
  listStart,
  normalizeAlign,
  richContent,
} from "./model";
import { parseInternal } from "./parse";
import type {
  Block,
  Doc,
  MapBlock,
  MarkdownMap,
  MarkdownSnapshot,
  RawSegment,
  SerializeResult,
  SnapshotBlock,
  SnapshotNode,
  Span,
  TextSegment,
} from "./types";
import { countLineEndings, detectFrontMatter, normalizeEol } from "./util";

/** Rendered block tree (offsets relative to the top-level block start). */
interface RNode {
  id: string;
  type: string;
  start: number;
  end: number;
  segs: RawSegment[];
  children: RNode[];
}

interface RenderOpts {
  eol: string;
  tier: number;
  /** Write a divider as `***` (first block of a file without front matter). */
  dividerAlt?: boolean;
  /** Marker (bullet char or ordered delimiter) to use for a top-level list. */
  markerOverride?: string;
}

class Writer {
  s = "";
  write(x: string): void {
    this.s += x;
  }
  get pos(): number {
    return this.s.length;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

function inline(
  w: Writer,
  spans: Span[],
  o: Omit<InlineOptions, "tier" | "eol">,
  ro: RenderOpts,
): RawSegment[] {
  const r = writeInline(spans, { ...o, eol: ro.eol, tier: ro.tier });
  const at = w.pos;
  w.write(r.md);
  return r.segs.map((s) => ({ ...s, mdFrom: s.mdFrom + at, mdTo: s.mdTo + at }));
}

const ENTITY_GLOBAL = /&(?=(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});)/g;

function infoString(language: string, meta: string): string {
  const info = (meta ? `${language} ${meta}` : language).replace(/\r\n?|\n/g, " ");
  return info.replace(/\\(?=[!-/:-@[-`{-~])/g, "\\\\").replace(ENTITY_GLOBAL, "\\&");
}

function longestRun(s: string, ch: string): number {
  let best = 0;
  let cur = 0;
  for (const c of s) {
    if (c === ch) {
      cur++;
      if (cur > best) best = cur;
    } else cur = 0;
  }
  return best;
}

function plainAlt(text: string, ro: RenderOpts): string {
  return writeInline([{ text, marks: [] }], {
    kind: "alt",
    eol: ro.eol,
    newline: " ",
    hard: false,
    tier: 2,
  }).md;
}

function bulletMarker(attrs: Record<string, unknown>, override?: string): string {
  const m = override ?? attrs.marker;
  return m === "*" || m === "+" || m === "-" ? m : "-";
}

/** Ordered lists not starting at 1 and lists starting with an empty item cannot interrupt a paragraph. */
function cannotInterrupt(list: Block): boolean {
  if (list.type === "orderedList" && listStart(list.attrs?.start) !== 1) return true;
  if (list.type === "bulletList" || list.type === "orderedList" || list.type === "todoList") {
    const first = list.children?.[0];
    return !first || (richContent(first).length === 0 && list.type !== "todoList");
  }
  return false;
}

function renderList(w: Writer, block: Block, indent: string, ro: RenderOpts, node: RNode): void {
  const attrs = block.attrs ?? {};
  const items = block.children ?? [];
  const spread = attrs.spread === true;
  const ordered = block.type === "orderedList";
  const todo = block.type === "todoList";
  const start = listStart(attrs.start);
  const delim = (ro.markerOverride ?? attrs.delimiter) === ")" ? ")" : ".";
  const bullet = bulletMarker(attrs, ro.markerOverride);
  const inner: RenderOpts = { ...ro, markerOverride: undefined };
  items.forEach((item, idx) => {
    if (idx > 0) {
      w.write(ro.eol);
      if (spread) w.write(ro.eol);
      w.write(indent);
    }
    const itemNode: RNode = {
      id: item.id,
      type: item.type,
      start: w.pos,
      end: w.pos,
      segs: [],
      children: [],
    };
    const marker = ordered ? `${start + idx}${delim}` : bullet;
    w.write(marker);
    const contIndent = indent + " ".repeat(marker.length + 1);
    const spans = richContent(item);
    const hard = item.attrs?.breaks === "hard";
    if (todo) {
      w.write(item.attrs?.checked === true ? " [x]" : " [ ]");
      if (spans.length > 0) {
        w.write(" ");
        itemNode.segs = inline(
          w,
          spans,
          { kind: "midline", newline: ro.eol + contIndent, hard },
          inner,
        );
      }
    } else {
      if (spans.length > 0) {
        w.write(" ");
        itemNode.segs = inline(
          w,
          spans,
          { kind: "block", newline: ro.eol + contIndent, hard },
          inner,
        );
      }
      for (const child of item.children ?? []) {
        w.write(ro.eol);
        // Lists that cannot interrupt a paragraph need a blank line before them.
        if (spread || (spans.length > 0 && cannotInterrupt(child))) w.write(ro.eol);
        w.write(contIndent);
        itemNode.children.push(renderBlock(w, child, contIndent, inner));
      }
    }
    itemNode.end = w.pos;
    node.children.push(itemNode);
  });
}

function renderTable(w: Writer, block: Block, indent: string, ro: RenderOpts, node: RNode): void {
  const rows = block.children ?? [];
  const cols = Math.max(1, rows[0]?.children?.length ?? 0);
  const align = Array.isArray(block.attrs?.align) ? block.attrs.align : [];
  const writeRow = (row: Block): void => {
    const rowNode: RNode = {
      id: row.id,
      type: row.type,
      start: w.pos,
      end: w.pos,
      segs: [],
      children: [],
    };
    w.write("|");
    const cells = row.children ?? [];
    if (cells.length === 0) w.write(" |");
    for (const cell of cells) {
      w.write(" ");
      const cellNode: RNode = {
        id: cell.id,
        type: cell.type,
        start: w.pos,
        end: w.pos,
        segs: [],
        children: [],
      };
      cellNode.segs = inline(w, richContent(cell), { kind: "cell", newline: " ", hard: false }, ro);
      cellNode.end = w.pos;
      rowNode.children.push(cellNode);
      w.write(" |");
    }
    rowNode.end = w.pos;
    node.children.push(rowNode);
  };
  rows.forEach((row, idx) => {
    if (idx > 0) w.write(ro.eol + indent);
    writeRow(row);
    if (idx === 0) {
      w.write(ro.eol + indent);
      let line = "|";
      for (let c = 0; c < cols; c++) {
        const a = normalizeAlign(align[c]);
        const d = a === "left" ? ":---" : a === "right" ? "---:" : a === "center" ? ":---:" : "---";
        line += ` ${d} |`;
      }
      w.write(line);
    }
  });
}

function renderBlock(w: Writer, block: Block, indent: string, ro: RenderOpts): RNode {
  const node: RNode = {
    id: block.id,
    type: block.type,
    start: w.pos,
    end: w.pos,
    segs: [],
    children: [],
  };
  const attrs = block.attrs ?? {};
  const spans = Array.isArray(block.content) ? richContent(block) : [];
  const hard = attrs.breaks === "hard";
  switch (block.type) {
    case "paragraph":
      node.segs = inline(w, spans, { kind: "block", newline: ro.eol + indent, hard }, ro);
      break;
    case "heading":
      w.write("#".repeat(clampLevel(attrs.level)));
      if (spans.length > 0) {
        w.write(" ");
        node.segs = inline(w, spans, { kind: "heading", newline: " ", hard: false }, ro);
      }
      break;
    case "blockquote":
      if (spans.length === 0) w.write(">");
      else {
        w.write("> ");
        node.segs = inline(w, spans, { kind: "block", newline: `${ro.eol + indent}> `, hard }, ro);
      }
      break;
    case "callout": {
      const kind = calloutKind(attrs);
      const newline = `${ro.eol + indent}> `;
      if (kind === "agent") {
        w.write(`> **${AGENT_LABEL}**`);
        if (spans.length > 0) {
          w.write(" ");
          node.segs = inline(w, spans, { kind: "midline", newline, hard }, ro);
        }
      } else {
        w.write(`> [!${kind}]`);
        if (spans.length > 0) {
          w.write(newline);
          node.segs = inline(w, spans, { kind: "block", newline, hard, continuation: true }, ro);
        }
      }
      break;
    }
    case "codeBlock": {
      const content = normalizeEol(
        typeof block.content === "string" ? block.content : spans.map((s) => s.text).join(""),
      );
      const info = infoString(str(attrs.language), str(attrs.meta));
      const fc = info.includes("`") ? "~" : "`";
      const fence = fc.repeat(Math.max(3, longestRun(content, fc) + 1));
      w.write(fence + info);
      if (content.length > 0) {
        const lines = content.split("\n");
        let ti = 0;
        lines.forEach((line, idx) => {
          const at = w.pos;
          w.write(ro.eol + indent);
          if (idx > 0) {
            node.segs.push({
              textFrom: ti - 1,
              textTo: ti,
              mdFrom: at,
              mdTo: at + ro.eol.length,
              exact: ro.eol === "\n",
            });
          }
          if (line.length > 0) {
            node.segs.push({
              textFrom: ti,
              textTo: ti + line.length,
              mdFrom: w.pos,
              mdTo: w.pos + line.length,
              exact: true,
            });
          }
          w.write(line);
          ti += line.length + 1;
        });
      }
      w.write(ro.eol + indent + fence);
      break;
    }
    case "divider":
      w.write(ro.dividerAlt ? "***" : "---");
      break;
    case "image": {
      const caption = str(attrs.caption);
      w.write(
        `![${plainAlt(str(attrs.alt), ro)}](${linkDestination(str(attrs.src))}${
          caption ? ` ${linkTitle(caption)}` : ""
        })`,
      );
      break;
    }
    case "file":
      w.write(`[${plainAlt(str(attrs.name), ro)}](${linkDestination(str(attrs.url))})`);
      break;
    case "table":
      renderTable(w, block, indent, ro, node);
      break;
    case "bulletList":
    case "orderedList":
    case "todoList":
      renderList(w, block, indent, ro, node);
      break;
    case "markdownRaw":
      w.write(typeof block.content === "string" ? block.content : "");
      break;
    default: {
      if (typeof block.content === "string") w.write(block.content);
      else if (Array.isArray(block.content)) {
        node.segs = inline(w, spans, { kind: "block", newline: ro.eol + indent, hard }, ro);
      } else {
        (block.children ?? []).forEach((child, idx) => {
          if (idx > 0) w.write(ro.eol + ro.eol + indent);
          node.children.push(renderBlock(w, child, indent, ro));
        });
      }
    }
  }
  node.end = w.pos;
  return node;
}

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

function renderTop(block: Block, ro: RenderOpts): { md: string; node: RNode } {
  const w = new Writer();
  const node = renderBlock(w, block, "", ro);
  return { md: w.s, node };
}

/**
 * Render a top-level block; the output is re-parsed and the first rendering
 * strategy that round-trips (same fingerprint) wins.
 */
function renderVerified(
  block: Block,
  eol: string,
  extra: Pick<RenderOpts, "dividerAlt" | "markerOverride"> = {},
): { md: string; node: RNode } {
  const tiers = verificationTiers(block);
  if (!tiers) return renderTop(block, { eol, tier: 1, ...extra });
  const target = fingerprint(block);
  let first: { md: string; node: RNode } | null = null;
  for (const tier of tiers) {
    const r = renderTop(block, { eol, tier, ...extra });
    if (!first) first = r;
    const p = parseInternal(r.md, false);
    if (p.nodes.length === 1 && fingerprint(p.nodes[0]!.block) === target) return r;
  }
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
        hard: false,
        tier: 1,
      }).md;
    case "tableRow": {
      const cells = (block.children ?? []).map(
        (c) =>
          writeInline(richContent(c), { kind: "cell", eol, newline: " ", hard: false, tier: 1 }).md,
      );
      return `|${cells.map((c) => ` ${c} |`).join("")}`;
    }
    default:
      return renderVerified(block, eol).md;
  }
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

function gapBetween(a: Item, b: Item, snap: MarkdownSnapshot | undefined, eol: string): string {
  if (snap && a.oi >= 0 && b.oi === a.oi + 1) {
    const g = snap.gaps[a.oi] ?? eol + eol;
    if (countLineEndings(g) >= 2) return g;
    if (a.preserved && b.preserved) return g;
    if (
      a.block.type === snap.blocks[a.oi]!.type &&
      b.block.type === snap.blocks[b.oi]!.type &&
      !riskyStart(b)
    ) {
      return g;
    }
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

  const render = (item: Item): void => {
    if (item.preserved && snap) {
      const sb = snap.blocks[item.oi]!;
      item.md = snap.text.slice(sb.start, sb.end);
      item.node = undefined;
    } else {
      const r = renderVerified(item.block, eol, {
        dividerAlt: item.dividerAlt,
        markerOverride: item.markerOverride,
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
