/**
 * Where the inline content is written:
 * - `block`: paragraph-like content whose lines start at a block line start
 *   (paragraph, list item, blockquote, callout body);
 * - `midline`: first line follows other text on the same line (todo item after `[ ] `,
 *   agent callout after the label); continuation lines are like `block`;
 * - `heading`, `cell`: single line, "\n" is written as `<br>`;
 * - `alt`: image alt / file name inside `[...]`.
 */
export type InlineKind = "block" | "midline" | "heading" | "cell" | "alt";

export interface InlineOptions {
  kind: InlineKind;
  eol: string;
  /** Line break for soft/hard breaks: EOL + continuation prefix. */
  newline: string;
  /** Write "\n" as hard breaks (`\` + EOL). */
  hard: boolean;
  /** 0: bare autolink literals allowed; 1: `<url>` autolinks; 2: tags for emphasis, `[t](u)` links. */
  tier: number;
  /** The first line continues a paragraph started before the content (alert callouts). */
  continuation?: boolean;
}

export interface EmoPair {
  delim: string;
  openTag: string;
  closeTag: string;
  tag: boolean;
}

export type Unit =
  | { k: "t"; ch: string; ti: number }
  | { k: "nl"; ti: number }
  | { k: "syn"; s: string }
  | { k: "lit"; s: string; ti: number }
  | { k: "code"; s: string; ti: number }
  | { k: "emo"; pair: EmoPair; open: boolean };
