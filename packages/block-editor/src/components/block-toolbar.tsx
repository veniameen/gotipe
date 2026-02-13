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
    const state = editor.getViewState();
    const idx = state.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    editor.dispatch({
      steps: [{
        type: "insertBlock",
        parentId: null,
        index: idx + 1,
        block: {
          id: crypto.randomUUID(),
          type: "paragraph",
          attrs: {},
          content: [],
          children: [],
        },
      }],
    });
  }, [editor, blockId]);

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
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <line x1="7" y1="2" x2="7" y2="12" />
          <line x1="2" y1="7" x2="12" y2="7" />
        </svg>
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
