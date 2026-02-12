export interface GoTipeClientOptions {
  baseUrl: string;
  apiKey?: string;
  token?: string;
  timeout?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

export interface Document {
  id: string;
  title: string;
  content: object;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  collaborators: string[];
}

export interface Version {
  id: string;
  documentId: string;
  name: string;
  createdAt: string;
  createdBy: string;
}

export interface Comment {
  id: string;
  documentId: string;
  blockId: string;
  content: string;
  authorId: string;
  createdAt: string;
  resolved: boolean;
}

export interface ExportJob {
  id: string;
  documentId: string;
  format: "html" | "markdown" | "pdf" | "docx";
  status: "pending" | "processing" | "completed" | "failed";
  url?: string;
  error?: string;
}

export interface AiRequest {
  prompt: string;
  context?: object;
  mode?: string;
}
export interface AiResponse {
  content: string;
  usage?: { tokens: number };
}

export interface Organization {
  id: string;
  name: string;
  plan: "starter" | "pro" | "business" | "enterprise";
  memberCount: number;
}

export interface Usage {
  documents: number;
  storage: number;
  aiRequests: number;
  period: string;
}
