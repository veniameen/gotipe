import type { GoTipeEditor } from "@gotipe/core";
import type { ViewState } from "@gotipe/core";
import type React from "react";
import { useEffect, useRef, useState } from "react";

export interface BubbleMenuProps {
  editor: GoTipeEditor;
  shouldShow?: (props: { editor: GoTipeEditor; state: ViewState }) => boolean;
  offset?: { x: number; y: number };
  children: React.ReactNode | ((props: { editor: GoTipeEditor }) => React.ReactNode);
}

export function BubbleMenu({ editor, shouldShow, offset, children }: BubbleMenuProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = editor.on("selectionChange", () => {
      const state = editor.getViewState();
      const show = shouldShow
        ? shouldShow({ editor, state })
        : state.selection.type === "text" &&
          state.selection.anchor.offset !== state.selection.head.offset;

      setVisible(show);
      if (show) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          setPosition({
            top: rect.top - (menuRef.current?.offsetHeight ?? 0) - 8 + (offset?.y ?? 0),
            left:
              rect.left +
              rect.width / 2 -
              (menuRef.current?.offsetWidth ?? 0) / 2 +
              (offset?.x ?? 0),
          });
        }
      }
    });
    return unsub;
  }, [editor, shouldShow, offset]);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="gotipe-bubble-menu"
      role="toolbar"
      aria-label="Text formatting"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 40,
      }}
    >
      {typeof children === "function" ? children({ editor }) : children}
    </div>
  );
}
