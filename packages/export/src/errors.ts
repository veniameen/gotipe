const CODES = [
  "INVALID_OPTIONS",
  "PARSE_ERROR",
  "UNSUPPORTED_BLOCK_TYPE",
  "UNSUPPORTED_MARK",
  "IMAGE_ERROR",
  "FONT_NOT_FOUND",
  "ENCODING_ERROR",
  "EXPORTER_UNAVAILABLE",
] as const;

/** Stable reason for a failed PDF/DOCX export, shared with the native converter. */
export type ExportErrorCode = (typeof CODES)[number];

/** A PDF/DOCX export failure. Errors thrown by `resolveImage` propagate unchanged. */
export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GoTipeExportError";
    this.code = code;
  }
}

function isCode(value: unknown): value is ExportErrorCode {
  return CODES.some((code) => code === value);
}

/** The optional exporter rejects with an `Error` carrying `code`; expose it as one class. */
export function toExportError(error: unknown): unknown {
  if (error instanceof ExportError || !(error instanceof Error)) return error;
  const code = "code" in error ? error.code : undefined;
  return isCode(code) ? new ExportError(code, error.message, { cause: error }) : error;
}
