import type { Block, GoTipeEditor } from "@gotipe/core";

export interface AiContext {
  selectedText?: string;
  currentBlock?: Block;
  surroundingBlocks?: Block[];
  documentTitle?: string;
  language?: string;
}

export interface AiSuggestion {
  id: string;
  type: "completion" | "rewrite" | "fix" | "translate" | "summarize" | "expand";
  content: string;
  confidence: number;
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
}

export interface AiOptions {
  provider?: AiProvider;
  debounceMs?: number;
  maxContextBlocks?: number;
  commands?: AiCommand[];
  enableAutoComplete?: boolean;
  enablePiiDetection?: boolean;
}
