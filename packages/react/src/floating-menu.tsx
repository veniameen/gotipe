import type { GoTipeEditor } from "@gotipe/core";
import type { ViewState } from "@gotipe/core";
import type React from "react";
import { useEffect, useState } from "react";

export interface FloatingMenuProps {
  editor: GoTipeEditor;
  shouldShow?: (props: { editor: GoTipeEditor; state: ViewState }) => boolean;
  children: React.ReactNode | ((props: { editor: GoTipeEditor }) => React.ReactNode);
}

export function FloatingMenu({ editor, shouldShow, children }: FloatingMenuProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const unsub = editor.on("selectionChange", () => {
      const state = editor.getViewState();
      const currentBlock = state.blocks.find((b) => b.id === state.selection.anchor.blockId);
      const isEmpty =
        currentBlock?.type === "paragraph" &&
        (currentBlock.content === null ||
          (Array.isArray(currentBlock.content) && currentBlock.content.length === 0) ||
          (Array.isArray(currentBlock.content) &&
            currentBlock.content.every((s) => s.text === "")));

      const show = shouldShow ? shouldShow({ editor, state }) : !!isEmpty;

      setVisible(show);
      if (show) {
        const blockEl = document.querySelector(
          `[data-block-id="${state.selection.anchor.blockId}"]`,
        );
        if (blockEl) {
          const rect = blockEl.getBoundingClientRect();
          setPosition({ top: rect.top, left: rect.left - 40 });
        }
      }
    });
    return unsub;
  }, [editor, shouldShow]);

  if (!visible) return null;

  return (
    <div
      className="gotipe-floating-menu"
      role="toolbar"
      aria-label="Insert block"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 30,
      }}
    >
      {typeof children === "function" ? children({ editor }) : children}
    </div>
  );
}
