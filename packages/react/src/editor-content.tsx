import type { GoTipeEditor } from "@gotipe/core";
import type React from "react";
import { useEffect, useRef } from "react";
import type { BlockRendererProps } from "./block-renderer";

export function EditorContent({
  editor,
  blockRenderer: _blockRenderer,
}: {
  editor: GoTipeEditor;
  blockRenderer?: (props: BlockRendererProps) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && editor) {
      editor.mount(containerRef.current);
      return () => editor.unmount();
    }
  }, [editor]);

  return (
    <div
      ref={containerRef}
      role="textbox"
      aria-multiline={true}
      aria-label="Document content"
      tabIndex={0}
      className="gotipe-content"
      data-gotipe-content=""
    />
  );
}
