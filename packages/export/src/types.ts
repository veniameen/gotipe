/** HTML-only presentation options. */
export interface ExportOptions {
  includeStyles?: boolean;
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
}

export interface DocxOptions {
  resolveImage?: ImageResolver;
  title?: string;
  author?: string;
  description?: string;
}
