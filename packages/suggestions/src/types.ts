export interface Suggestion {
  id: string;
  type: "insert" | "delete" | "replace" | "format" | "structure";
  blockId: string;
  from: number;
  to: number;
  newContent?: string;
  originalContent?: string;
  /** Tracked edits are already visible in the draft; explicit proposals are not. */
  applied?: boolean;
  /** Marks for explicitly proposed replacement text. */
  marks?: Mark[];
  /** Explicit mark changes for a format proposal. */
  format?: { add?: Mark[]; remove?: string[] };
  authorId: string;
  authorName: string;
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
}

export type SuggestionState = "tracking" | "viewing" | "off";

export interface SuggestionsOptions {
  enabled?: boolean;
  authorId?: string;
  authorName?: string;
  /** Detached review summaries. Persist exportState() to retain captured inverse patches. */
  onChange?: (suggestions: Suggestion[]) => void;
  onAccept?: (suggestion: Suggestion) => void;
  onReject?: (suggestion: Suggestion) => void;
}
import type { Mark } from "@gotipe/core";
