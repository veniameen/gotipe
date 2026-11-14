import type { Block, Document, TextSpan } from "../types/block";
import type { Step } from "../types/state";
import { type AnyMark, type IsAtomic, atomRanges, markType } from "./atoms";

/**
 * Remote content and inline atoms (docs/development/inline-atoms.md). A client that does
 * not know an atom may type into it; once merged, its text sits inside the atom. Atoms are
 * told apart by identity — the mark type and its `key` (every new atom gets a unique one) —
 * not by position or equal attributes:
 *
 * - An atom whose text is its previous text with characters inserted between its old edges
 *   loses the atomic marks on exactly those characters.
 * - An atom that is new, untouched, shortened or rewritten as a whole is kept: a rewrite
 *   (`updateAtom` with new text) takes a new key, so it is a new atom.
 * - An orphan — a keyed atom that is gone from `before` but was seen with other text
 *   (`known`, its last text by identity) — consists of foreign text only and loses its marks.
 * - Atoms whose identity is ambiguous (two runs with one identity, keyless twins) are kept.
 *
 * Pure and deterministic. It returns the repaired document and the `removeMark` steps that
 * lead to it, to dispatch as a local transaction so every replica receives the repair.
 */
export function normalizeRemoteAtoms(
  before: Document,
  after: Document,
  isAtomic: IsAtomic,
  known?: ReadonlyMap<string, string>,
): { document: Document; steps: Step[] } {
  const previous = atomTexts(before.blocks, isAtomic);
  const current = atomTexts(after.blocks, isAtomic);
  const steps: Step[] = [];
  const repair = (block: Block): Block => {
    const children = block.children.map(repair);
    let content = block.content;
    if (Array.isArray(content)) {
      const text = textOf(content);
      for (const atom of atomRanges(content, isAtomic)) {
        const id = identity(atom.marks);
        const own = text.slice(atom.from, atom.to);
        if (current.get(id)!.length !== 1) continue;
        const old = previous.get(id);
        let foreign: [number, number] | null = null;
        if (old) {
          if (old.length === 1 && old[0] !== own) foreign = insertion(own, old[0]!);
        } else if (keyed(atom.marks)) {
          const last = known?.get(id);
          if (last !== undefined && last !== own) foreign = [0, own.length];
        }
        if (!foreign) continue;
        for (const mark of atom.marks) {
          const step = {
            type: "removeMark" as const,
            blockId: block.id,
            from: atom.from + foreign[0],
            to: atom.from + foreign[1],
            markType: markType(mark),
          };
          steps.push(step);
          content = removeMark(content, step.from, step.to, step.markType);
        }
      }
    }
    return content === block.content && children.every((child, i) => child === block.children[i])
      ? block
      : { ...block, content, children };
  };
  const blocks = after.blocks.map(repair);
  return {
    document: blocks.every((block, i) => block === after.blocks[i]) ? after : { ...after, blocks },
    steps,
  };
}

/** What makes an atom the same atom: each atomic mark's type and key, else its attributes. */
export function identity(marks: readonly AnyMark[]): string {
  return marks
    .map((mark) => {
      const attrs = mark.attrs ?? {};
      return typeof attrs.key === "string"
        ? `${markType(mark)}#${attrs.key}`
        : `${markType(mark)}=${stable(attrs)}`;
    })
    .join("|");
}

const keyed = (marks: readonly AnyMark[]) =>
  marks.every((mark) => typeof mark.attrs?.key === "string");

function stable(value: unknown): string {
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

/** Any block tree with rich text: the public model or the view. */
export interface AtomBlock {
  content: unknown;
  children: readonly AtomBlock[];
}

/** The texts of every atom by identity, in document order. */
export function atomTexts(
  blocks: readonly AtomBlock[],
  isAtomic: IsAtomic,
  into = new Map<string, string[]>(),
): Map<string, string[]> {
  for (const block of blocks) {
    if (Array.isArray(block.content)) {
      const spans = block.content as readonly { text: string; marks?: AnyMark[] }[];
      const text = spans.map((span) => span.text).join("");
      for (const atom of atomRanges(spans, isAtomic)) {
        const id = identity(atom.marks);
        const texts = into.get(id) ?? [];
        texts.push(text.slice(atom.from, atom.to));
        into.set(id, texts);
      }
    }
    atomTexts(block.children, isAtomic, into);
  }
  return into;
}

const textOf = (spans: readonly TextSpan[]): string => spans.map((span) => span.text).join("");
const splits = (text: string, at: number) =>
  at > 0 && at < text.length && /[\uD800-\uDBFF]/.test(text[at - 1]!);

/**
 * `[from, to)` of `own` when it is `old` with characters inserted at one place between (or
 * at) its edges, else null. The latest place that fits is taken.
 */
function insertion(own: string, old: string): [number, number] | null {
  const extra = own.length - old.length;
  if (extra <= 0) return null;
  let prefix = 0;
  while (prefix < old.length && own[prefix] === old[prefix]) prefix++;
  for (let at = prefix; at >= 0; at--) {
    if (splits(own, at) || splits(own, at + extra)) continue;
    if (own.slice(at + extra) === old.slice(at)) return [at, at + extra];
  }
  return null;
}

function removeMark(spans: TextSpan[], from: number, to: number, type: string): TextSpan[] {
  const result: TextSpan[] = [];
  let offset = 0;
  const push = (text: string, marks: TextSpan["marks"]) => {
    if (!text) return;
    const last = result[result.length - 1];
    if (last && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += text;
    else result.push({ text, marks });
  };
  for (const span of spans) {
    const end = offset + span.text.length;
    const a = Math.max(from, offset) - offset;
    const b = Math.min(to, end) - offset;
    if (a >= b) push(span.text, span.marks);
    else {
      push(span.text.slice(0, a), span.marks);
      push(
        span.text.slice(a, b),
        span.marks.filter((mark) => mark.type !== type),
      );
      push(span.text.slice(b), span.marks);
    }
    offset = end;
  }
  return result;
}
