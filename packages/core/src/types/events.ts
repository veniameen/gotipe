import type { GoTipeError } from "../error";
import type { GoTipeEditor } from "./editor";
import type { TransactionContext } from "./state";
import type { ViewState } from "./view";

export interface EditorEvents {
  update: (props: { editor: GoTipeEditor }) => void;
  /** Emitted after a local dispatch commits, before its update event. */
  transaction: (props: TransactionContext & { editor: GoTipeEditor }) => void;
  selectionChange: (props: { editor: GoTipeEditor }) => void;
  focus: (props: { editor: GoTipeEditor }) => void;
  blur: (props: { editor: GoTipeEditor }) => void;
  create: (props: { editor: GoTipeEditor }) => void;
  destroy: (props: { editor: GoTipeEditor }) => void;
  viewStateChange: (state: ViewState) => void;
  openSlashMenu: () => void;
  openLinkDialog: () => void;
  commentAdded: (commentId: string) => void;
  commentResolved: (commentId: string) => void;
  commentDeleted: (commentId: string) => void;
  commentUpdated: (commentId: string) => void;
  executeAiCommand: (payload: { commandId: string; prompt?: string }) => void;
  aiStatusChange: (status: { active: boolean; label?: string }) => void;
  aiGhostTextChange: (ghost: { text: string; blockId: string; offset: number } | null) => void;
  aiProofreadChange: (payload: { suggestions: unknown[]; currentIndex: number }) => void;
  scrollToBlock: (payload: { blockId: string }) => void;
  /** Every editor error. The editor never renders error text itself. */
  error: (error: GoTipeError) => void;
  /** Native IME ownership ended before an external mutation; error carries recovery data. */
  compositionInterrupted: () => void;
  editableChange: (editable: boolean) => void;
  decorationsChange: (payload: { layer: string }) => void;
  /**
   * Right before `enableCollaboration` takes the document as the baseline every replica
   * shares. A listener may still undo what it added to the loaded document.
   */
  beforeCollaboration: () => void;
}
