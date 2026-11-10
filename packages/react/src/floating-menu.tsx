import type { BlockView, GoTipeEditor, ViewState } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFloatingPosition } from "./use-floating-position";

export interface FloatingMenuProps {
  editor: GoTipeEditor;
  shouldShow?: (props: { editor: GoTipeEditor; state: ViewState }) => boolean;
  children: React.ReactNode | ((props: { editor: GoTipeEditor }) => React.ReactNode);
}

function findBlock(blocks: BlockView[], id: string): BlockView | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = findBlock(block.children, id);
    if (nested) return nested;
  }
}

/** An insert toolbar anchored to the active empty paragraph, including nested blocks. */
export function FloatingMenu({ editor, shouldShow, children }: FloatingMenuProps) {
  const [visible, setVisible] = useState(false);
  const [revision, setRevision] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const predicate = useRef(shouldShow);
  predicate.current = shouldShow;
  const anchor = useCallback(() => {
    const id = editor.getViewState().selection.anchor.blockId;
    return (
      editor.element
        ?.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
        ?.getBoundingClientRect() ?? null
    );
  }, [editor]);
  const position = useFloatingPosition({
    open: visible,
    anchor,
    element: panel,
    placement: "left-start",
    revision,
  });

  useEffect(() => {
    const update = () => {
      const state = editor.getViewState();
      const block = findBlock(state.blocks, state.selection.anchor.blockId);
      const collapsed =
        state.selection.type === "text" &&
        state.selection.anchor.blockId === state.selection.head.blockId &&
        state.selection.anchor.offset === state.selection.head.offset;
      const empty =
        block?.type === "paragraph" &&
        (block.content === null ||
          (Array.isArray(block.content) && block.content.every((span) => !span.text)));
      const focused =
        editor.element?.contains(document.activeElement) ||
        panel.current?.contains(document.activeElement);
      setVisible(
        !!(
          editor.isEditable &&
          focused &&
          (predicate.current ? predicate.current({ editor, state }) : collapsed && empty)
        ),
      );
      setRevision((value) => value + 1);
    };
    const unsubscribe = (
      ["selectionChange", "viewStateChange", "editableChange", "focus", "blur"] as const
    ).map((event) => editor.on(event, update));
    document.addEventListener("focusin", update);
    update();
    return () => {
      for (const cleanup of unsubscribe) cleanup();
      document.removeEventListener("focusin", update);
    };
  }, [editor]);

  if (!visible) return null;
  return (
    <div
      ref={panel}
      className="gotipe-floating-menu"
      role="toolbar"
      aria-label="Insert block"
      onMouseDown={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        ...position,
        visibility: position ? "visible" : "hidden",
        overflow: "auto",
        zIndex: 30,
      }}
    >
      {typeof children === "function" ? children({ editor }) : children}
    </div>
  );
}
