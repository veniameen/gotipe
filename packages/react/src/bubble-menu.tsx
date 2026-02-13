import type { GoTipeEditor } from "@gotipe/core";
import type { ViewState } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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
  const [, setTick] = useState(0);

  const updatePosition = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const menuWidth = menuRef.current?.offsetWidth ?? 0;
    const menuHeight = menuRef.current?.offsetHeight ?? 0;

    let top = rect.top - menuHeight - 8 + (offset?.y ?? 0);
    let left = rect.left + rect.width / 2 - menuWidth / 2 + (offset?.x ?? 0);

    // Edge detection: flip below if too close to top
    if (top < 8) {
      top = rect.bottom + 8 + (offset?.y ?? 0);
    }
    // Clamp horizontal
    if (left < 8) left = 8;
    if (menuWidth > 0 && left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    setPosition({ top, left });
  }, [offset]);

  useEffect(() => {
    const checkVisibility = () => {
      const state = editor.getViewState();
      const sel = state.selection;
      const show = shouldShow
        ? shouldShow({ editor, state })
        : sel.type === "text" &&
          (sel.anchor.blockId !== sel.head.blockId ||
            sel.anchor.offset !== sel.head.offset);

      setVisible(show);
      if (show) {
        updatePosition();
      }
    };

    const unsubSelection = editor.on("selectionChange", checkVisibility);

    // Re-render on state changes so mark active states update
    const unsubState = editor.on("viewStateChange", () => {
      setTick((c) => c + 1);
    });

    return () => {
      unsubSelection();
      unsubState();
    };
  }, [editor, shouldShow, updatePosition]);

  // Recalculate position after menu mounts (first render has no ref dimensions)
  useLayoutEffect(() => {
    if (visible && menuRef.current) {
      updatePosition();
    }
  }, [visible, updatePosition]);

  // Prevent selection loss when interacting with the menu
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="gotipe-bubble-menu"
      role="toolbar"
      aria-label="Text formatting"
      data-gotipe-bubble-menu=""
      onMouseDown={handleMouseDown}
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
