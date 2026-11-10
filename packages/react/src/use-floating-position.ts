import { type RefObject, useLayoutEffect, useState } from "react";
import {
  type AnchorRect,
  type FloatingPlacement,
  computeFloatingPosition,
} from "./floating-position";

export interface FloatingPositionOptions {
  open: boolean;
  anchor: () => AnchorRect | null;
  element: RefObject<HTMLElement | null>;
  placement?: FloatingPlacement;
  gap?: number;
  offsetX?: number;
  offsetY?: number;
  /** Invalidate geometry when a virtual anchor moves without a DOM resize. */
  revision?: unknown;
  /** DOM owner of a virtual anchor, including when the panel is rendered in a portal. */
  observe?: HTMLElement | null;
}

/** Measures before paint and follows scrolling, resizing and panel content changes. */
export function useFloatingPosition({
  open,
  anchor,
  element,
  placement = "bottom-start",
  gap = 6,
  offsetX = 0,
  offsetY = 0,
  revision,
  observe,
}: FloatingPositionOptions) {
  const [position, setPosition] = useState<ReturnType<typeof computeFloatingPosition> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates a virtual anchor whose DOM range changed without resizing.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    let frame: number | null = null;
    const update = () => {
      const panel = element.current;
      const rect = anchor();
      if (!panel || !rect) {
        setPosition(null);
        return;
      }
      const viewport = window.visualViewport;
      const bounds = {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
      };
      const next = computeFloatingPosition(
        rect,
        panel.getBoundingClientRect(),
        bounds,
        placement,
        gap,
        { x: offsetX, y: offsetY },
      );
      setPosition((prev) =>
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.maxWidth === next.maxWidth &&
        prev.maxHeight === next.maxHeight
          ? prev
          : next,
      );
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
    };
    update();
    // ResizeObserver runs before paint. Deferring it to the next frame exposes
    // one stale frame after the editor/container has already changed size.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (element.current) observer?.observe(element.current);
    // Container resizing can move the anchor without resizing the viewport.
    for (let parent = element.current?.parentElement; parent; parent = parent.parentElement) {
      observer?.observe(parent);
    }
    for (let parent = observe; parent; parent = parent.parentElement) {
      observer?.observe(parent);
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open, anchor, element, placement, gap, offsetX, offsetY, revision, observe]);

  return position ? { ...position, boxSizing: "border-box" as const } : null;
}
