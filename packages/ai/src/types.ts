import type { Block, GoTipeEditor } from "@gotipe/core";

export interface AiContext {
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
  commands?: AiCommand[];
  enableAutoComplete?: boolean;
  enablePiiDetection?: boolean;
}

export interface AiContextOptions {
  provider?: AiProvider;
}

export interface AiAgentOptions {
  provider?: AiProvider;
}
