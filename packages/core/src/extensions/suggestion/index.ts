import { GoTipeError } from "../../error";
import type { GoTipeEditor } from "../../types/editor";
import { type Extension, defineExtension } from "../../types/extension";
import { SuggestionController } from "./controller";
import type { SuggestionEvent, SuggestionOptions, SuggestionState } from "./types";

export type {
  SuggestionCloseReason,
  SuggestionEvent,
  SuggestionOptions,
  SuggestionRange,
  SuggestionSelectContext,
  SuggestionSource,
  SuggestionState,
} from "./types";

/** A suggestion extension and the controls a menu renderer uses. */
export interface Suggestion<Item> extends Extension<SuggestionOptions<Item>> {
  /** Events of every editor that uses this suggestion. Returns the unsubscribe. */
  on(listener: (event: SuggestionEvent<Item>) => void): () => void;
  /** The open suggestion of `editor`, or `null`. */
  state(editor: GoTipeEditor): SuggestionState<Item> | null;
  /** Chooses an item (the highlighted one by default); `false` when there is none. */
  select(editor: GoTipeEditor, index?: number): boolean;
  /** Moves the highlight, wrapping around. */
  move(editor: GoTipeEditor, delta: 1 | -1): void;
  /** Closes the suggestion; it stays closed until the caret leaves its trigger. */
  close(editor: GoTipeEditor): void;
}

/**
 * A headless suggestion opened by a trigger character: mentions (`@`), emoji (`:`) and
 * the like. The editor reports `open`, `update`, `select` and `close` with the query, its
 * range and the caret rectangle; the host renders the list. ArrowUp/ArrowDown/Enter/Escape
 * act only while a suggestion is open, so other key bindings and the slash menu keep
 * working. A query typed further aborts the previous request and ignores its late result.
 */
export function defineSuggestion<Item>(options: SuggestionOptions<Item>): Suggestion<Item> {
  if (!options.char) throw new GoTipeError("EXTENSION_ERROR", "A suggestion needs a trigger");
  if (!options.items === !options.source)
    throw new GoTipeError("EXTENSION_ERROR", "A suggestion needs either items or a source");
  const name = options.name ?? `suggestion:${options.char}`;
  const rules = {
    char: options.char,
    allowSpaces: options.allowSpaces === true,
    startOfWord: options.startOfWord !== false,
    maxQueryLength: options.maxQueryLength ?? 50,
  };
  const listeners = new Set<(event: SuggestionEvent<Item>) => void>();
  const controllers = new WeakMap<GoTipeEditor, SuggestionController<Item>>();
  const emit = (event: SuggestionEvent<Item>) => {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        event.editor.reportError(
          new GoTipeError(
            "EXTENSION_ERROR",
            error instanceof Error ? error.message : "Suggestion listener failed",
            { extension: name },
          ),
        );
      }
    }
  };
  const when =
    (run: (controller: SuggestionController<Item>) => boolean) => (editor: GoTipeEditor) => {
      const controller = controllers.get(editor);
      return controller?.state ? run(controller) : false;
    };
  const extension = defineExtension<SuggestionOptions<Item>>({
    name,
    options,
    keybindings: [
      { key: "ArrowDown", command: when((controller) => controller.move(1)) },
      { key: "ArrowUp", command: when((controller) => controller.move(-1)) },
      // While items load, Enter is taken but chooses nothing (no stale item, no new line).
      {
        key: "Enter",
        command: when((controller) => controller.state!.loading || controller.select()),
      },
      { key: "Escape", command: when((controller) => controller.close("escape")) },
    ],
    onCreate(editor) {
      controllers.get(editor)?.destroy();
      controllers.set(editor, new SuggestionController(editor, options, rules, emit));
    },
    onDestroy(editor) {
      controllers.get(editor)?.destroy();
      controllers.delete(editor);
    },
  });
  return {
    ...extension,
    configure: (next) => defineSuggestion({ ...options, ...next }),
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    state: (editor) => controllers.get(editor)?.state ?? null,
    select: (editor, index) => controllers.get(editor)?.select(index) ?? false,
    move(editor, delta) {
      controllers.get(editor)?.move(delta);
    },
    close(editor) {
      controllers.get(editor)?.close("escape");
    },
  };
}
