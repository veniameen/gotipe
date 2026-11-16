import { type GoTipeEditor, type Selection, createId } from "@gotipe/core";
import {
  type AiTarget,
  assertTarget,
  assertWritable,
  blockLocation,
  blockSnapshots,
  buildAiContext,
  captureTarget,
  flatten,
  textOf,
  validOffset,
} from "./document";
import { assertNoPii } from "./pii";
import { proofreadSteps } from "./proofread";
import { AiRequests } from "./requests";
import type {
  AiComment,
  AiContext,
  AiOptions,
  AiProofreadSuggestion,
  AiProvider,
  AiSuggestion,
  AiTask,
} from "./types";

export class AiManager {
  private provider: AiProvider | null;
  private requests: AiRequests;
  private targets = new Map<string, AiTarget>();
  private proofreadBaselines = new Map<string, string>();
  private destroyed = false;

  constructor(
    private editor: GoTipeEditor,
    private options: AiOptions,
  ) {
    this.provider = options.provider ?? null;
    this.requests = new AiRequests(editor);
  }
  get processing(): boolean {
    return this.requests.processing;
  }
  setProvider(provider: AiProvider): void {
    if (this.destroyed) throw new Error("AI manager has been destroyed");
    this.cancelPending();
    this.provider = provider;
  }
  getProvider(): AiProvider | null {
    return this.provider;
  }
  buildContext(): AiContext {
    return buildAiContext(this.editor, this.options.maxContextBlocks);
  }
  buildFullContext(): AiContext {
    return buildAiContext(this.editor, this.options.maxContextBlocks, true);
  }
  captureTarget(): AiTarget {
    return captureTarget(this.editor);
  }
  private requireProvider(): AiProvider {
    assertWritable(this.editor);
    if (this.destroyed) throw new Error("AI manager has been destroyed");
    if (!this.provider) throw new Error("No AI provider configured");
    return this.provider;
  }
  private async run<T>(
    task: AiTask,
    full: boolean,
    action: (provider: AiProvider, context: AiContext) => Promise<T>,
  ): Promise<T> {
    const provider = this.requireProvider();
    const request = this.requests.start(task);
    try {
      request.check();
      const context = full ? this.buildFullContext() : this.buildContext();
      if (this.options.enablePiiDetection) assertNoPii(context);
      const result = await action(provider, { ...context, signal: request.signal });
      request.check();
      return result;
    } finally {
      request.finish();
    }
  }
  private async *stream(
    task: AiTask,
    action: (provider: AiProvider, context: AiContext) => AsyncIterable<string>,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const provider = this.requireProvider();
    const request = this.requests.start(task, signal);
    try {
      request.check();
      const context = { ...this.buildContext(), signal: request.signal };
      if (this.options.enablePiiDetection) assertNoPii(context);
      for await (const chunk of action(provider, context)) {
        request.check();
        if (typeof chunk !== "string")
          throw new Error("AI provider returned an invalid text chunk");
        yield chunk;
      }
      request.check();
    } finally {
      request.finish();
    }
  }
  async getSuggestions(prompt: string): Promise<AiSuggestion[]> {
    if (this.options.enablePiiDetection) assertNoPii(prompt);
    const target = this.captureTarget();
    const result = await this.run("suggestions", false, (provider, context) =>
      provider.generateSuggestions(prompt, context),
    );
    assertTarget(this.editor, target);
    const ids = new Set<string>();
    this.targets.clear();
    for (const suggestion of result) {
      if (
        !suggestion.id ||
        ids.has(suggestion.id) ||
        typeof suggestion.content !== "string" ||
        !["completion", "rewrite", "fix", "translate", "summarize", "expand"].includes(
          suggestion.type,
        )
      )
        throw new Error("AI provider returned an invalid suggestion");
      ids.add(suggestion.id);
      this.targets.set(suggestion.id, target);
    }
    return result;
  }
  streamCompletion(signal?: AbortSignal): AsyncIterable<string> {
    return this.stream(
      "completion",
      (provider, context) => provider.generateCompletion(context),
      signal,
    );
  }
  streamRewrite(text: string): AsyncIterable<string> {
    if (this.options.enablePiiDetection) assertNoPii(text);
    return this.stream("rewrite", async function* (provider, context) {
      if (provider.streamRewrite) yield* provider.streamRewrite(text, context);
      else yield await provider.executeCommand("rewrite", { ...context, selectedText: text });
    });
  }
  streamContinueWriting(): AsyncIterable<string> {
    return this.stream("continue", (provider, context) => provider.generateCompletion(context));
  }
  streamGenerateParagraph(prompt: string): AsyncIterable<string> {
    if (this.options.enablePiiDetection) assertNoPii(prompt);
    return this.stream("paragraph", async function* (provider, context) {
      if (provider.generateParagraph) yield* provider.generateParagraph(prompt, context);
      else yield await provider.executeCommand(`addParagraph:${prompt}`, context);
    });
  }
  /**
   * Drops results for blocks that another replica changed while the provider worked (`seen`:
   * the blocks it was asked about); the rest still apply (D-46).
   */
  private unchanged<T extends { blockId: string }>(seen: Map<string, string>, results: T[]): T[] {
    assertWritable(this.editor);
    const now = blockSnapshots(this.editor);
    return results.filter(
      (item) => !seen.has(item.blockId) || now.get(item.blockId) === seen.get(item.blockId),
    );
  }
  async proofread(): Promise<AiProofreadSuggestion[]> {
    const seen = blockSnapshots(this.editor);
    const result = await this.run("proofread", true, (provider, context) => {
      if (!provider.proofread) throw new Error("This AI provider does not support proofreading");
      return provider.proofread(context);
    });
    const suggestions = this.unchanged(seen, result);
    // Validate provider coordinates before exposing anything to review controls.
    proofreadSteps(this.editor, suggestions, new Map());
    this.proofreadBaselines.clear();
    for (const suggestion of suggestions)
      this.proofreadBaselines.set(suggestion.id, seen.get(suggestion.blockId)!);
    return suggestions;
  }
  async reviewComments(): Promise<AiComment[]> {
    const seen = blockSnapshots(this.editor);
    const result = await this.run("review", true, (provider, context) => {
      if (!provider.reviewComments)
        throw new Error("This AI provider does not support review comments");
      return provider.reviewComments(context);
    });
    const comments = this.unchanged(seen, result);
    const blocks = new Map(flatten(this.editor.getJSON().blocks).map((block) => [block.id, block]));
    const ids = new Set<string>();
    for (const comment of comments) {
      const block = blocks.get(comment.blockId);
      const text = block ? textOf(block) : "";
      if (
        !block ||
        !comment.id ||
        ids.has(comment.id) ||
        typeof comment.body !== "string" ||
        !validOffset(text, comment.from) ||
        !validOffset(text, comment.to) ||
        comment.from > comment.to ||
        text.slice(comment.from, comment.to) !== comment.quotedText
      ) {
        throw new Error("AI review comment has an invalid text anchor");
      }
      ids.add(comment.id);
    }
    return comments;
  }
  executeCommand(command: string): Promise<string> {
    if (this.options.enablePiiDetection) assertNoPii(command);
    return this.run("command", false, (provider, context) =>
      provider.executeCommand(command, context),
    );
  }
  applySuggestion(
    suggestion: AiSuggestion,
    target = this.targets.get(suggestion.id) ?? this.captureTarget(),
  ): void {
    if (this.destroyed) throw new Error("AI manager has been destroyed");
    assertTarget(this.editor, target);
    if (typeof suggestion.content !== "string") throw new Error("AI suggestion has no text");
    const selection = target.selection;
    const engineSelection: Selection =
      selection.type === "text"
        ? { type: "range", anchor: selection.anchor, head: selection.head }
        : selection.type === "multi"
          ? { type: "multi", blockIds: selection.blockIds ?? [selection.anchor.blockId] }
          : { type: "block", blockId: selection.anchor.blockId };
    if (!this.editor.chain().setSelection(engineSelection).insertText(suggestion.content).run()) {
      throw new Error("The editor declined the AI change");
    }
    this.targets.delete(suggestion.id);
  }
  insertParagraph(text: string, target: AiTarget): void {
    if (this.destroyed) throw new Error("AI manager has been destroyed");
    assertTarget(this.editor, target);
    if (!text) return;
    const location = blockLocation(this.editor.getJSON().blocks, target.selection.anchor.blockId);
    if (!location) throw new Error("The AI insertion block no longer exists");
    const id = createId();
    const item = location.block.type === "listItem" || location.block.type === "todoItem";
    if (
      !this.editor.dispatch({
        steps: [
          {
            type: "insertBlock",
            parentId: location.parentId,
            index: location.index + 1,
            block: {
              id,
              type: item ? location.block.type : "paragraph",
              attrs: location.block.type === "todoItem" ? { checked: false } : {},
              content: [{ text, marks: [] }],
              children: [],
            },
          },
        ],
        selection: { type: "cursor", blockId: id, offset: text.length },
      })
    )
      throw new Error("The editor declined the AI insertion");
  }
  applyProofreadSuggestion(suggestion: AiProofreadSuggestion): void {
    this.applyProofreadSuggestions([suggestion]);
  }
  applyProofreadSuggestions(suggestions: AiProofreadSuggestion[]): void {
    if (this.destroyed) throw new Error("AI manager has been destroyed");
    const steps = proofreadSteps(this.editor, suggestions, this.proofreadBaselines);
    if (!steps.length) return;
    if (!this.editor.dispatch({ steps })) throw new Error("The editor declined the AI corrections");
    for (const suggestion of suggestions) this.proofreadBaselines.delete(suggestion.id);
  }
  rebaseProofreadSuggestions(
    suggestions: AiProofreadSuggestion[],
    applied: AiProofreadSuggestion[],
  ): AiProofreadSuggestion[] {
    const blocks = new Map(flatten(this.editor.getJSON().blocks).map((block) => [block.id, block]));
    return suggestions.map((suggestion) => {
      const shift = applied
        .filter((edit) => edit.blockId === suggestion.blockId && edit.to <= suggestion.from)
        .reduce(
          (sum, edit) =>
            sum + (edit.type === "delete" ? 0 : edit.suggestedText.length) - (edit.to - edit.from),
          0,
        );
      const updated = { ...suggestion, from: suggestion.from + shift, to: suggestion.to + shift };
      // Only the block changed by this accepted batch receives a new baseline.
      if (applied.some((edit) => edit.blockId === suggestion.blockId))
        this.proofreadBaselines.set(suggestion.id, JSON.stringify(blocks.get(suggestion.blockId)));
      return updated;
    });
  }
  cancelPending(): void {
    this.requests.cancel();
  }
  destroy(): void {
    this.destroyed = true;
    this.requests.destroy();
    this.provider = null;
    this.targets.clear();
    this.proofreadBaselines.clear();
  }
}
