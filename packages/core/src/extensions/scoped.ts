import { GoTipeError } from "../error";
import type { GoTipeEditor } from "../types/editor";

/**
 * One controller per editor for an extension that keeps state outside the document (a search,
 * a count, a toggle). The extension creates it in `onCreate` and releases it in `onDestroy`;
 * a destroyed editor has none, so a late call cannot bring its state back.
 */
export function editorScoped<T extends { destroy(): void }>() {
  const controllers = new WeakMap<GoTipeEditor, T>();
  return {
    attach(editor: GoTipeEditor, controller: T): void {
      controllers.get(editor)?.destroy();
      controllers.set(editor, controller);
    },
    detach(editor: GoTipeEditor): void {
      controllers.get(editor)?.destroy();
      controllers.delete(editor);
    },
    get(editor: GoTipeEditor): T | null {
      return editor.isDestroyed ? null : (controllers.get(editor) ?? null);
    },
  };
}

/** Listeners of a controller's state; a failing listener is reported, the others still run. */
export function stateListeners<S>(editor: GoTipeEditor, extension: string) {
  const listeners = new Set<(state: S) => void>();
  return {
    add(listener: (state: S) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify(state: S): void {
      for (const listener of [...listeners]) {
        try {
          listener(state);
        } catch (error) {
          editor.reportError(
            new GoTipeError(
              "EXTENSION_ERROR",
              error instanceof Error ? error.message : "A state listener failed",
              { extension },
            ),
          );
        }
      }
    },
    clear(): void {
      listeners.clear();
    },
  };
}
