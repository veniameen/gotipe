/**
 * Keys of inline atoms (docs/development/inline-atoms.md): every new atom gets a unique
 * `key`, so equal atoms never join; a pasted copy takes a new one.
 */
import { createId } from "../document/id";

/** A fresh `key` for a new atom: random, so atoms made anywhere never share one. */
export const newAtomKey = (): string => createId().replace(/-/g, "").slice(0, 12);

interface KeyedSpan {
  marks: { type: string; attrs: Record<string, unknown> }[];
}
interface KeyedBlock {
  content: unknown;
  children: KeyedBlock[];
}

/** `type#key` of every keyed mark (only atoms take `key`) in `blocks`. */
export function atomKeys(blocks: readonly KeyedBlock[], into = new Set<string>()): Set<string> {
  for (const block of blocks) {
    if (Array.isArray(block.content))
      for (const span of block.content as KeyedSpan[])
        for (const mark of span.marks)
          if (typeof mark.attrs?.key === "string") into.add(`${mark.type}#${mark.attrs.key}`);
    atomKeys(block.children, into);
  }
  return into;
}

/**
 * Pasted atoms whose key the document already holds take fresh keys, in place, so a copy
 * never joins or shares identity with its original. All spans of one pasted atom keep one key.
 */
export function rekeyAtoms(spans: readonly KeyedSpan[], taken: Set<string>): void {
  const renamed = new Map<string, string>();
  for (const span of spans)
    for (const mark of span.marks) {
      const key = mark.attrs?.key;
      if (typeof key !== "string") continue;
      const id = `${mark.type}#${key}`;
      let next = renamed.get(id);
      if (next === undefined) {
        next = taken.has(id) ? newAtomKey() : key;
        renamed.set(id, next);
        taken.add(`${mark.type}#${next}`);
      }
      if (next !== key) mark.attrs = { ...mark.attrs, key: next };
    }
}
