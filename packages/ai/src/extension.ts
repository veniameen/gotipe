import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { defineAiAgent } from "./agent";
import { defineAiContext } from "./context";
import { AiManager } from "./manager";
import type { AiOptions } from "./types";

export const defineAi = defineExtension<AiOptions>({
  name: "ai",
  options: {
    debounceMs: 500,
    maxContextBlocks: 5,
    enableAutoComplete: false,
    enablePiiDetection: false,
  },
  storageKey: "ai",
  onCreate(editor: GoTipeEditor) {
    const opts = this.options as AiOptions;
    const manager = new AiManager(editor, opts);
    const store = editor as unknown as Record<string, unknown>;
    store.__aiManager = manager;

    if (!opts.enableAutoComplete) return;

    const debounceMs = opts.debounceMs ?? 500;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let ghostText: { text: string; blockId: string; offset: number } | null = null;
    let abortController: AbortController | null = null;

    function clearGhost() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      if (ghostText) {
        ghostText = null;
        editor.emit("aiGhostTextChange", null);
      }
    }

    function acceptGhost() {
      if (!ghostText) return false;
      const { text, blockId, offset } = ghostText;
      ghostText = null;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      editor.emit("aiGhostTextChange", null);
      editor.dispatch({
        steps: [{ type: "insertText", blockId, offset, text, marks: [] }],
      });
      return true;
    }

    // Listen for content changes — debounce ghost text generation
    const unsubViewState = editor.on("viewStateChange", () => {
      // Clear current ghost and restart debounce
      clearGhost();

      if (!manager.getProvider()) return;

      debounceTimer = setTimeout(async () => {
        const state = editor.getViewState();
        const sel = state.selection;
        // Only generate when cursor is collapsed
        if (sel.anchor.blockId !== sel.head.blockId || sel.anchor.offset !== sel.head.offset) return;

        abortController = new AbortController();
        const signal = abortController.signal;

        try {
          let accumulated = "";
          for await (const chunk of manager.streamCompletion()) {
            if (signal.aborted) return;
            accumulated += chunk;
            ghostText = {
              text: accumulated,
              blockId: sel.anchor.blockId,
              offset: sel.anchor.offset,
            };
            editor.emit("aiGhostTextChange", { ...ghostText });
          }
        } catch {
          // Aborted or error — silently ignore
        }
      }, debounceMs);
    });

    // Handle Tab to accept, Escape to dismiss
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && ghostText && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        acceptGhost();
      } else if (e.key === "Escape" && ghostText) {
        e.preventDefault();
        clearGhost();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    store.__aiGhostCleanup = () => {
      clearGhost();
      unsubViewState();
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  },
  onDestroy(editor: GoTipeEditor) {
    const store = editor as unknown as Record<string, unknown>;
    const cleanup = store.__aiGhostCleanup as (() => void) | undefined;
    cleanup?.();
    const manager = store.__aiManager as AiManager | undefined;
    manager?.destroy();
  },
});

/**
 * Convenience preset that bundles all three AI levels:
 * - Level 1 (base): AiManager, ghost text autocomplete
 * - Level 2 (context): Improve, Continue Writing, Ask AI
 * - Level 3 (agent): Command Bar routing, Proofread, Comments, Add Paragraph
 */
export const AiPreset = [defineAi, defineAiContext, defineAiAgent];
