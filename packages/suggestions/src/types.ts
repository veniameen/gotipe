export interface Suggestion {
  id: string;
  type: "insert" | "delete" | "replace" | "format";
  blockId: string;
  from: number;
  to: number;
  newContent?: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
}

export type SuggestionState = "tracking" | "viewing" | "off";

export interface SuggestionsOptions {
  enabled?: boolean;
  onAccept?: (suggestion: Suggestion) => void;
  onReject?: (suggestion: Suggestion) => void;
}
