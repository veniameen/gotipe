import type { ApiError, CursorPage, GoTipeClientOptions } from "./types";

export class GoTipeApiError extends Error implements ApiError {
  readonly name = "GoTipeApiError";
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Convert only the resource envelope; document content and metadata are opaque. */
export function resource<T>(value: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = item;
  }
  return result as T;
}

export class Transport {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;

  constructor(options: GoTipeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeout = options.timeout ?? 30_000;
    if (!Number.isFinite(this.timeout) || this.timeout <= 0) {
      throw new RangeError("timeout must be positive");
    }
    this.headers = { "Content-Type": "application/json" };
    const credential = options.token ?? options.apiKey;
    if (credential) this.headers.Authorization = `Bearer ${credential}`;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const error = payload?.error;
        throw new GoTipeApiError(
          typeof error?.code === "string" ? error.code : "HTTP_ERROR",
          typeof error?.message === "string"
            ? error.message
            : response.statusText || `HTTP ${response.status}`,
          response.status,
        );
      }
      if (response.status === 204 || response.status === 205) return undefined as T;
      const text = await response.text();
      return text ? JSON.parse(text) : (undefined as T);
    } finally {
      clearTimeout(timer);
    }
  }

  async resource<T>(method: string, path: string, body?: unknown): Promise<T> {
    return resource<T>(await this.request(method, path, body));
  }

  async page<T>(path: string): Promise<CursorPage<T>> {
    const response = await this.request<{
      data: Record<string, unknown>[];
      has_more?: boolean;
      next_cursor?: string;
    }>("GET", path);
    const page: CursorPage<T> = {
      data: response.data.map((item) => resource<T>(item)),
      hasMore: response.has_more === true,
    };
    if (!page.hasMore) return page;
    if (typeof response.next_cursor !== "string" || !response.next_cursor)
      throw new GoTipeApiError("INVALID_RESPONSE", "The page has more items but no cursor", 200);
    page.nextCursor = response.next_cursor;
    return page;
  }
}
