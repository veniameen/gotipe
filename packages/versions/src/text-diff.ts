import type { Block, Document } from "@gotipe/core";
import { compareDocuments } from "./diff";

/** One run of a text comparison: kept, written in the newer text, or gone from the older one. */
export interface TextChange {
  type: "equal" | "insert" | "delete";
  text: string;
}

/** Words added to and removed from a document, the counts a version list shows. */
export interface WordChanges {
  added: number;
  removed: number;
}

/** The comparison of two texts is word by word; past this many tokens a block is replaced whole. */
const TOKEN_LIMIT = 2000;

/**
 * Words and the spaces between them; a space run is a token of its own. A no-break space joins
 * what it stands between, as typography means it: «10 %» changes as one unit.
 */
const BREAK = /([^\S\u00a0\u2007\u202f]+)/u;
function tokens(text: string): string[] {
  return text.split(BREAK).filter((token) => token.length > 0);
}
const isWord = (token: string) => /\S/u.test(token);
const words = (text: string) => tokens(text).filter(isWord).length;

/** A block's own text: rich text joined, raw text as it is, nothing for a container. */
export function blockText(block: Pick<Block, "content">): string {
  const { content } = block;
  if (Array.isArray(content)) return content.map((span) => span.text).join("");
  return typeof content === "string" ? content : "";
}

function push(out: TextChange[], type: TextChange["type"], text: string) {
  const last = out[out.length - 1];
  if (last?.type === type) last.text += text;
  else out.push({ type, text });
}

/**
 * Compares two texts word by word (a longest common subsequence of words and spaces). A change
 * that only keeps a space between two edits is shown as one deletion and one insertion.
 */
export function diffText(before: string, after: string): TextChange[] {
  if (before === after) return before ? [{ type: "equal", text: before }] : [];
  const a = tokens(before);
  const b = tokens(after);
  const out: TextChange[] = [];
  if (a.length * b.length > TOKEN_LIMIT * TOKEN_LIMIT) {
    if (before) out.push({ type: "delete", text: before });
    if (after) out.push({ type: "insert", text: after });
    return out;
  }
  // common prefix and suffix first: most edits touch a few words of a long block
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  if (start > 0) push(out, "equal", a.slice(0, start).join(""));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const lengths = Array.from({ length: midA.length + 1 }, () => new Uint32Array(midB.length + 1));
  for (let i = midA.length - 1; i >= 0; i--)
    for (let j = midB.length - 1; j >= 0; j--)
      lengths[i]![j] =
        midA[i] === midB[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  const middle: TextChange[] = [];
  let i = 0;
  let j = 0;
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      push(middle, "equal", midA[i]!);
      i++;
      j++;
    } else if (
      j >= midB.length ||
      (i < midA.length && lengths[i + 1]![j]! >= lengths[i]![j + 1]!)
    ) {
      push(middle, "delete", midA[i]!);
      i++;
    } else {
      push(middle, "insert", midB[j]!);
      j++;
    }
  }
  // a kept space between two changes reads better inside them: «10 %» → «5 %», not «10» → «5»
  for (let index = 0; index < middle.length; index++) {
    const run = middle[index]!;
    const glue =
      run.type === "equal" &&
      !isWord(run.text) &&
      index > 0 &&
      index < middle.length - 1 &&
      middle[index - 1]!.type !== "equal" &&
      middle[index + 1]!.type !== "equal";
    if (glue) {
      push(out, "delete", run.text);
      push(out, "insert", run.text);
    } else push(out, run.type, run.text);
  }
  const ordered: TextChange[] = [];
  // within one changed stretch the deletion comes first, then the insertion
  for (let index = 0; index < out.length; index++) {
    if (out[index]!.type === "equal") {
      push(ordered, "equal", out[index]!.text);
      continue;
    }
    let removed = "";
    let inserted = "";
    while (index < out.length && out[index]!.type !== "equal") {
      if (out[index]!.type === "delete") removed += out[index]!.text;
      else inserted += out[index]!.text;
      index++;
    }
    index--;
    if (removed) push(ordered, "delete", removed);
    if (inserted) push(ordered, "insert", inserted);
  }
  if (endA < a.length) push(ordered, "equal", a.slice(endA).join(""));
  return ordered;
}

function textsById(blocks: Block[], out = new Map<string, string>()): Map<string, string> {
  for (const block of blocks) {
    out.set(block.id, blockText(block));
    textsById(block.children, out);
  }
  return out;
}

/** Words written and words removed between two documents, block by block. */
export function countWordChanges(before: Document, after: Document): WordChanges {
  const diff = compareDocuments(before, after);
  const old = textsById(before.blocks);
  const current = textsById(after.blocks);
  let added = 0;
  let removed = 0;
  for (const id of diff.added) added += words(current.get(id) ?? "");
  for (const id of diff.removed) removed += words(old.get(id) ?? "");
  for (const id of diff.modified) {
    for (const change of diffText(old.get(id) ?? "", current.get(id) ?? "")) {
      if (change.type === "insert") added += words(change.text);
      else if (change.type === "delete") removed += words(change.text);
    }
  }
  return { added, removed };
}
