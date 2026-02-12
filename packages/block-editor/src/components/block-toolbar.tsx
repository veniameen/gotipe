import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useState } from "react";
import { BlockContextMenu } from "./block-context-menu";
import { DragHandle } from "./drag-handle";

export interface BlockToolbarProps {
  editor: GoTipeEditor;
  blockId: string;
  onDragStart: (blockId: string) => void;
  onDragEnd: () => void;
}

export function BlockToolbar({ editor, blockId, onDragStart, onDragEnd }: BlockToolbarProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

  const handleContextMenuToggle = useCallback(() => {
    setContextMenuOpen((prev) => !prev);
  }, []);

  const handleAddBlock = useCallback(() => {
    editor.chain().insertBlockAfter("paragraph").run();
  }, [editor]);

  const handleCloseMenu = useCallback(() => {
    setContextMenuOpen(false);
  }, []);

  return (
    <div className="gotipe-block-toolbar" role="toolbar" aria-label="Block actions">
      <button
        type="button"
        aria-label="Add block below"
        onClick={handleAddBlock}
      >
        +
      </button>
      <div style={{ position: "relative" }}>
        <div onClick={handleContextMenuToggle} role="presentation">
          <DragHandle
            blockId={blockId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        </div>
        <BlockContextMenu
          editor={editor}
          blockId={blockId}
          open={contextMenuOpen}
          onClose={handleCloseMenu}
        />
      </div>
    </div>
  );
}
