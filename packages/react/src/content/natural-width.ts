import { type RefObject, useEffect, useState } from "react";

/**
 * Whether a shown image has no natural width of its own: an SVG without `width` and `height`.
 * The image's shell shrinks to its picture, so such an image is drawn 0 px wide (D-86), and
 * Chromium still reports a `naturalWidth` of 300 for it. It is found by its laid-out width
 * instead: loaded, in a column that has a width, and 0 px wide. Until `key` (its source) changes
 * the image fills the column (`data-natural-width="none"`, theme `media.css`).
 */
export function useMissingNaturalWidth(
  image: RefObject<HTMLImageElement | null>,
  key: string | null,
): boolean {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
    const element = image.current;
    if (!element || key === null) return;
    const column = element.closest("figure") ?? element.parentElement;
    const check = () => {
      if (!element.isConnected || !element.complete || !element.currentSrc) return;
      // a hidden tab or a collapsed panel has no layout yet: decide once it has one
      if (!column || column.clientWidth === 0) return;
      if (element.getBoundingClientRect().width === 0) setMissing(true);
    };
    element.addEventListener("load", check);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    if (column) observer?.observe(column);
    check();
    return () => {
      element.removeEventListener("load", check);
      observer?.disconnect();
    };
  }, [image, key]);
  return missing;
}
