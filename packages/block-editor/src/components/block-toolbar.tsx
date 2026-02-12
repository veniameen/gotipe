import type { GoTipeEditor } from "@gotipe/core";
import { useState } from "react";

export interface BlockToolbarProps {
  editor: GoTipeEditor;
}

export function BlockToolbar({ editor }: BlockToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="gotipe-block-toolbar" role="toolbar" aria-label="Block actions">
      <button
        type="button"
        className="gotipe-drag-handle-btn"
        aria-label="Drag to move block"
        draggable
        onDragStart={() => {
          /* start drag */
        }}
      >
        ⠿
      </button>
      <button
        type="button"
        aria-label="Add block below"
        onClick={() => editor.chain().insertBlockAfter("paragraph").run()}
      >
        +
      </button>
      <button type="button" aria-label="More actions" onClick={() => setMenuOpen(!menuOpen)}>
        ⋯
      </button>
      {menuOpen && (
        <div className="gotipe-block-more-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              editor.chain().duplicateBlock().run();
              setMenuOpen(false);
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              editor.chain().deleteBlock().run();
              setMenuOpen(false);
            }}
          >
            Delete
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              editor.chain().moveBlockUp().run();
              setMenuOpen(false);
            }}
          >
            Move up
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              editor.chain().moveBlockDown().run();
              setMenuOpen(false);
            }}
          >
            Move down
          </button>
        </div>
      )}
    </div>
  );
}
