import { storedUpdate, unionOf } from "./protocol";
import type { CollaborationEditor, CollaborationState } from "./types";

/**
 * Use before mounting/enabling user input, with an editor created from state.baseline.
 * Never replaces content. An incompatible baseline is an explicit engine error.
 *
 * Stored records are one union, not a sequence: log compaction can place a
 * record before the merged one it depends on, and one record alone may not
 * project a valid document. They are therefore merged into one update, which
 * the editor validates once.
 */
export function applyCollaborationState(
  editor: CollaborationEditor,
  state: CollaborationState,
  peerId: string,
): void {
  const updates = state.updates.map(storedUpdate);
  editor.enableCollaboration(peerId);
  if (updates.length) editor.receiveCollaborationUpdate(unionOf(updates));
}
