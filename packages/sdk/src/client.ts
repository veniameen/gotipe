import type {
  AiRequest,
  AiResponse,
  ApiError,
  Comment,
  Document,
  ExportJob,
  GoTipeClientOptions,
  Organization,
  PaginatedResponse,
  Usage,
  Version,
} from "./types";

export class GoTipeClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(options: GoTipeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeout = options.timeout ?? 30000;
    this.headers = { "Content-Type": "application/json" };
    if (options.apiKey) this.headers["X-API-Key"] = options.apiKey;
    if (options.token) this.headers.Authorization = `Bearer ${options.token}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: { code: "UNKNOWN", message: res.statusText } }));
        throw error.error as ApiError;
      }

      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Documents
  async listDocuments(page = 1, perPage = 20): Promise<PaginatedResponse<Document>> {
    return this.request("GET", `/v1/documents?page=${page}&per_page=${perPage}`);
  }

  async getDocument(id: string): Promise<Document> {
    return this.request("GET", `/v1/documents/${id}`);
  }
  async createDocument(data: { title: string; content?: object }): Promise<Document> {
    return this.request("POST", "/v1/documents", data);
  }
  async updateDocument(id: string, data: Partial<Document>): Promise<Document> {
    return this.request("PATCH", `/v1/documents/${id}`, data);
  }
  async deleteDocument(id: string): Promise<void> {
    return this.request("DELETE", `/v1/documents/${id}`);
  }

  // Versions
  async listVersions(docId: string): Promise<Version[]> {
    return this.request("GET", `/v1/documents/${docId}/versions`);
  }
  async createVersion(docId: string, name: string): Promise<Version> {
    return this.request("POST", `/v1/documents/${docId}/versions`, { name });
  }
  async restoreVersion(docId: string, versionId: string): Promise<Document> {
    return this.request("POST", `/v1/documents/${docId}/versions/${versionId}/restore`);
  }

  // Comments
  async listComments(docId: string): Promise<Comment[]> {
    return this.request("GET", `/v1/documents/${docId}/comments`);
  }
  async addComment(docId: string, data: { blockId: string; content: string }): Promise<Comment> {
    return this.request("POST", `/v1/documents/${docId}/comments`, data);
  }
  async resolveComment(docId: string, commentId: string): Promise<void> {
    return this.request("POST", `/v1/documents/${docId}/comments/${commentId}/resolve`);
  }
  async deleteComment(docId: string, commentId: string): Promise<void> {
    return this.request("DELETE", `/v1/documents/${docId}/comments/${commentId}`);
  }

  // Exports
  async createExportJob(docId: string, format: ExportJob["format"]): Promise<ExportJob> {
    return this.request("POST", `/v1/documents/${docId}/exports`, { format });
  }
  async getExportJob(docId: string, jobId: string): Promise<ExportJob> {
    return this.request("GET", `/v1/documents/${docId}/exports/${jobId}`);
  }

  // AI
  async aiGenerate(docId: string, request: AiRequest): Promise<AiResponse> {
    return this.request("POST", `/v1/documents/${docId}/ai/generate`, request);
  }

  // Organizations
  async getOrganization(): Promise<Organization> {
    return this.request("GET", "/v1/organization");
  }

  // Usage
  async getUsage(period?: string): Promise<Usage> {
    return this.request("GET", `/v1/usage${period ? `?period=${period}` : ""}`);
  }
}
