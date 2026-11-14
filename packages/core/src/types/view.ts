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
  /**
   * Changes when the renderer must rebuild this block's DOM from the model
   * (after the browser inserted nodes it does not own). Use it in the key.
   */
  renderKey?: number;
}

export interface TextSpanView {
  text: string;
  marks: MarkView[];
}

export interface MarkView {
  type: string;
  attrs: Record<string, unknown>;
  /** Set for a mark declared `atomic`: its text is one inline element, not editable text. */
  atomic?: true;
}

export interface SelectionView {
  type: "text" | "block" | "multi";
  /** Exact selected IDs for multi-block selections. */
  blockIds?: string[];
  anchor: { blockId: string; offset: number };
  head: { blockId: string; offset: number };
}

export interface ToolbarState {
  activeMarks: string[];
  /**
   * Attributes of the active marks by type: the stored marks at a caret, else the marks
   * `activeMarks` names. The editor always sets it; hand-built states may leave it out.
   */
  activeMarkAttrs?: Record<string, Record<string, unknown>>;
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
  | { type: "suggestion-delete"; suggestionId: string; blockId: string; from: number; to: number }
  | InlineDecoration
  | WidgetDecoration
  | NodeDecoration
  | BlocksDecoration;

/** Presentation attributes shared by the generic decorations. */
export interface DecorationSpec {
  /** Stable key (unique within the block). */
  key: string;
  className?: string;
  /** Extra attributes, e.g. `data-proposal-id`. */
  attrs?: Record<string, string>;
  /** Inline style, e.g. `{ "--gt-track": "var(--gt-track-2)" }`. */
  style?: Record<string, string>;
}

/** Wraps existing text `[from, to)` of a block. */
export interface InlineDecoration extends DecorationSpec {
  type: "inline";
  blockId: string;
  from: number;
  to: number;
}

/**
 * Non-editable content shown at `offset` of a block (a suggested insertion,
 * a caret). Its text never counts in document offsets.
 */
export interface WidgetDecoration extends DecorationSpec {
  type: "widget";
  blockId: string;
  offset: number;
  text?: string;
  /** Marks to render the widget text with (bold, code…). */
  marks?: MarkView[];
  /** -1: before text inserted at the same offset; 1 (default): after. */
  side?: -1 | 1;
}

/** Class/attributes on a block element. */
export interface NodeDecoration extends DecorationSpec {
  type: "node";
  blockId: string;
}

/** Non-editable phantom blocks rendered before/after a block (suggested new blocks). */
export interface BlocksDecoration extends DecorationSpec {
  type: "blocks";
  blockId: string;
  position: "before" | "after";
  blocks: BlockView[];
}
