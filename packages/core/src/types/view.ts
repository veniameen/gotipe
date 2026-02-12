export interface ViewState {
  blocks: BlockView[];
  selection: SelectionView;
  decorations: Decoration[];
  toolbar: ToolbarState;
  version: number;
}

export interface BlockView {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  content: TextSpanView[] | string | null;
  children: BlockView[];
  decorations: Decoration[];
}

export interface TextSpanView {
  text: string;
  marks: MarkView[];
}

export interface MarkView {
  type: string;
  attrs: Record<string, unknown>;
}

export interface SelectionView {
  type: "text" | "block" | "multi";
  anchor: { blockId: string; offset: number };
  head: { blockId: string; offset: number };
}

export interface ToolbarState {
  activeMarks: string[];
  activeBlockType: string;
  activeBlockAttrs: Record<string, unknown>;
  canUndo: boolean;
  canRedo: boolean;
}

export type Decoration =
  | { type: "placeholder"; text: string; blockId: string }
  | { type: "ghost-text"; text: string; blockId: string; offset: number }
  | {
      type: "remote-cursor";
      peerId: string;
      blockId: string;
      offset: number;
      user: { name: string; color: string };
    }
  | {
      type: "remote-selection";
      peerId: string;
      blockId: string;
      from: number;
      to: number;
      color: string;
    }
  | {
      type: "comment-highlight";
      commentId: string;
      blockId: string;
      from: number;
      to: number;
      resolved: boolean;
    }
  | { type: "suggestion-insert"; suggestionId: string; blockId: string; from: number; to: number }
  | { type: "suggestion-delete"; suggestionId: string; blockId: string; from: number; to: number };
