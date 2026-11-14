/**
 * Where the inline content is written:
 * - `block`: paragraph-like content whose lines start at a block line start
 *   (paragraph, list item, blockquote, callout body);
 * - `midline`: first line follows other text on the same line (todo item after `[ ] `);
 *   continuation lines are like `block`;
 * - `heading`, `cell`: single line, "\n" is written as `<br>`;
 * - `alt`: image alt / file name inside `[...]`.
 */
export type InlineKind = "block" | "midline" | "heading" | "cell" | "alt";

export interface InlineOptions {
  kind: InlineKind;
  eol: string;
  /**
   * A line ending with the continuation prefix: after a `\` for a line break ("\n") of `block`
   * and `midline` text, alone for a soft break.
   */
  newline: string;
  /**
   * Text offsets of spaces to write as soft line breaks: where the source had them, while the
   * words around stay (D-88, `line-breaks.ts`). Only `block` and `midline` text has them.
   */
  softBreaks?: ReadonlySet<number>;
  /**
   * The source to write for a line break, by the offset of its space or "\n": how the snapshot
   * spelled it (D-93). Only `block` and `midline` text has it.
   */
  spelling?: ReadonlyMap<number, string>;
  /** 0: bare autolink literals allowed; 1: `<url>` autolinks; 2: tags for emphasis, `[t](u)` links. */
  tier: number;
  /** The first line continues a paragraph started before the content (alert callouts). */
  continuation?: boolean;
  /**
   * Registered custom emoji names (those of the document's `customEmoji` marks): typed
   * `:name:` that a reader would take for one is written as `\:name:`.
   */
  emoji?: Readonly<Record<string, string>>;
}

export interface EmoPair {
  delim: string;
  openTag: string;
  closeTag: string;
  tag: boolean;
}

export type Unit =
  | { k: "t"; ch: string; ti: number }
  /** A line break ("\n"), or a space that the source wrote as a line ending (`soft`). */
  | { k: "nl"; ti: number; soft?: true }
  /** Syntax; `math` marks the `$` that opens (1) or closes (2) an inline formula. */
  | { k: "syn"; s: string; math?: 1 | 2 }
  /**
   * Source written as is for `len` characters of text (as many as it has when omitted);
   * `emoji` marks a custom emoji, which no letter or digit may touch.
   */
  | { k: "lit"; s: string; ti: number; len?: number; emoji?: true }
  | { k: "code"; s: string; ti: number }
  | { k: "emo"; pair: EmoPair; open: boolean };
