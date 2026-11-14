import { type PNode, parseInternal } from "../parse";
import type { Block, InlineAtoms, SnapshotBlock, SnapshotNode } from "../types";

/**
 * Soft line breaks of an edited block (D-88). The reader makes a soft break a space, as
 * CommonMark does, so the document no longer knows where the file's lines ended. The writer
 * finds out from the snapshot: it reads the block's old source again and, for every block
 * whose words on both sides of a soft break are still side by side, writes that space as a
 * line ending again. An edit rewrites the lines it touches; the others stay byte for byte.
 */

/** A block's text in the snapshot and the offsets of the spaces that were line endings. */
export interface SnapshotLines {
  text: string;
  breaks: number[];
}

/** The rich or raw text of a block, as offsets count it. */
export function blockText(block: Block): string {
  const content = block.content;
  if (Array.isArray(content)) return content.map((span) => span?.text ?? "").join("");
  return typeof content === "string" ? content : "";
}

/**
 * The soft breaks of a snapshot block and of the blocks inside it, by id. Its source is read
 * again and matched with the snapshot's tree node by node; a source that now reads as another
 * structure gives none, and the block is written with spaces.
 */
export function snapshotLines(
  text: string,
  block: SnapshotBlock,
  atoms?: InlineAtoms,
): Map<string, SnapshotLines> {
  const lines = new Map<string, SnapshotLines>();
  const source = text.slice(block.start, block.end);
  if (!/[\r\n]/.test(source)) return lines;
  const parsed = parseInternal(source, true, atoms);
  const top = parsed.nodes.length === 1 ? parsed.nodes[0]! : null;
  const tree: SnapshotNode = block.tree ?? {
    id: block.id,
    type: block.type,
    start: 0,
    end: block.end - block.start,
    children: [],
  };
  const visit = (old: SnapshotNode, read: PNode): boolean => {
    if (old.type !== read.block.type || old.children.length !== read.children.length) return false;
    if (read.softBreaks?.length) {
      lines.set(old.id, { text: blockText(read.block), breaks: read.softBreaks });
    }
    return old.children.every((child, index) => visit(child, read.children[index]!));
  };
  if (!top || !visit(tree, top)) lines.clear();
  return lines;
}

/**
 * Words of a text between its spaces and line breaks, and the offset of the separator after
 * each word: a typed line break next to a soft one leaves the words around them matching.
 */
function words(text: string): { words: string[]; gaps: number[] } {
  const list: string[] = [];
  const gaps: number[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const c = text[index];
    if (c !== " " && c !== "\n") continue;
    list.push(text.slice(start, index));
    gaps.push(index);
    start = index + 1;
  }
  list.push(text.slice(start));
  return { words: list, gaps };
}

/** Pairs of a longest common subsequence above this many cells are not searched. */
const LCS_CELLS = 1_000_000;

/** For every word of `a`, the index of the same word in `b` it is matched with, or -1. */
function matchWords(a: readonly string[], b: readonly string[]): Int32Array {
  const match = new Int32Array(a.length).fill(-1);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    match[head] = head;
    head++;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    match[a.length - 1 - tail] = b.length - 1 - tail;
    tail++;
  }
  const rows = a.length - head - tail;
  const columns = b.length - head - tail;
  if (rows === 0 || columns === 0 || (rows + 1) * (columns + 1) > LCS_CELLS) return match;
  // lengths of the longest common subsequence of the suffixes, then one walk forward
  const width = columns + 1;
  const table = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      table[i * width + j] =
        a[head + i] === b[head + j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (a[head + i] === b[head + j]) {
      match[head + i] = head + j;
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) i++;
    else j++;
  }
  return match;
}

/**
 * The spaces of `text` to write as soft line breaks. A break of the snapshot stays after the
 * word before it while that word is still there, so the line it ends is kept and words typed at
 * the start of the next line stay on the next line; with that word edited it stays before the
 * word after it. With both edited the two lines are written as one.
 */
export function softBreaksFor(old: SnapshotLines, text: string): Set<number> {
  if (old.text === text) return new Set(old.breaks);
  const before = words(old.text);
  const after = words(text);
  const match = matchWords(before.words, after.words);
  const breaks = new Set(old.breaks);
  const out = new Set<number>();
  before.gaps.forEach((offset, index) => {
    if (!breaks.has(offset)) return;
    const left = match[index]!;
    const right = match[index + 1]!;
    const gap = left >= 0 ? after.gaps[left] : right > 0 ? after.gaps[right - 1] : undefined;
    // a typed line break there already ends the line
    if (gap !== undefined && text[gap] === " ") out.add(gap);
  });
  return out;
}
