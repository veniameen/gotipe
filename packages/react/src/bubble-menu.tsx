import type { GoTipeEditor } from "@gotipe/core";
import type { ViewState } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FloatingPortal } from "./floating-portal";
import { useGoTipeI18n } from "./i18n-context";
import { useFloatingPosition } from "./use-floating-position";

export interface BubbleMenuProps {
  editor: GoTipeEditor;
  shouldShow?: (props: { editor: GoTipeEditor; state: ViewState }) => boolean;
  offset?: { x: number; y: number };
  children: React.ReactNode | ((props: { editor: GoTipeEditor }) => React.ReactNode);
  className?: string;
  /**
   * Accessible name of the toolbar. By default `a11y.toolbarLabel` of `GoTipeI18nProvider`:
   * "Text formatting" in English and without a provider.
   */
  ariaLabel?: string;
}

export function BubbleMenu({
  editor,
  shouldShow,
  offset,
  children,
  className,
  ariaLabel,
}: BubbleMenuProps) {
  const i18n = useGoTipeI18n();
  const [visible, setVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const shouldShowRef = useRef(shouldShow);
  shouldShowRef.current = shouldShow;
  const [revision, setTick] = useState(0);

  const anchor = useCallback(() => {
    const rect = rangeRef.current?.getBoundingClientRect();
    return rect && (rect.width > 0 || rect.height > 0) ? rect : null;
  }, []);
  const position = useFloatingPosition({
    open: visible,
    anchor,
    element: menuRef,
    placement: "top",
    gap: 8,
    offsetX: offset?.x,
    offsetY: offset?.y,
    revision,
    observe: editor.element,
  });

  useEffect(() => {
    const checkVisibility = () => {
      const state = editor.getViewState();
      const sel = state.selection;
      const show =
        editor.isEditable &&
        (shouldShowRef.current
          ? shouldShowRef.current({ editor, state })
          : sel.type === "text" &&
            (sel.anchor.blockId !== sel.head.blockId || sel.anchor.offset !== sel.head.offset));

      const selection = window.getSelection();
      const ownsSelection =
        selection?.rangeCount &&
        !selection.isCollapsed &&
        editor.element?.contains(selection.anchorNode) &&
        editor.element.contains(selection.focusNode);
      const interacting = menuRef.current?.contains(document.activeElement);
      if (show && ownsSelection && selection) {
        rangeRef.current = selection.getRangeAt(0).cloneRange();
      }
      const active = !!(show && (ownsSelection || (interacting && rangeRef.current)));
      if (!active) rangeRef.current = null;

      setVisible(active);
      // A DOM range can be replaced after a mark render without changing the
      // model selection. Its new geometry still invalidates the virtual anchor.
      setTick((value) => value + 1);
    };

    const unsubSelection = editor.on("selectionChange", () => {
      checkVisibility();
    });

    // Re-render on state changes so mark active states update
    const unsubState = editor.on("viewStateChange", () => {
      checkVisibility();
    });
    const unsubEditable = editor.on("editableChange", checkVisibility);
    document.addEventListener("selectionchange", checkVisibility);
    checkVisibility();

    return () => {
      unsubSelection();
      unsubState();
      unsubEditable();
      document.removeEventListener("selectionchange", checkVisibility);
    };
  }, [editor]);

  // Prevent selection loss when interacting with the menu
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) {
      e.preventDefault();
      return;
    }
    // Native controls (especially <select>) need default mouse handling to open.
    if (target.closest("select, option, input, textarea")) return;
    e.preventDefault();
  }, []);

  if (!visible) return null;

  return (
    <FloatingPortal owner={editor.element}>
      <div
        ref={menuRef}
        className={className ? `gotipe-bubble-menu ${className}` : "gotipe-bubble-menu"}
        role="toolbar"
        aria-label={ariaLabel ?? i18n.t("a11y.toolbarLabel")}
        data-gotipe-bubble-menu=""
        onMouseDown={handleMouseDown}
        style={{
          position: "fixed",
          ...position,
          visibility: position ? "visible" : "hidden",
          overflow: "visible",
          flexWrap: "wrap",
          animation: "none",
          zIndex: 40,
        }}
      >
        {typeof children === "function" ? children({ editor }) : children}
      </div>
    </FloatingPortal>
  );
}
