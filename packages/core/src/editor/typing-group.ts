import type { TypingKind } from "../input/session";
import type { SelectionView } from "../types/view";

/**
 * A pause this long between two inputs starts a new undo step. 500 ms is the grouping
 * window of the engine's collaboration history (`gotipe-crdt`, `group_timeout_ms`), so
 * Undo takes back the same typing with and without collaboration; ProseMirror and
 * CodeMirror group by the same gap. Fluent typing leaves 100–300 ms between keys: a
 * phrase typed at once is one step, a stop to think starts the next.
 */
const TYPING_PAUSE_MS = 500;

/**
 * Owns the typing step of the local undo history: text typed one input at a time is one
 * undo step, like deleting with Backspace or Delete in a row. The open step remembers its
 * kind, the selection its last input left and when. The editor replaces the selection
 * object whenever the selection changes and keeps it while it does not, so a caret moved
 * away (even back to the same place), another block or a new selection ends the step.
 * `continues` tells whether typing of `kind` at `selection` goes on with the open step;
 * `record` follows a recorded change: typing keeps the step open after it, anything else
 * ends it.
 */
export function createTypingGroup() {
  let open: { kind: TypingKind; selection: SelectionView; at: number } | null = null;
  return {
    continues(kind: TypingKind | undefined, selection: SelectionView): boolean {
      if (!open || open.kind !== kind || open.selection !== selection) return false;
      const pause = Date.now() - open.at;
      return pause >= 0 && pause < TYPING_PAUSE_MS;
    },
    record(kind: TypingKind | undefined, selection: SelectionView): void {
      open = kind ? { kind, selection, at: Date.now() } : null;
    },
    close(): void {
      open = null;
    },
  };
}
