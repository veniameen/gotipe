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

export type BlockViewComponent = (props: BlockViewProps) => React.ReactNode;
export type BlockViews = Partial<Record<string, BlockViewComponent>>;

export const BlockViewsContext = createContext<BlockViews | null>(null);
export const LegacyRendererContext = createContext<
  ((props: BlockRendererProps) => React.ReactNode) | null
>(null);

/** Placeholder text of an empty block; `null` hides it. */
export type PlaceholderFn = (block: BlockView, parentType: string | undefined) => string | null;
export const PlaceholderContext = createContext<PlaceholderFn | null>(null);
export const PhantomContext = createContext(false);

/** True while rendering suggested (phantom) blocks. */
export function usePhantom(): boolean {
  return useContext(PhantomContext);
}
