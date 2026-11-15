export type GoTipeErrorCode =
  | "EDITOR_NOT_INITIALIZED"
  | "WASM_INIT_FAILED"
  | "TRANSFORM_ERROR"
  | "COMPOSITION_CONFLICT"
  | "VALIDATION_ERROR"
  | "PARSE_ERROR"
  | "EXTENSION_ERROR"
  | "EXTENSION_DEPENDENCY_CYCLE"
  // Host integration (reported through the `error` event / `host.onError`)
  | "ASSET_SAVE_FAILED"
  | "ASSET_RESOLVE_FAILED"
  | "ASSET_UNSUPPORTED"
  | "ASSET_TOO_LARGE"
  | "LINK_BLOCKED"
  | "LINK_OPEN_FAILED"
  | "CLIPBOARD_FAILED"
  | "COLLABORATION_UNAVAILABLE"
  | "COLLABORATION_ERROR"
  // Review layer (proposals, comments)
  | "PROPOSAL_STALE"
  | "PROPOSAL_ACTION_FAILED"
  | "COMMENT_ACTION_FAILED";

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
