import type { GoTipeEditor } from "@gotipe/core";
import { Editor } from "@gotipe/react";
import type React from "react";
import { BlockToolbar } from "./block-toolbar";
import { SlashMenu } from "./slash-menu";

export interface BlockEditorProps {
  editor: GoTipeEditor | null;
  className?: string;
  style?: React.CSSProperties;
  showSlashMenu?: boolean;
  showBlockToolbar?: boolean;
  showCollaborationCursors?: boolean;
  children?: React.ReactNode;
}

export function BlockEditor({
  editor,
  className,
  style,
  showSlashMenu = true,
  showBlockToolbar = true,
  children,
}: BlockEditorProps) {
  if (!editor) return null;

  return (
    <div
      className={`gotipe-block-editor ${className ?? ""}`}
      style={style}
      data-gotipe-block-editor=""
    >
      <Editor editor={editor}>
        {showSlashMenu && <SlashMenu editor={editor} />}
        {showBlockToolbar && <BlockToolbar editor={editor} />}
        {children}
      </Editor>
    </div>
  );
}
