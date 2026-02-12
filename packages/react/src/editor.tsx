import type { GoTipeEditor } from "@gotipe/core";
import type React from "react";
import type { BlockRendererProps } from "./block-renderer";
import { EditorContext } from "./context";
import { EditorContent } from "./editor-content";

export interface EditorProps {
  editor: GoTipeEditor | null;
  className?: string;
  style?: React.CSSProperties;
  blockRenderer?: (props: BlockRendererProps) => React.ReactNode;
  slotBefore?: React.ReactNode;
  slotAfter?: React.ReactNode;
  children?: React.ReactNode;
}

export function Editor({
  editor,
  className,
  style,
  blockRenderer,
  slotBefore,
  slotAfter,
  children,
}: EditorProps) {
  if (!editor) return null;

  return (
    <EditorContext.Provider value={editor}>
      <div className={`gotipe-editor ${className ?? ""}`} style={style} data-gotipe-editor="">
        {slotBefore}
        <EditorContent editor={editor} blockRenderer={blockRenderer} />
        {children}
        {slotAfter}
      </div>
    </EditorContext.Provider>
  );
}
