import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { createContext, useContext } from "react";
import type React from "react";
import type { BlockRendererProps } from "../block-renderer";

/** Props of a custom block view (see `EditorContent`'s `blockViews`). */
export interface BlockViewProps {
  block: BlockView;
  editor: GoTipeEditor;
  parentType?: string;
  selectedBlockId: string;
  isSelected: boolean;
  /** The document is read-only (`editor.isEditable === false`). */
  readOnly: boolean;
  /** Rendered as a non-editable suggestion (phantom block). */
  phantom: boolean;
  /**
   * Attributes the root element must carry (`data-block-id` or phantom id,
   * node decorations). Merge `rootProps.className` with your own classes.
   */
  rootProps: Record<string, unknown>;
  /** The block's text with marks and decorations. */
  content: React.ReactNode;
  /** The block's children, rendered by the editor. */
  children: React.ReactNode;
}

/**
 * A custom block view. A view is drawn again on every change of the editor, since it may read
 * the editor as it draws. A view that draws only from its props, hooks and contexts can say so
 * with `pure`: then its block is drawn again only when the block is a new object, the caret
 * enters or leaves it, or the editor becomes read-only or editable. Whatever else such a view
 * shows it must subscribe to (`useEditorState`). Its `selectedBlockId` names the caret's block
 * only while that is its block or a block under it, and is `""` otherwise.
 */
export type BlockViewComponent = ((props: BlockViewProps) => React.ReactNode) & {
  pure?: boolean;
};
export type BlockViews = Partial<Record<string, BlockViewComponent>>;

export const BlockViewsContext = createContext<BlockViews | null>(null);
export const LegacyRendererContext = createContext<
  ((props: BlockRendererProps) => React.ReactNode) | null
>(null);

/** Placeholder text of an empty block; `null` hides it. */
export type PlaceholderFn = (block: BlockView, parentType: string | undefined) => string | null;
export const PlaceholderContext = createContext<PlaceholderFn | null>(null);

/**
 * What a block shows after its text, inside its element — a heading's anchor link. It is drawn
 * as a widget: outside the document's text and offsets, and not editable. `null` draws nothing.
 */
export type AfterTextFn = (block: BlockView) => React.ReactNode;
export const AfterTextContext = createContext<AfterTextFn | null>(null);
export const PhantomContext = createContext(false);

/** True while rendering suggested (phantom) blocks. */
export function usePhantom(): boolean {
  return useContext(PhantomContext);
}
