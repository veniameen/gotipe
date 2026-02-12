import type { Block, GoTipeEditor } from "@gotipe/core";
import type {
  AiComment,
  AiContext,
  AiOptions,
  AiProofreadSuggestion,
  AiProvider,
  AiSuggestion,
} from "./types";

export class AiManager {
  private provider: AiProvider | null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private _processing = false;

  constructor(
    private editor: GoTipeEditor,
    private options: AiOptions,
  ) {
    this.provider = options.provider ?? null;
  }

  get processing(): boolean {
    return this._processing;
  }

  setProvider(provider: AiProvider): void {
    this.provider = provider;
  }

  getProvider(): AiProvider | null {
    return this.provider;
  }

  buildContext(): AiContext {
    const state = this.editor.getViewState();
    const sel = state.selection;
    const currentBlock = state.blocks.find((b) => b.id === sel.anchor.blockId);
    let selectedText: string | undefined;
    if (sel.type === "text" && currentBlock && Array.isArray(currentBlock.content)) {
      const text = currentBlock.content.map((s) => s.text).join("");
      selectedText = text.slice(sel.anchor.offset, sel.head.offset);
    }
    const blockIndex = state.blocks.findIndex((b) => b.id === sel.anchor.blockId);
    const maxCtx = this.options.maxContextBlocks ?? 5;
    const start = Math.max(0, blockIndex - maxCtx);
    const end = Math.min(state.blocks.length, blockIndex + maxCtx + 1);
    return {
      selectedText,
      currentBlock: currentBlock as unknown as Block | undefined,
      surroundingBlocks: state.blocks.slice(start, end) as unknown as Block[],
    };
  }

  buildFullContext(): AiContext {
    const state = this.editor.getViewState();
    const sel = state.selection;
    const currentBlock = state.blocks.find((b) => b.id === sel.anchor.blockId);
    const fullText = state.blocks
      .map((b) =>
        Array.isArray(b.content) ? b.content.map((s) => s.text).join("") : (b.content ?? ""),
      )
      .join("\n");
    return {
      currentBlock: currentBlock as unknown as Block | undefined,
      surroundingBlocks: state.blocks as unknown as Block[],
      fullText,
    };
  }

  private setProcessing(active: boolean, label?: string): void {
    this._processing = active;
    this.editor.emit("aiStatusChange", { active, label });
  }

  async getSuggestions(prompt: string): Promise<AiSuggestion[]> {
    if (!this.provider) return [];
    const context = this.buildContext();
    return this.provider.generateSuggestions(prompt, context);
  }

  async *streamCompletion(): AsyncIterable<string> {
    if (!this.provider) return;
    this.setProcessing(true, "Generating...");
    try {
      const context = this.buildContext();
      yield* this.provider.generateCompletion(context);
    } finally {
      this.setProcessing(false);
    }
  }

  async *streamRewrite(text: string): AsyncIterable<string> {
    if (!this.provider) return;
    this.setProcessing(true, "Improving...");
    try {
      const context = this.buildContext();
      if (this.provider.streamRewrite) {
        yield* this.provider.streamRewrite(text, context);
      } else {
        const result = await this.provider.executeCommand("rewrite", {
          ...context,
          selectedText: text,
        });
        yield result;
      }
    } finally {
      this.setProcessing(false);
    }
  }

  async *streamContinueWriting(): AsyncIterable<string> {
    if (!this.provider) return;
    this.setProcessing(true, "Writing...");
    try {
      const context = this.buildContext();
      yield* this.provider.generateCompletion(context);
    } finally {
      this.setProcessing(false);
    }
  }

  async *streamGenerateParagraph(prompt: string): AsyncIterable<string> {
    if (!this.provider) return;
    this.setProcessing(true, "Generating paragraph...");
    try {
      const context = this.buildContext();
      if (this.provider.generateParagraph) {
        yield* this.provider.generateParagraph(prompt, context);
      } else {
        const result = await this.provider.executeCommand(`addParagraph:${prompt}`, context);
        yield result;
      }
    } finally {
      this.setProcessing(false);
    }
  }

  async proofread(): Promise<AiProofreadSuggestion[]> {
    if (!this.provider?.proofread) return [];
    this.setProcessing(true, "Proofreading...");
    try {
      const context = this.buildFullContext();
      return await this.provider.proofread(context);
    } finally {
      this.setProcessing(false);
    }
  }

  async reviewComments(): Promise<AiComment[]> {
    if (!this.provider?.reviewComments) return [];
    this.setProcessing(true, "Reviewing...");
    try {
      const context = this.buildFullContext();
      return await this.provider.reviewComments(context);
    } finally {
      this.setProcessing(false);
    }
  }

  async executeCommand(command: string): Promise<string> {
    if (!this.provider) throw new Error("No AI provider configured");
    this.setProcessing(true, "Processing...");
    try {
      const context = this.buildContext();
      return await this.provider.executeCommand(command, context);
    } finally {
      this.setProcessing(false);
    }
  }

  applySuggestion(suggestion: AiSuggestion): void {
    const state = this.editor.getViewState();
    const sel = state.selection;
    if (suggestion.type === "completion") {
      this.editor.chain().insertText(suggestion.content).run();
    } else if (suggestion.type === "rewrite" && sel.type === "text") {
      this.editor.dispatch({
        steps: [
          {
            type: "deleteText",
            blockId: sel.anchor.blockId,
            from: sel.anchor.offset,
            to: sel.head.offset,
          },
          {
            type: "insertText",
            blockId: sel.anchor.blockId,
            offset: sel.anchor.offset,
            text: suggestion.content,
            marks: [],
          },
        ],
      });
    }
  }

  applyProofreadSuggestion(suggestion: AiProofreadSuggestion): void {
    if (suggestion.type === "replace" || suggestion.type === "insert") {
      this.editor.dispatch({
        steps: [
          ...(suggestion.from !== suggestion.to
            ? [
                {
                  type: "deleteText" as const,
                  blockId: suggestion.blockId,
                  from: suggestion.from,
                  to: suggestion.to,
                },
              ]
            : []),
          {
            type: "insertText" as const,
            blockId: suggestion.blockId,
            offset: suggestion.from,
            text: suggestion.suggestedText,
            marks: [],
          },
        ],
      });
    } else if (suggestion.type === "delete") {
      this.editor.dispatch({
        steps: [
          {
            type: "deleteText",
            blockId: suggestion.blockId,
            from: suggestion.from,
            to: suggestion.to,
          },
        ],
      });
    }
  }

  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
    if (this._processing) {
      this.setProcessing(false);
    }
  }

  destroy(): void {
    this.cancelPending();
    this.provider = null;
  }
}
