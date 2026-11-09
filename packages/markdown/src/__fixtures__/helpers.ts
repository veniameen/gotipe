import type { Block, Doc, Span } from "../types";

export function counterIds(prefix = "id"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function flatText(block: Block): string {
  if (Array.isArray(block.content)) return block.content.map((s) => s.text).join("");
  return typeof block.content === "string" ? block.content : "";
}

export function findBlock(doc: Doc, pred: (b: Block) => boolean): Block {
  const walk = (blocks: Block[]): Block | undefined => {
    for (const b of blocks) {
      if (pred(b)) return b;
      const c = walk(b.children);
      if (c) return c;
    }
    return undefined;
  };
  const found = walk(doc.blocks);
  if (!found) throw new Error("block not found");
  return found;
}

export function plain(text: string): Span[] {
  return [{ text, marks: [] }];
}

/** Deep clone (docs are plain JSON). */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Asserts `next` equals `original` with `[start, end)` replaced; returns the replacement. */
export function replacedSlice(original: string, next: string, start: number, end: number): string {
  const prefix = original.slice(0, start);
  const suffix = original.slice(end);
  if (!next.startsWith(prefix)) throw new Error("prefix changed");
  if (!next.endsWith(suffix)) throw new Error("suffix changed");
  if (next.length < prefix.length + suffix.length) throw new Error("overlap");
  return next.slice(prefix.length, next.length - suffix.length);
}

/** Seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
