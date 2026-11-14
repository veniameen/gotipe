"use client";

import { type RefObject, useEffect } from "react";

/**
 * Closes an open popup on Escape, a pointer outside its parts or the focus moving outside them
 * (Tab past the last item). Escape hands the focus back to the control that opened it; otherwise
 * the focus stays where the pointer or the keyboard put it.
 */
export function useDismiss(
  open: boolean,
  parts: RefObject<HTMLElement | null>[],
  close: (returnFocus: boolean) => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (parts.some((part) => part.current?.contains(target))) return;
      close(false);
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (parts.some((part) => part.current?.contains(target))) return;
      close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, parts, close]);
}
