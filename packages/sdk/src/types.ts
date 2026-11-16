export interface GoTipeClientOptions {
  baseUrl: string;
  apiKey?: string;
  token?: string;
  timeout?: number;
}

/** Options of one call that changes data. */
export interface RequestOptions {
  /**
   * Sent as `Idempotency-Key`. Repeating the call with the same key and the same arguments
   * within 24 hours returns the first result instead of applying the change again, so a
   * call whose outcome is unknown (a timeout, a dropped connection) can be retried safely.
   * Use a new random key for every change, such as a UUID: 1–255 visible ASCII
   * characters. The key belongs to the caller's account; reusing it for a different
   * request, or retrying while the first one is still running, fails with `CONFLICT` (409).
   */
  idempotencyKey?: string;
}

/** The error object of a Cloud response outside 2xx: `{ "error": { "code", "message" } }`. */
export interface ApiError {
  code: string;
  message: string;
}
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}
/**
 * One page of comments or versions. Pass `nextCursor` as `cursor` to read the next
 * page: it continues after this page's last item, so items created, resolved or
 * deleted in between are neither repeated nor skipped.
 */
export interface CursorPage<T> {
  data: T[];
  hasMore: boolean;
  /** Present when `hasMore` is true. */
  nextCursor?: string;
}
export interface PageOptions {
  /** Items per page, 1–100; the server's default is 50. */
  limit?: number;
  /** `nextCursor` of the previous page; omit it for the first page. */
  cursor?: string;
}
export interface ListCommentsOptions extends PageOptions {
  /** Include resolved comments; by default only open ones are listed. */
  includeResolved?: boolean;
}
export interface Document {
  id: string;
  title: string;
  version: number;
  sizeBytes: number;
  content?: object;
  /**
   * Initialize the replica from baseline and replay these opaque updates before
   * editing. `generation` names that baseline: pass the whole state to the
   * collaboration provider, which connects with it. A server from before
   * generations returns none.
   */
  collaborationState?: { baseline: object; updates: object[]; generation?: string };
  createdAt: string;
  updatedAt: string;
  collaborators?: unknown[];
  syncUrl?: string;
}
export interface Version {
  id: string;
  documentId: string;
  name: string;
  description?: string;
  versionType: "named" | "milestone" | "auto_save" | "restore_point";
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
}
export interface Comment {
  id: string;
  documentId: string;
  blockId?: string;
  content: string;
  authorId: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
  anchorType: "block" | "inline" | "document";
  from?: number;
  to?: number;
  /** The comment this one replies to; replies are listed as separate items. */
  parentId?: string;
  /** Stored and returned as sent, keys included. */
  metadata?: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}
export interface ExportJob {
  id: string;
  documentId: string;
  format: "html" | "markdown" | "pdf" | "docx" | "json" | "plaintext";
  status: "pending" | "processing" | "completed" | "failed";
  url?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}
export interface AiRequest {
  prompt: string;
  context?: unknown;
  mode?: "complete" | "rewrite" | "summarize" | "translate" | "fix_grammar" | "change_tone";
  provider?: string;
  model?: string;
  maxTokens?: number;
}
export interface AiResponse {
  content: string;
  model: string;
  provider: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}
export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: string;
  createdAt: string;
}
export interface Usage {
  plan: string;
  usage: {
    documents: { current: number; limit: number };
    ai_requests: { current: number; limit: number };
    exports: { current: number; limit: number };
  };
}
