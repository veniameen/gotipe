import type { GoTipeEditor } from "@gotipe/core";
import type React from "react";
import type { BlockRendererProps } from "./block-renderer";
import { EditorContext } from "./context";
import { type BlockViews, EditorContent, type PlaceholderFn } from "./editor-content";

export interface EditorProps {
  editor: GoTipeEditor | null;
  className?: string;
  style?: React.CSSProperties;
  blockRenderer?: (props: BlockRendererProps) => React.ReactNode;
  /** Custom views by block type. */
  blockViews?: BlockViews;
  /** Placeholder of empty blocks. */
  placeholder?: PlaceholderFn;
  /** Accessible name of the document. */
  ariaLabel?: string;
  slotBefore?: React.ReactNode;
  slotAfter?: React.ReactNode;
  children?: React.ReactNode;
}

export function Editor({
  editor,
  className,
  style,
  blockRenderer,
  blockViews,
  placeholder,
  ariaLabel,
  slotBefore,
  slotAfter,
  children,
}: EditorProps) {
  if (!editor) return null;

  return (
    <EditorContext.Provider value={editor}>
      <div className={`gotipe-editor ${className ?? ""}`} style={style} data-gotipe-editor="">
        {slotBefore}
        <EditorContent
          editor={editor}
          blockRenderer={blockRenderer}
          blockViews={blockViews}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
        />
        {children}
        {slotAfter}
      </div>
    </EditorContext.Provider>
  );
}
