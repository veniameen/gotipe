import { Transport, resource } from "./transport";
import type {
  AiRequest,
  AiResponse,
  Comment,
  Document,
  ExportJob,
  GoTipeClientOptions,
  Organization,
  PaginatedResponse,
  Usage,
  Version,
} from "./types";

const idPath = (id: string) => encodeURIComponent(id);
const documentPath = (id: string) => `/v1/documents/${idPath(id)}`;

export class GoTipeClient {
  private readonly transport: Transport;
  constructor(options: GoTipeClientOptions) {
    this.transport = new Transport(options);
  }

  async listDocuments(page = 1, perPage = 20): Promise<PaginatedResponse<Document>> {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(perPage) ||
      perPage < 1 ||
      perPage > 100
    ) {
      throw new RangeError("page must be positive and perPage must be between 1 and 100");
    }
    const response = await this.transport.request<{
      data: Record<string, unknown>[];
      total: number;
      limit: number;
      offset: number;
    }>("GET", `/v1/documents?limit=${perPage}&offset=${(page - 1) * perPage}`);
    return {
      data: response.data.map((item) => resource<Document>(item)),
      total: response.total,
      page: Math.floor(response.offset / response.limit) + 1,
      perPage: response.limit,
      hasMore: response.offset + response.data.length < response.total,
    };
  }

  getDocument(id: string): Promise<Document> {
    return this.transport.resource("GET", documentPath(id));
  }
  createDocument(data: { id?: string; title: string; content?: object }): Promise<Document> {
    return this.transport.resource("POST", "/v1/documents", data);
  }
  updateDocument(id: string, data: { title?: string; content?: object }): Promise<Document> {
    return this.transport.resource("PATCH", documentPath(id), data);
  }
  deleteDocument(id: string): Promise<void> {
    return this.transport.request("DELETE", documentPath(id));
  }

  listVersions(docId: string): Promise<Version[]> {
    return this.transport.list(`${documentPath(docId)}/versions`);
  }
  createVersion(docId: string, name: string): Promise<Version> {
    return this.transport.resource("POST", `${documentPath(docId)}/versions`, {
      name,
      version_type: "named",
    });
  }
  async restoreVersion(docId: string, versionId: string): Promise<Document> {
    await this.transport.request(
      "POST",
      `${documentPath(docId)}/versions/${idPath(versionId)}/restore`,
    );
    return this.getDocument(docId);
  }

  async listComments(docId: string, includeResolved = false): Promise<Comment[]> {
    const comments = await this.transport.list<Comment>(
      `${documentPath(docId)}/comments?include_resolved=${includeResolved}`,
    );
    return comments.map((comment) => ({ ...comment, resolved: !!comment.resolvedAt }));
  }
  async addComment(
    docId: string,
    data: { blockId?: string; content: string; from?: number; to?: number },
  ): Promise<Comment> {
    const comment = await this.transport.resource<Comment>(
      "POST",
      `${documentPath(docId)}/comments`,
      {
        content: data.content,
        block_id: data.blockId,
        anchor_type: data.from === undefined ? (data.blockId ? "block" : "document") : "inline",
        from: data.from,
        to: data.to,
      },
    );
    return { ...comment, resolved: !!comment.resolvedAt };
  }
  async resolveComment(docId: string, commentId: string): Promise<void> {
    await this.transport.request(
      "POST",
      `${documentPath(docId)}/comments/${idPath(commentId)}/resolve`,
    );
  }
  deleteComment(docId: string, commentId: string): Promise<void> {
    return this.transport.request("DELETE", `${documentPath(docId)}/comments/${idPath(commentId)}`);
  }

  createExportJob(docId: string, format: ExportJob["format"]): Promise<ExportJob> {
    return this.transport.resource("POST", "/v1/exports", { document_id: docId, format });
  }
  /** docId is retained for compatibility; the server authenticates each export job. */
  getExportJob(_docId: string, jobId: string): Promise<ExportJob> {
    return this.transport.resource("GET", `/v1/exports/${idPath(jobId)}`);
  }

  aiGenerate(docId: string, request: AiRequest): Promise<AiResponse> {
    return this.transport.request("POST", "/v1/ai/complete", {
      document_id: docId,
      prompt: request.prompt,
      context: request.context,
      command: request.mode ?? "complete",
      model: request.model,
      provider: request.provider,
      max_tokens: request.maxTokens,
      stream: false,
    });
  }
  getOrganization(id: string): Promise<Organization> {
    return this.transport.resource("GET", `/v1/organizations/${idPath(id)}`);
  }
  /** Usage is the current billing month; historical periods are not supported. */
  getUsage(): Promise<Usage> {
    return this.transport.request("GET", "/v1/billing/usage");
  }
}
