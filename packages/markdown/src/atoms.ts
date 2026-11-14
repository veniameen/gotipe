import type { Block, InlineAtoms, Mark } from "./types";
import { stableStringify } from "./util";

/**
 * Inline atoms (docs/development/inline-atoms.md): a mention, an inline formula, a custom
 * emoji and an inline image are text with an atomic mark. The rules here are shared by
 * the reader and the writer; `crates/gotipe-export/src/markdown_parse/atoms.rs` is the Rust
 * copy and both check `crates/gotipe-export/tests/fixtures/markdown-atoms.json`.
 */
/** The atoms and the attributes of each that Markdown carries. */
const CARRIED: Record<string, string[]> = {
  mention: ["id", "kind", "label"],
  inlineMath: [],
  customEmoji: ["name", "src"],
  inlineImage: ["src", "alt"],
};
export const isAtom = (mark: Mark): boolean => Object.hasOwn(CARRIED, mark.type);

const space = (c: string | undefined): boolean =>
  c === " " || c === "\t" || c === "\n" || c === "\r";

/**
 * The index of the `$` closing the formula that `text[open]` opens, or -1 (pandoc's rule).
 * The opening `$` is followed by a character that is neither whitespace nor `$`; the first
 * `$` after it on the same line that no backslash precedes must follow a non-whitespace
 * character and must not be followed by a digit. So `$5 and $6` and `$a$5` are text.
 */
export function mathEnd(text: string, open: number): number {
  const first = text[open + 1];
  if (first === undefined || first === "$" || space(first)) return -1;
  for (let p = open + 1; p < text.length; p++) {
    const c = text[p];
    // a line ending ends the line: "\r" too, which the writer would write as one (D-94)
    if (c === "\n" || c === "\r") return -1;
    if (c === "\\" && text[p + 1] !== "\n") p++;
    else if (c === "$") return !space(text[p - 1]) && !/[0-9]/.test(text[p + 1] ?? "") ? p : -1;
  }
  return -1;
}

/** TeX that `$…$` carries unchanged. */
export const mathWritable = (tex: string): boolean => mathEnd(`$${tex}$`, 0) === tex.length + 1;

/** The name between the colons of `:name:`. */
export const EMOJI_NAME = /^[A-Za-z0-9_+-]+$/;

const EMOJI = /:([A-Za-z0-9_+-]+):/y;
const ALNUM = /[A-Za-z0-9]/;
/** A word that is or holds an address: the start of a URL or `www.`. */
const URL_WORD = /(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|www\.)/;

/**
 * The end of a registered `:name:` that `text[p]` opens, or -1. No letter or digit may touch
 * it on either side (`10:30:45` is a time) and it is never part of an address
 * (`https://a.test/:party:`). The Rust reader applies the same rule (`emoji_at`).
 */
export function emojiEnd(text: string, p: number, registry: Record<string, string>): number {
  if (ALNUM.test(text[p - 1] ?? "")) return -1;
  EMOJI.lastIndex = p;
  const match = EMOJI.exec(text);
  if (!match || !Object.hasOwn(registry, match[1]!)) return -1;
  const end = p + match[0].length;
  if (ALNUM.test(text[end] ?? "")) return -1;
  let word = p;
  while (word > 0 && !/[ \t\n\r\f\v]/.test(text[word - 1]!)) word--;
  return URL_WORD.test(text.slice(word, p)) ? -1 : end;
}

/** `mention:user-42`: the kind and the percent-decoded id, or null for any other address. */
export function mentionOf(url: string): { kind: string; id: string } | null {
  const match = /^mention:(user|page)-(.+)$/s.exec(url);
  if (!match) return null;
  try {
    return { kind: match[1]!, id: decodeURIComponent(match[2]!) };
  } catch {
    return null;
  }
}

/** The address of a mention; every byte of the id outside `A-Za-z0-9-._~` is `%XX`. */
export function mentionHref(attrs: Record<string, unknown> | undefined): string | null {
  const id = attrs?.id;
  if (typeof id !== "string" || !id) return null;
  try {
    const encoded = encodeURIComponent(id).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `mention:${attrs?.kind === "page" ? "page" : "user"}-${encoded}`;
  } catch {
    return null;
  }
}

/** The label a mention's text stands for: a user's text without its leading `@`. */
export const mentionLabel = (kind: unknown, text: string): string =>
  kind !== "page" && text.startsWith("@") ? text.slice(1) : text;

/** The text of an inline image: its alt, else the file name of its address, else `image`. */
export function imageText(src: string, alt: string): string {
  if (alt) return alt;
  if (/^data:/i.test(src)) return "image";
  const path = src.replace(/[?#].*$/s, "");
  return path.slice(path.lastIndexOf("/") + 1) || "image";
}

/** The atoms a reader must produce to read the Markdown of `block` back, or null. */
export function atomsIn(block: Block, found: InlineAtoms = {}): InlineAtoms | null {
  if (Array.isArray(block.content))
    for (const span of block.content)
      for (const mark of span.marks ?? []) {
        if (mark.type === "customEmoji") {
          found.customEmoji ??= {};
          found.customEmoji[String(mark.attrs?.name)] = String(mark.attrs?.src ?? "");
        } else if (isAtom(mark))
          found[mark.type as "mention" | "inlineMath" | "inlineImage"] = true;
      }
  for (const child of block.children ?? []) atomsIn(child, found);
  return Object.keys(found).length ? found : null;
}

/**
 * `block` as Markdown carries it: atoms without `key` and the attributes it does not write,
 * a mention of a user and an image whose alt is its text when the mark does not say.
 */
export function carried(block: Block): Block {
  const content = Array.isArray(block.content)
    ? block.content.map((span) => ({
        text: span.text,
        marks: (span.marks ?? []).map((mark): Mark => {
          if (!isAtom(mark)) return mark;
          const from: Record<string, unknown> = { kind: "user", alt: span.text, ...mark.attrs };
          const attrs = Object.fromEntries(CARRIED[mark.type]!.map((name) => [name, from[name]]));
          return { type: mark.type, attrs };
        }),
      }))
    : block.content;
  return { ...block, content, children: (block.children ?? []).map(carried) };
}

/**
 * Gives every atom the reader made its final `key`: "1", "2", … in document order (blocks
 * depth-first, spans left to right), so no two atoms of a document are equal. The reader's
 * own keys only keep neighbours apart until then. The Rust reader numbers the same way.
 */
export function numberAtoms(blocks: Block[], next = { n: 0 }): void {
  for (const block of blocks) {
    if (Array.isArray(block.content)) {
      let previous = "";
      let key = "";
      block.content = block.content.map((span) => {
        const atoms = (span.marks ?? []).filter(isAtom);
        const id = atoms.length ? stableStringify(atoms) : "";
        if (!id) {
          previous = "";
          return span;
        }
        if (id !== previous) key = String(++next.n);
        previous = id;
        return {
          ...span,
          marks: (span.marks ?? []).map((mark) =>
            isAtom(mark) ? { ...mark, attrs: { ...mark.attrs, key } } : mark,
          ),
        };
      });
    }
    numberAtoms(block.children ?? [], next);
  }
}
