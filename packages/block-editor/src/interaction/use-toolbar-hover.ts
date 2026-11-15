import { useCallback, useEffect, useRef, useState } from "react";

/** How long the block toolbar stays after the pointer leaves its block, in ms. */
const TOOLBAR_HIDE_DELAY_MS = 20;

/** The blocks the floating toolbar serves: its actions, anchor, insert point and drag. */
export interface ToolbarTarget {
  actionBlockId: string;
  anchorBlockId: string;
  addBlockId: string;
  dragBlockId: string;
}

/** Where the floating toolbar stands. */
export interface ToolbarPosition {
  top: number;
  left: number;
  right: number | null;
}

/**
 * The floating block toolbar's target and position, with a short delayed hide so the pointer
 * can cross from the block to the toolbar without closing it.
 */
export function useToolbarHover() {
  const [target, setTarget] = useState<ToolbarTarget | null>(null);
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const hideNow = useCallback(() => {
    setTarget(null);
    setPosition(null);
  }, []);
  const scheduleHide = useCallback(() => {
    cancelHide();
    timer.current = setTimeout(() => {
      timer.current = null;
      hideNow();
    }, TOOLBAR_HIDE_DELAY_MS);
  }, [cancelHide, hideNow]);
  useEffect(() => () => cancelHide(), [cancelHide]);
  return { target, setTarget, position, setPosition, cancelHide, hideNow, scheduleHide };
}
