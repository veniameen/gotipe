import type { GoTipeEditor } from "@gotipe/core";
import type { DragEvent as ReactDragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DropTarget,
  LIST_ITEM_TYPES,
  findBlockLocation,
  getBlockElById,
  getBlockFirstLineMetrics,
  getChildBlockEls,
  getDropIndexForParent,
  getRowAnchorBlockIdAtPoint,
  getTopLevelAncestorBlockId,
  moveDraggedBlock,
  resolveListRowDropTarget,
} from "../components/block-interaction";
import { type DragPoint, useTouchDrag } from "../interaction/use-touch-drag";

interface HoveredBlock {
  id: string;
  dragId: string;
  top: number;
  left: number;
  handleTop: number;
}

interface DropIndicator {
  top: number;
  left: number;
  width: number;
}

/** Page UI uses the same row hit-testing and move transactions as BlockEditor. */
export function usePageBlockHandle(
  editor: GoTipeEditor,
  root: HTMLElement | null,
  menuOpen: boolean,
) {
  const [hover, setHover] = useState<HoveredBlock | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [editable, setEditable] = useState(editor.isEditable);
  const handleRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef<{ id: string; element: HTMLElement } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const endDrag = useCallback(() => {
    dragging.current?.element.classList.remove("gotipe-page-block-dragging");
    dragging.current = null;
    setIndicator(null);
    setHover(null);
  }, []);

  const startDrag = useCallback(
    (id: string) => {
      const element = root && getBlockElById(root, id);
      if (!editor.isEditable || editor.isDestroyed || !element) return false;
      dragging.current = { id, element };
      element.classList.add("gotipe-page-block-dragging");
      return true;
    },
    [editor, root],
  );
  const targetAt = useCallback(
    (point: DragPoint): DropTarget | null => {
      const active = dragging.current;
      if (!root || !active || !editor.isEditable || editor.isDestroyed) return null;
      const rect = root.getBoundingClientRect();
      if (
        point.x < rect.left ||
        point.x > rect.right ||
        point.y < Math.max(0, rect.top) ||
        point.y > Math.min(window.innerHeight, rect.bottom)
      )
        return null;
      const blocks = editor.getViewState().blocks;
      const location = findBlockLocation(blocks, active.id);
      if (!location) return null;
      return LIST_ITEM_TYPES.has(location.blockType)
        ? resolveListRowDropTarget(root, blocks, location.blockType, point.x, point.y)
        : { parentId: null, index: getDropIndexForParent(root, null, point.y) };
    },
    [editor, root],
  );
  const showDropTarget = useCallback(
    (point: DragPoint) => {
      const target = targetAt(point);
      if (!target || !root) {
        setIndicator(null);
        return null;
      }
      const elements = getChildBlockEls(root, target.parentId);
      const content = target.parentId
        ? getBlockElById(root, target.parentId)
        : root.querySelector<HTMLElement>("[data-gotipe-content]");
      if (!content || !elements.length) {
        setIndicator(null);
        return target;
      }
      const column = content.getBoundingClientRect();
      const previous = elements[target.index - 1];
      const top = previous
        ? previous.getBoundingClientRect().bottom
        : elements[0]!.getBoundingClientRect().top;
      setIndicator({ top, left: column.left, width: column.width });
      return target;
    },
    [root, targetAt],
  );
  const dropAt = useCallback(
    (point: DragPoint) => {
      const target = targetAt(point);
      if (target && dragging.current) {
        moveDraggedBlock(editor, dragging.current.id, target);
        editor.focus();
      }
    },
    [editor, targetAt],
  );
  const touchDrag = useTouchDrag({
    enabled: editable,
    root: () => (editor.isDestroyed ? null : root),
    start: startDrag,
    move: showDropTarget,
    drop: dropAt,
    end: endDrag,
  });

  useEffect(() => {
    setEditable(editor.isEditable);
    return editor.on("editableChange", (value) => {
      setEditable(value);
      if (!value) endDrag();
    });
  }, [editor, endDrag]);

  useEffect(() => {
    if (!root) return;
    let layoutFrame: number | null = null;

    const showHoveredBlock = () => {
      if (!editor.isEditable || menuOpen || dragging.current || !pointer.current) return;
      const { x, y } = pointer.current;
      const content = root.querySelector<HTMLElement>("[data-gotipe-content]");
      if (!content) return;
      const rect = content.getBoundingClientRect();
      if (x < rect.left - 48 || x > rect.right + 8 || y < rect.top || y > rect.bottom) {
        setHover(null);
        return;
      }
      const anchorId = getRowAnchorBlockIdAtPoint(root, x, y);
      const id = anchorId && getTopLevelAncestorBlockId(root, anchorId);
      const anchor = anchorId && getBlockElById(root, anchorId);
      if (!id || !anchor || !findBlockLocation(editor.getViewState().blocks, id)) {
        setHover(null);
        return;
      }
      const dragId = LIST_ITEM_TYPES.has(anchor.getAttribute("data-block-type") ?? "")
        ? anchorId!
        : id;
      const line = getBlockFirstLineMetrics(anchor);
      const next = {
        id,
        dragId,
        top: anchor.getBoundingClientRect().top,
        left: rect.left,
        handleTop: line.top + (line.height - 22) / 2,
      };
      setHover((prev) =>
        prev &&
        prev.id === next.id &&
        prev.dragId === next.dragId &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.handleTop === next.handleTop
          ? prev
          : next,
      );
    };

    const onMove = (event: MouseEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      // Keep the target stable while crossing onto the six-dot button.
      if (event.target instanceof Node && handleRef.current?.contains(event.target)) return;
      showHoveredBlock();
    };
    const onLeave = (event: MouseEvent) => {
      if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
      pointer.current = null;
      if (!dragging.current && !menuOpen) setHover(null);
    };

    const onDragOver = (event: DragEvent) => {
      if (!showDropTarget({ x: event.clientX, y: event.clientY })) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    const onDrop = (event: DragEvent) => {
      if (!dragging.current) return;
      event.preventDefault();
      event.stopPropagation();
      dropAt({ x: event.clientX, y: event.clientY });
      endDrag();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) {
        setIndicator(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dragging.current) endDrag();
    };
    const onViewportChange = () => {
      if (dragging.current) setIndicator(null);
      else showHoveredBlock();
    };
    const onDocumentChange = () => {
      // Selection and animated review decorations also publish viewStateChange.
      // Keep the button mounted and refresh after React has laid out the blocks.
      if (layoutFrame !== null) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null;
        showHoveredBlock();
      });
    };
    const unsubscribe = editor.on("viewStateChange", onDocumentChange);
    const observer = new ResizeObserver(onViewportChange);
    observer.observe(root);
    const content = root.querySelector<HTMLElement>("[data-gotipe-content]");
    if (content) observer.observe(content);
    root.addEventListener("mousemove", onMove);
    root.addEventListener("pointerdown", onMove);
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("dragover", onDragOver, true);
    root.addEventListener("drop", onDrop, true);
    root.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragend", endDrag);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      unsubscribe();
      observer.disconnect();
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("pointerdown", onMove);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("dragover", onDragOver, true);
      root.removeEventListener("drop", onDrop, true);
      root.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragend", endDrag);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      dragging.current?.element.classList.remove("gotipe-page-block-dragging");
      dragging.current = null;
    };
  }, [editor, root, menuOpen, endDrag, showDropTarget, dropAt]);

  const onDragStart = useCallback(
    (event: ReactDragEvent<HTMLButtonElement>) => {
      const id = hover && (event.altKey ? hover.id : hover.dragId);
      if (!id || !startDrag(id)) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData("text/gotipe-block-id", id!);
      event.dataTransfer.effectAllowed = "move";
    },
    [startDrag, hover],
  );

  return {
    hover,
    setHover,
    indicator,
    editable,
    handleRef,
    onDragStart,
    onDragEnd: endDrag,
    touchDrag,
  };
}
