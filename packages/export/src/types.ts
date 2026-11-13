/** HTML-only presentation options, the same as `serializeHtml` in @gotipe/core. */
export interface ExportOptions {
  /** Add neutral inline structural styles. */
  inlineStyles?: boolean;
  /** The earlier name of `inlineStyles`; still accepted. */
  includeStyles?: boolean;
  /** One class per block, e.g. `"doc-"` gives `doc-paragraph`. */
  classPrefix?: string;
}

/** Host-controlled asset access. Exporters never fetch document URLs implicitly. */
export type ImageResolver = (source: string) => Promise<Uint8Array | Blob>;

export interface PdfOptions {
  resolveImage?: ImageResolver;
  pageSize?: "a4" | "letter" | "legal";
  margin?: { top: number; right: number; bottom: number; left: number };
  fontSize?: number;
  headerTemplate?: string;
  footerTemplate?: string;
  /** BCP 47 language of the text, e.g. `"ru"` or `"en-GB"`. Without it none is declared. */
  lang?: string;
  /** Document title, shown by viewers as the window title. */
  title?: string;
  author?: string;
}

export interface DocxOptions {
  resolveImage?: ImageResolver;
  title?: string;
  author?: string;
  description?: string;
}
