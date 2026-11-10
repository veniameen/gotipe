import { storedUpdate } from "./protocol";
import type { CollaborationEditor, CollaborationState } from "./types";

/**
 * Use before mounting/enabling user input, with an editor created from state.baseline.
 * Never replaces content. An incompatible baseline is an explicit engine error.
 */
export function applyCollaborationState(
  editor: CollaborationEditor,
  state: CollaborationState,
  peerId: string,
): void {
  const updates = state.updates.map(storedUpdate);
  editor.enableCollaboration(peerId);
  for (const update of updates) editor.receiveCollaborationUpdate(update);
}
