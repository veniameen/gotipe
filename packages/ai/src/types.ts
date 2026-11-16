import type { Block, GoTipeEditor } from "@gotipe/core";

export interface AiContext {
  /** Providers should abort network/stream work when this signal is cancelled. */
  signal?: AbortSignal;
  selectedText?: string;
  currentBlock?: Block;
  surroundingBlocks?: Block[];
  documentTitle?: string;
  language?: string;
  fullText?: string;
}

export interface AiSuggestion {
  id: string;
  type: "completion" | "rewrite" | "fix" | "translate" | "summarize" | "expand";
  content: string;
  confidence: number;
}

export interface AiProofreadSuggestion {
  id: string;
  type: "insert" | "delete" | "replace";
  blockId: string;
  from: number;
  to: number;
  originalText: string;
  suggestedText: string;
  reason?: string;
}

export interface AiComment {
  id: string;
  blockId: string;
  from: number;
  to: number;
  quotedText: string;
  body: string;
  category?: "grammar" | "style" | "clarity" | "logic" | "general";
}

/**
 * What an AI request does. `aiStatusChange` carries it, and the interface says it in its own
 * words: `AiStatusIndicator` of `@gotipe/block-editor` reads the keys `ai.status.*`.
 */
export type AiTask =
  | "suggestions"
  | "completion"
  | "rewrite"
  | "continue"
  | "paragraph"
  | "proofread"
  | "review"
  | "command";

/** What `aiStatusChange` carries (D-196). */
export interface AiStatus {
  /** A request runs. */
  active: boolean;
  /** What the request does, or did when a proofread or a review ends; none after a failure. */
  task?: AiTask;
  /** How many suggestions a proofread or comments a review found, when it ends. */
  count?: number;
  /**
   * English words of the status ("Proofreading...", "Found 3 suggestions"), or the message of
   * a failure. Kept for hosts that show it as it is; say `task` and `count` in your own words.
   */
  label?: string;
}

export interface AiCommand {
  name: string;
  description: string;
  execute: (editor: GoTipeEditor, context: AiContext) => Promise<AiSuggestion[]>;
}

export interface AiProvider {
  name: string;
  generateCompletion(context: AiContext): AsyncIterable<string>;
  generateSuggestions(prompt: string, context: AiContext): Promise<AiSuggestion[]>;
  executeCommand(command: string, context: AiContext): Promise<string>;
  streamRewrite?(text: string, context: AiContext): AsyncIterable<string>;
  proofread?(context: AiContext): Promise<AiProofreadSuggestion[]>;
  reviewComments?(context: AiContext): Promise<AiComment[]>;
  generateParagraph?(prompt: string, context: AiContext): AsyncIterable<string>;
}

export interface AiOptions {
  provider?: AiProvider;
  debounceMs?: number;
  maxContextBlocks?: number;
  enableAutoComplete?: boolean;
  /** Block outbound requests containing supported email/phone/Luhn-card patterns. Not a complete privacy classifier. */
  enablePiiDetection?: boolean;
}

export interface AiContextOptions {
  provider?: AiProvider;
}

export interface AiAgentOptions {
  provider?: AiProvider;
}
