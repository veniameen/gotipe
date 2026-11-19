import type { BlockView, Decoration, MarkView, TextSpanView } from "@gotipe/core";
import type { ReviewPosition } from "../review-types";

const RAW_TYPES = new Set(["codeBlock", "markdownRaw", "math", "embed"]);

export function plainText(block: BlockView): string {
  if (Array.isArray(block.content)) return block.content.map((s) => s.text).join("");
  if (typeof block.content === "string") return block.content;
  return "";
}

function stripIds(block: BlockView): unknown {
  return {
    t: block.type,
    a: block.attrs,
    c: Array.isArray(block.content)
      ? block.content.map((s) => [s.text, s.marks.map((m) => [m.type, m.attrs ?? {}])])
      : block.content,
    k: block.children.map(stripIds),
  };
}

function signature(block: BlockView): string {
  return JSON.stringify(stripIds(block));
}

function sameAttrs(a: BlockView, b: BlockView): boolean {
  return JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

function sameSpans(a: BlockView, b: BlockView): boolean {
  return (
    JSON.stringify(stripIds({ ...a, children: [] })) ===
    JSON.stringify(stripIds({ ...b, children: [] }))
  );
}

/** Spans of `spans` within `[from, to)`. */
export function sliceSpans(spans: TextSpanView[], from: number, to: number): TextSpanView[] {
  const out: TextSpanView[] = [];
  let pos = 0;
  for (const span of spans) {
    const end = pos + span.text.length;
    const a = Math.max(from, pos);
    const b = Math.min(to, end);
    if (b > a) out.push({ text: span.text.slice(a - pos, b - pos), marks: span.marks });
    pos = end;
  }
  return out;
}

/** Longest common subsequence of two signature lists → matched index pairs. */
function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

export interface Ctx {
  pid: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  active: boolean;
  out: Decoration[];
  exact: boolean;
  position: ReviewPosition | null;
  insertEnd: ReviewPosition | null;
  inserted: number;
  seq: number;
}

export function cls(ctx: Ctx, base: string): string {
  return ctx.active ? `${base} is-active` : base;
}

export function key(ctx: Ctx, kind: string): string {
  ctx.seq += 1;
  return `${ctx.pid}:${String(ctx.seq).padStart(4, "0")}:${kind}`;
}

function note(ctx: Ctx, pos: ReviewPosition) {
  if (!ctx.position) ctx.position = pos;
}

function phantomId(ctx: Ctx, block: BlockView): BlockView {
  ctx.seq += 1;
  const id = `phantom:${ctx.pid}:${ctx.seq}:${block.id}`;
  const length = Array.isArray(block.content) ? plainText(block).length : 0;
  return {
    ...block,
    id,
    // the new block's text in its own span, so a host can tint the text rather than the row
    decorations:
      length > 0
        ? [
            {
              type: "inline",
              key: `${id}:text`,
              blockId: id,
              from: 0,
              to: length,
              className: "gotipe-sug-block-ins-text",
            },
          ]
        : [],
    children: block.children.map((c) => phantomId(ctx, c)),
  };
}

function countText(block: BlockView): number {
  return plainText(block).length + block.children.reduce((n, c) => n + countText(c), 0);
}

/** New blocks as phantoms beside `anchor`; a stale proposal's blocks take `gotipe-sug-stale` too. */
export function insertBlocks(
  ctx: Ctx,
  anchor: BlockView,
  position: "before" | "after",
  blocks: BlockView[],
  className = "gotipe-sug gotipe-sug-block-ins",
) {
  if (blocks.length === 0) return;
  ctx.exact = false;
  const phantoms = blocks.map((b) => phantomId(ctx, b));
  ctx.out.push({
    type: "blocks",
    key: key(ctx, "blocks"),
    blockId: anchor.id,
    position,
    blocks: phantoms,
    className: cls(ctx, className),
    attrs: ctx.attrs,
    style: ctx.style,
  });
  ctx.inserted += blocks.reduce((n, b) => n + countText(b), 0);
  note(ctx, { blockId: anchor.id, offset: position === "after" ? plainText(anchor).length : 0 });
  ctx.insertEnd = { blockId: anchor.id, offset: plainText(anchor).length };
}

function markBlock(ctx: Ctx, block: BlockView, kind: "del" | "changed") {
  ctx.exact = false;
  ctx.out.push({
    type: "node",
    key: key(ctx, kind),
    blockId: block.id,
    className: cls(
      ctx,
      kind === "del" ? "gotipe-sug gotipe-sug-block-del" : "gotipe-sug gotipe-sug-block-changed",
    ),
    attrs: ctx.attrs,
    style: ctx.style,
  });
  note(ctx, { blockId: block.id, offset: 0 });
}

function diffLeafText(ctx: Ctx, oldB: BlockView, newB: BlockView) {
  const ot = plainText(oldB);
  const nt = plainText(newB);
  if (ot === nt) {
    if (!sameAttrs(oldB, newB) || !sameSpans(oldB, newB)) markBlock(ctx, oldB, "changed");
    return;
  }
  let p = 0;
  const max = Math.min(ot.length, nt.length);
  while (p < max && ot.charCodeAt(p) === nt.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && ot.charCodeAt(ot.length - 1 - s) === nt.charCodeAt(nt.length - 1 - s)) s++;
  const delFrom = p;
  const delTo = ot.length - s;
  if (delTo > delFrom) {
    ctx.out.push({
      type: "inline",
      key: key(ctx, "del"),
      blockId: oldB.id,
      from: delFrom,
      to: delTo,
      className: cls(ctx, "gotipe-sug gotipe-sug-del"),
      attrs: ctx.attrs,
      style: ctx.style,
    });
    note(ctx, { blockId: oldB.id, offset: delFrom });
  }
  const insTo = nt.length - s;
  if (insTo > p) {
    const spans = Array.isArray(newB.content)
      ? sliceSpans(newB.content, p, insTo)
      : [{ text: nt.slice(p, insTo), marks: [] }];
    for (const span of spans) {
      ctx.out.push({
        type: "widget",
        key: key(ctx, "ins"),
        blockId: oldB.id,
        offset: delTo,
        text: span.text,
        marks: span.marks as MarkView[],
        className: cls(ctx, "gotipe-sug gotipe-sug-ins"),
        attrs: ctx.attrs,
        style: ctx.style,
      });
      ctx.inserted += span.text.length;
    }
    note(ctx, { blockId: oldB.id, offset: delTo });
    ctx.insertEnd = { blockId: oldB.id, offset: delTo };
  }
  if (!sameAttrs(oldB, newB)) markBlock(ctx, oldB, "changed");
}

function diffBlock(ctx: Ctx, oldB: BlockView, newB: BlockView) {
  if (oldB.type !== newB.type || RAW_TYPES.has(oldB.type)) {
    markBlock(ctx, oldB, "del");
    insertBlocks(ctx, oldB, "after", [newB]);
    return;
  }
  const hasText = Array.isArray(oldB.content) || Array.isArray(newB.content);
  if (hasText) diffLeafText(ctx, oldB, newB);
  else if (!sameAttrs(oldB, newB)) markBlock(ctx, oldB, "changed");
  if (oldB.children.length > 0 || newB.children.length > 0) {
    diffLists(ctx, oldB.children, newB.children, oldB);
  }
}

export function diffLists(
  ctx: Ctx,
  oldList: BlockView[],
  newList: BlockView[],
  parent: BlockView | null,
) {
  const oldSig = oldList.map(signature);
  const newSig = newList.map(signature);
  const matches = lcs(oldSig, newSig);
  let oi = 0;
  let ni = 0;
  const flushGap = (oEnd: number, nEnd: number) => {
    const olds = oldList.slice(oi, oEnd);
    const news = newList.slice(ni, nEnd);
    const paired = Math.min(olds.length, news.length);
    for (let k = 0; k < paired; k++) {
      const o = olds[k]!;
      const n = news[k]!;
      if (o.type === n.type) diffBlock(ctx, o, n);
      else {
        markBlock(ctx, o, "del");
        insertBlocks(ctx, o, "after", [n]);
      }
    }
    for (let k = paired; k < olds.length; k++) markBlock(ctx, olds[k]!, "del");
    const added = news.slice(paired);
    if (added.length > 0) {
      const lastOld = oEnd > 0 ? oldList[oEnd - 1] : undefined;
      const nextOld = oldList[oEnd];
      if (lastOld) insertBlocks(ctx, lastOld, "after", added);
      else if (nextOld) insertBlocks(ctx, nextOld, "before", added);
      else if (parent) insertBlocks(ctx, parent, "after", added);
    }
    oi = oEnd;
    ni = nEnd;
  };
  for (const [mo, mn] of matches) {
    flushGap(mo, mn);
    oi = mo + 1;
    ni = mn + 1;
  }
  flushGap(oldList.length, newList.length);
}
