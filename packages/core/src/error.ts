export type GoTipeErrorCode =
  | "EDITOR_NOT_INITIALIZED"
  | "WASM_INIT_FAILED"
  | "TRANSFORM_ERROR"
  | "VALIDATION_ERROR"
  | "SCHEMA_ERROR"
  | "PARSE_ERROR"
  | "EXTENSION_ERROR"
  | "EXTENSION_DEPENDENCY_CYCLE"
  | "UNKNOWN_BLOCK_TYPE"
  | "UNKNOWN_MARK_TYPE";

export class GoTipeError extends Error {
  readonly code: GoTipeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: GoTipeErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.name = "GoTipeError";
    this.code = code;
    this.details = details;
  }
}
