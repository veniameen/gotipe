import { createContext, useContext } from "react";

/**
 * Element that floating UI (menus, cards, cursors) portals into. It lives
 * inside the page editor root, so the `--gt-*` tokens set on the root (or on
 * an ancestor) apply to menus too.
 */
export const PageOverlayContext = createContext<HTMLElement | null>(null);

export function usePageOverlay(): HTMLElement | null {
  const el = useContext(PageOverlayContext);
  if (el) return el;
  return typeof document !== "undefined" ? document.body : null;
}
