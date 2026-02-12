import type { Block, GoTipeEditor } from "@gotipe/core";
import type { AiContext, AiOptions, AiProvider, AiSuggestion } from "./types";

export class AiManager {
  private provider: AiProvider | null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  constructor(
    private editor: GoTipeEditor,
    private options: AiOptions,
  ) {
    this.provider = options.provider ?? null;
  }

  setProvider(provider: AiProvider): void {
    this.provider = provider;
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

  async getSuggestions(prompt: string): Promise<AiSuggestion[]> {
    if (!this.provider) return [];
    const context = this.buildContext();
    return this.provider.generateSuggestions(prompt, context);
  }

  async *streamCompletion(): AsyncIterable<string> {
    if (!this.provider) return;
    const context = this.buildContext();
    yield* this.provider.generateCompletion(context);
  }

  async executeCommand(command: string): Promise<string> {
    if (!this.provider) throw new Error("No AI provider configured");
    const context = this.buildContext();
    return this.provider.executeCommand(command, context);
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

  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }

  destroy(): void {
    this.cancelPending();
    this.provider = null;
  }
}
