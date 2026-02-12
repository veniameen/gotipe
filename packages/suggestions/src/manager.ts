import type { GoTipeEditor } from "@gotipe/core";
import type { Suggestion, SuggestionState } from "./types";

export class SuggestionsManager {
  private suggestions = new Map<string, Suggestion>();
  private state: SuggestionState = "off";

  constructor(private editor: GoTipeEditor) {}

  enable(): void {
    this.state = "tracking";
  }

  disable(): void {
    this.state = "off";
  }

  getState(): SuggestionState {
    return this.state;
  }

  addSuggestion(options: Omit<Suggestion, "id" | "createdAt" | "status">): Suggestion {
    const suggestion: Suggestion = {
      ...options,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    this.suggestions.set(suggestion.id, suggestion);
    return suggestion;
  }

  acceptSuggestion(id: string): void {
    const suggestion = this.suggestions.get(id);
    if (suggestion) {
      suggestion.status = "accepted";
      // Apply the suggested change to the document
      if (suggestion.type === "insert" && suggestion.newContent) {
        this.editor.dispatch({
          steps: [
            {
              type: "insertText",
              blockId: suggestion.blockId,
              offset: suggestion.from,
              text: suggestion.newContent,
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
  }

  rejectSuggestion(id: string): void {
    const suggestion = this.suggestions.get(id);
    if (suggestion) {
      suggestion.status = "rejected";
    }
  }

  getSuggestions(): Suggestion[] {
    return Array.from(this.suggestions.values());
  }

  getPendingSuggestions(): Suggestion[] {
    return this.getSuggestions().filter((s) => s.status === "pending");
  }

  acceptAll(): void {
    for (const suggestion of this.getPendingSuggestions()) {
      this.acceptSuggestion(suggestion.id);
    }
  }

  rejectAll(): void {
    for (const suggestion of this.getPendingSuggestions()) {
      this.rejectSuggestion(suggestion.id);
    }
  }

  destroy(): void {
    this.suggestions.clear();
  }
}
