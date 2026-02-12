export interface ExportOptions {
  includeStyles?: boolean;
  classPrefix?: string;
}

export interface PdfOptions extends ExportOptions {
  pageSize?: "a4" | "letter" | "legal";
  margin?: { top: number; right: number; bottom: number; left: number };
  fontSize?: number;
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface DocxOptions extends ExportOptions {
  title?: string;
  author?: string;
  description?: string;
}
