import {
  type GoTipeEditor,
  GoTipeError,
  type Step,
  type TransactionContext,
  createId,
} from "@gotipe/core";
import { type TextAnchor, anchorAt, editsOverlap } from "./anchors";
import { findBlock, locateSuggestion, suggestionSteps, textOf, validateRange } from "./apply";
import {
  type SuggestionsSnapshot,
  decodeSuggestionsSnapshot,
  serializeTrackedChange,
} from "./persistence";
import {
  type TrackedChange,
  createTrackedChange,
  isTrackedReverted,
  mergeTrackedChanges,
  reverseTrackedChange,
} from "./tracking/change";
import { trackedDecorations } from "./tracking/decorations";
import { plain } from "./tracking/text-patch";
import type { Suggestion, SuggestionState, SuggestionsOptions } from "./types";

type EditorPort = Pick<
  GoTipeEditor,
  | "getViewState"
  | "getJSON"
  | "dispatch"
  | "previewTransaction"
  | "reportError"
  | "on"
  | "setDecorations"
  | "isDestroyed"
>;
/** Review records own their anchors; accepted engine changes always precede status changes. */
export class SuggestionsManager {
  private suggestions = new Map<string, Suggestion>();
  private anchors = new Map<string, TextAnchor>();
  private tracked = new Map<string, TrackedChange>();
  private listeners = new Set<() => void>();
  private state: SuggestionState = "off";
  private destroyed = false;
  private applying = false;
  private lastCapture: { id: string; at: number } | null = null;
  private cleanup: (() => void)[];
  private layer = `suggestions-${createId()}`;

  constructor(
    private editor: EditorPort,
    private options: SuggestionsOptions = {},
  ) {
    this.cleanup = [
      editor.on("transaction", (context) => this.capture(context)),
      editor.on("update", () => this.synchronizeHistory()),
      editor.on("destroy", () => this.destroy()),
    ];
    if (options.enabled) this.state = "tracking";
  }
  private assertLive(): void {
    if (this.destroyed || this.editor.isDestroyed)
      throw new GoTipeError("PROPOSAL_ACTION_FAILED", "The suggestions manager was destroyed");
  }
  private call(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.editor.reportError(
        new GoTipeError(
          "PROPOSAL_ACTION_FAILED",
          error instanceof Error ? error.message : "Suggestion callback failed",
        ),
      );
    }
  }
  private changed(): void {
    this.refreshDecorations();
    for (const listener of this.listeners) this.call(listener);
    this.call(() => this.options.onChange?.(this.getSuggestions()));
  }
  private refreshDecorations(): void {
    if (this.destroyed || this.editor.isDestroyed) return;
    const document = this.editor.getJSON();
    this.editor.setDecorations(
      this.layer,
      this.getPendingSuggestions().flatMap((suggestion) => {
        const change = this.tracked.get(suggestion.id);
        return change ? trackedDecorations(suggestion.id, change, document) : [];
      }),
    );
  }
  private synchronizeHistory(): void {
    if (this.destroyed || this.editor.isDestroyed || this.applying) return;
    const document = this.editor.getJSON();
    let changed = false;
    for (const [id, change] of this.tracked) {
      const suggestion = this.suggestions.get(id)!;
      if (suggestion.status === "accepted") continue;
      let present = true;
      try {
        reverseTrackedChange(change, document);
      } catch {
        present = false;
      }
      if (suggestion.status === "rejected" && present) {
        suggestion.status = "pending";
        changed = true;
      } else if (
        suggestion.status === "pending" &&
        !present &&
        isTrackedReverted(change, document)
      ) {
        suggestion.status = "rejected";
        changed = true;
      }
    }
    if (changed) {
      this.lastCapture = null;
      this.changed();
    } else this.refreshDecorations();
  }
  subscribe(listener: () => void): () => void {
    this.assertLive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  enable(): void {
    this.assertLive();
    this.state = "tracking";
    this.lastCapture = null;
    this.changed();
  }
  disable(): void {
    this.assertLive();
    this.state = "off";
    this.lastCapture = null;
    this.changed();
  }
  getState(): SuggestionState {
    return this.state;
  }

  private capture(context: TransactionContext): void {
    if (this.destroyed || this.applying || this.state !== "tracking") return;
    let change = createTrackedChange(context.before, context.after);
    if (!change) return;
    let existing: Suggestion | undefined;
    if (this.lastCapture && Date.now() - this.lastCapture.at <= 1000) {
      const previous = this.tracked.get(this.lastCapture.id);
      const merged = previous ? mergeTrackedChanges(previous, change) : null;
      const candidate = this.suggestions.get(this.lastCapture.id);
      if (merged && candidate?.status === "pending") {
        change = merged;
        existing = candidate;
      }
    }
    const patch = change.kind === "text" ? change.patches[0] : undefined;
    const before = patch ? plain(patch.before) : "";
    const after = patch ? plain(patch.after) : "";
    const suggestion: Suggestion = {
      id: existing?.id ?? createId(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      status: "pending",
      applied: true,
      authorId: this.options.authorId ?? "local",
      authorName: this.options.authorName ?? "You",
      type: !patch
        ? "structure"
        : before === after
          ? "format"
          : !before
            ? "insert"
            : !after
              ? "delete"
              : "replace",
      blockId: patch?.blockId ?? (change.kind === "structure" ? change.changedIds[0] : "") ?? "",
      from: patch?.from ?? 0,
      to: patch ? patch.from + after.length : 0,
      originalContent: before,
      newContent: after,
    };
    this.suggestions.set(suggestion.id, suggestion);
    this.tracked.set(suggestion.id, change);
    this.lastCapture = { id: suggestion.id, at: Date.now() };
    this.changed();
  }

  addSuggestion(options: Omit<Suggestion, "id" | "createdAt" | "status">): Suggestion {
    this.assertLive();
    if (!["insert", "delete", "replace", "format"].includes(options.type) || options.applied)
      throw new GoTipeError(
        "PROPOSAL_ACTION_FAILED",
        "Explicit suggestions must describe unapplied text or formatting",
      );
    const block = findBlock(this.editor.getViewState().blocks, options.blockId);
    if (!block || block.content === null)
      throw new GoTipeError("PROPOSAL_ACTION_FAILED", "The suggestion needs a text block");
    const text = textOf(block);
    validateRange(text, options.from, options.to);
    if (options.type === "insert" && options.from !== options.to)
      throw new GoTipeError(
        "PROPOSAL_ACTION_FAILED",
        "An insertion suggestion needs a collapsed range",
      );
    const suggestion: Suggestion = {
      ...structuredClone(options),
      id: createId(),
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    suggestionSteps(suggestion, block, suggestion.from, suggestion.to);
    this.suggestions.set(suggestion.id, suggestion);
    this.anchors.set(suggestion.id, anchorAt(text, suggestion.from, suggestion.to));
    this.changed();
    return structuredClone(suggestion);
  }
  private dispatch(steps: Step[]): void {
    if (!steps.length) return;
    this.applying = true;
    try {
      if (!this.editor.dispatch({ steps, metadata: { reviewAction: true } }))
        throw new GoTipeError(
          "PROPOSAL_ACTION_FAILED",
          "A transaction filter rejected the review action",
        );
    } finally {
      this.applying = false;
      this.lastCapture = null;
    }
  }
  private accept(suggestions: Suggestion[]): void {
    this.assertLive();
    if (!suggestions.length) return;
    const blocks = this.editor.getViewState().blocks;
    const applied = suggestions.filter((suggestion) => suggestion.applied);
    let validationDocument = this.editor.getJSON();
    const validationSteps: Step[] = [];
    for (const suggestion of applied.reverse()) {
      validationSteps.push(
        ...reverseTrackedChange(this.tracked.get(suggestion.id)!, validationDocument),
      );
      validationDocument = this.editor.previewTransaction({ steps: validationSteps });
    }
    const located = suggestions
      .filter((suggestion) => !suggestion.applied)
      .map((suggestion) => locateSuggestion(suggestion, this.anchors.get(suggestion.id)!, blocks));
    for (let i = 0; i < located.length; i++)
      for (let j = i + 1; j < located.length; j++) {
        const a = located[i]!;
        const b = located[j]!;
        if (
          a.block.id === b.block.id &&
          editsOverlap({ start: a.from, end: a.to }, { start: b.from, end: b.to })
        )
          throw new GoTipeError(
            "PROPOSAL_ACTION_FAILED",
            "Suggestions overlap; accept them individually",
          );
      }
    located.sort((a, b) => a.block.id.localeCompare(b.block.id) || b.from - a.from);
    this.dispatch(
      located.flatMap(({ suggestion, block, from, to }) =>
        suggestionSteps(suggestion, block, from, to),
      ),
    );
    for (const { suggestion, from, to } of located) {
      suggestion.from = from;
      suggestion.to = to;
    }
    for (const suggestion of suggestions) {
      suggestion.status = "accepted";
      this.call(() => this.options.onAccept?.(structuredClone(suggestion)));
    }
    this.lastCapture = null;
    this.changed();
  }
  acceptSuggestion(id: string): void {
    this.assertLive();
    const suggestion = this.suggestions.get(id);
    if (suggestion?.status === "pending") this.accept([suggestion]);
  }
  rejectSuggestion(id: string): void {
    this.assertLive();
    const suggestion = this.suggestions.get(id);
    if (suggestion?.status !== "pending") return;
    const change = this.tracked.get(id);
    if (change) this.dispatch(reverseTrackedChange(change, this.editor.getJSON()));
    suggestion.status = "rejected";
    this.lastCapture = null;
    this.call(() => this.options.onReject?.(structuredClone(suggestion)));
    this.changed();
  }
  getSuggestions(): Suggestion[] {
    return structuredClone(Array.from(this.suggestions.values()));
  }
  exportState(): SuggestionsSnapshot {
    this.assertLive();
    return structuredClone({
      version: 1,
      records: Array.from(this.suggestions.values()).map((suggestion) => {
        const change = this.tracked.get(suggestion.id);
        const anchor = this.anchors.get(suggestion.id);
        return {
          suggestion,
          ...(anchor ? { anchor } : {}),
          ...(change ? { change: serializeTrackedChange(change) } : {}),
        };
      }),
    });
  }
  loadState(snapshot: unknown): void {
    this.assertLive();
    const records = decodeSuggestionsSnapshot(snapshot);
    this.suggestions = new Map(records.map((record) => [record.suggestion.id, record.suggestion]));
    this.anchors.clear();
    this.tracked.clear();
    for (const record of records) {
      if (record.anchor) this.anchors.set(record.suggestion.id, record.anchor);
      if (record.change) this.tracked.set(record.suggestion.id, record.change);
    }
    this.lastCapture = null;
    this.changed();
  }
  getPendingSuggestions(): Suggestion[] {
    return this.getSuggestions().filter((suggestion) => suggestion.status === "pending");
  }
  acceptAll(): void {
    this.accept(
      Array.from(this.suggestions.values()).filter((suggestion) => suggestion.status === "pending"),
    );
  }
  rejectAll(): void {
    this.assertLive();
    const pending = Array.from(this.suggestions.values())
      .filter((suggestion) => suggestion.status === "pending")
      .reverse();
    let document = this.editor.getJSON();
    const steps: Step[] = [];
    for (const suggestion of pending) {
      const change = this.tracked.get(suggestion.id);
      if (!change) continue;
      steps.push(...reverseTrackedChange(change, document));
      document = this.editor.previewTransaction({ steps });
    }
    this.dispatch(steps);
    for (const suggestion of pending) {
      suggestion.status = "rejected";
      this.call(() => this.options.onReject?.(structuredClone(suggestion)));
    }
    this.lastCapture = null;
    this.changed();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.state = "off";
    for (const stop of this.cleanup) stop();
    this.cleanup = [];
    if (!this.editor.isDestroyed) this.editor.setDecorations(this.layer, []);
    this.suggestions.clear();
    this.anchors.clear();
    this.tracked.clear();
    this.listeners.clear();
  }
}
