import type { GoTipeEditor } from "@gotipe/core";
import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";

/** Pointer resizing is bounded by the image's actual container, including narrow columns. */
export function useImageResize(
  editor: GoTipeEditor,
  blockId: string,
  imageRef: RefObject<HTMLImageElement | null>,
  shellRef: RefObject<HTMLDivElement | null>,
  readOnly: boolean,
) {
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const drag = useRef<{
    x: number;
    width: number;
    direction: number;
    draft: number;
    pointerId: number;
  } | null>(null);
  useEffect(() => {
    if (readOnly) {
      drag.current = null;
      setDraftWidth(null);
    }
  }, [readOnly]);
  const getMaxWidth = useCallback(() => {
    const shell = shellRef.current;
    const parent = shell?.parentElement;
    const content = shell?.closest<HTMLElement>("[data-gotipe-content]");
    const available = [parent?.clientWidth, content?.clientWidth, window.innerWidth - 24].filter(
      (width): width is number => typeof width === "number" && width > 0,
    );
    return Math.max(1, Math.min(...available));
  }, [shellRef]);
  const setWidth = useCallback(
    (width: number | null) => {
      if (readOnly || !editor.isEditable || editor.isDestroyed) return;
      editor.chain().setBlockAttrs(blockId, { width, height: null }).run();
      setDraftWidth(null);
    },
    [editor, blockId, readOnly],
  );
  const reset = useCallback(() => setWidth(getMaxWidth()), [setWidth, getMaxWidth]);
  const original = useCallback(() => {
    const image = imageRef.current;
    if (image) setWidth(Math.round(Math.min(image.naturalWidth || image.width, getMaxWidth())));
  }, [imageRef, getMaxWidth, setWidth]);
  const nudge = useCallback(
    (delta: number) => {
      const current = imageRef.current?.getBoundingClientRect().width;
      if (current)
        setWidth(Math.max(Math.min(80, getMaxWidth()), Math.min(getMaxWidth(), current + delta)));
    },
    [imageRef, getMaxWidth, setWidth],
  );
  const start = useCallback(
    (event: PointerEvent, side: "left" | "right") => {
      if (readOnly || !editor.isEditable || event.button !== 0) return;
      const image = imageRef.current;
      if (!image) return;
      event.preventDefault();
      event.stopPropagation();
      const width = Math.min(image.getBoundingClientRect().width, getMaxWidth());
      drag.current = {
        x: event.clientX,
        width,
        direction: side === "left" ? -1 : 1,
        draft: width,
        pointerId: event.pointerId,
      };
      setDraftWidth(width);
    },
    [editor, imageRef, getMaxWidth, readOnly],
  );

  const isResizing = draftWidth !== null;
  useEffect(() => {
    if (!isResizing) return;
    const move = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const max = getMaxWidth();
      current.draft = Math.round(
        Math.max(
          Math.min(80, max),
          Math.min(max, current.width + (event.clientX - current.x) * current.direction),
        ),
      );
      setDraftWidth(current.draft);
    };
    const finish = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointerId !== event.pointerId) return;
      const width = drag.current.draft;
      drag.current = null;
      setDraftWidth(null);
      setWidth(width);
    };
    const cancel = () => {
      drag.current = null;
      setDraftWidth(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, [isResizing, getMaxWidth, setWidth]);
  return { draftWidth, isResizing, start, reset, original, nudge };
}
