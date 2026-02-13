import type { GoTipeEditor } from "../editor";
import type { ViewState } from "./view";

export interface EditorEvents {
  update: (props: { editor: GoTipeEditor }) => void;
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
}
