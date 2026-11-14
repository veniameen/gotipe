"use client";

import { Icon } from "@/components/site/icon";
import { LINKS } from "@/components/site/links";
import { ThemeMenu } from "@/components/site/theme-menu";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface Drawer {
  open: boolean;
  setOpen: (open: boolean) => void;
  button: React.RefObject<HTMLButtonElement | null>;
}

const DrawerContext = createContext<Drawer | null>(null);
const useDrawer = () => {
  const drawer = useContext(DrawerContext);
  if (!drawer) throw new Error("NavButton and NavPanel need a DocsNav around them");
  return drawer;
};

/** The parts of the page behind an open drawer: out of reach of the pointer, keyboard and reader. */
const BEHIND = ".site-docs-head, .site-docs-main, .site-toc, .site-skip";

/** Holds whether the navigation drawer of tablets and phones is open. */
export function DocsNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <DrawerContext.Provider value={{ open, setOpen, button }}>{children}</DrawerContext.Provider>
  );
}

/** The menu button of the head on tablets and phones. */
export function NavButton() {
  const { open, setOpen, button } = useDrawer();
  return (
    <button
      ref={button}
      type="button"
      className="site-button is-quiet site-head-button is-icon site-menu-button"
      aria-label="Documentation menu"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="docs-nav"
      onClick={() => setOpen(true)}
    >
      <Icon name="menu" />
    </button>
  );
}

/**
 * The navigation, rendered once: the side column on wide screens and, opened from the menu
 * button, a modal drawer on tablets and phones — the page behind it inert, Escape and the scrim
 * close it, focus returns to the button. The drawer's head adds what the narrow head has no room
 * for: GitHub and the theme (Atlas frame 21).
 */
export function NavPanel({ children }: { children: ReactNode }) {
  const { open, setOpen, button } = useDrawer();
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const behind = Array.from(document.querySelectorAll<HTMLElement>(BEHIND));
    for (const part of behind) part.inert = true;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    element.querySelector<HTMLElement>(".site-drawer-close")?.focus();
    element.querySelector("[aria-current='page']")?.scrollIntoView({ block: "center" });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    // a wider window shows the side column again: the drawer has nothing left to hold
    const onResize = () => {
      if (button.current && getComputedStyle(button.current).display === "none") close();
    };
    // on the window, so it hears Escape after the theme menu inside has taken it for itself
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      for (const part of behind) part.inert = false;
      root.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (button.current && getComputedStyle(button.current).display !== "none")
        button.current.focus();
    };
  }, [open, close, button]);

  // the side column scrolls itself (not the page) to show the current page, on load and after a
  // move to another page
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    const element = panel.current;
    const current = element?.querySelector<HTMLElement>("[aria-current='page']");
    if (!element || !current || element.scrollHeight <= element.clientHeight) return;
    const box = element.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.top >= box.top && item.bottom <= box.bottom) return;
    element.scrollTop += item.top - box.top - (element.clientHeight - item.height) / 2;
  }, [pathname]);

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the scrim is for the pointer; Escape and the close button serve the keyboard */}
      {open && <div className="site-drawer-scrim" aria-hidden="true" onClick={close} />}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegation only notices a followed link, which the keyboard follows with a click too */}
      <div
        ref={panel}
        id="docs-nav"
        className="site-side"
        data-open={open || undefined}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Documentation" : undefined}
        onClick={(event) => {
          if (open && (event.target as Element).closest("a[href]")) close();
        }}
      >
        {open && (
          <div className="site-drawer-head">
            <span className="site-drawer-title">Documentation</span>
            <a
              className="site-button is-quiet site-head-button is-icon"
              href={LINKS.repo}
              aria-label="GitHub"
              title="GitHub"
            >
              <Icon name="external" />
            </a>
            <ThemeMenu />
            <button
              type="button"
              className="site-button is-quiet site-head-button is-icon site-drawer-close"
              aria-label="Close the menu"
              onClick={close}
            >
              <Icon name="x" />
            </button>
          </div>
        )}
        <nav aria-label="Documentation">{children}</nav>
      </div>
    </>
  );
}
