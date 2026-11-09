/** One coloured run of code. Colours are CSS colours for light and dark themes. */
export interface HighlightToken {
  content: string;
  color?: string;
  darkColor?: string;
  /** Bit flags: 1 italic, 2 bold, 4 underline. */
  fontStyle?: number;
}

/**
 * Highlights `code` written in `language`. Resolves to lines of tokens, or
 * `null` when the language is unknown. Pluggable: GoTipe ships no grammar
 * engine by default — see `@gotipe/block-editor/shiki` for a lazy Shiki
 * adapter on the JavaScript regex engine (no WASM, CSP-friendly).
 */
export type CodeHighlighter = (
  code: string,
  language: string,
) => Promise<HighlightToken[][] | null>;
