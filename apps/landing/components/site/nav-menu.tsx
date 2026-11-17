"use client";

import Link from "next/link";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./icon";
import { LINKS, type NavLink } from "./links";
import { useDismiss } from "./use-dismiss";
import { useThemeToggle } from "./use-theme-toggle";

/**
 * The menu button of narrow screens (the Atlas folds the navigation behind it below 1024 px):
 * a disclosure with the head's links, GitHub and the theme as one switch, which the phone head has
 * no room for.
 */
export function NavMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const { dark, toggle } = useThemeToggle();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const parts = useMemo(() => [button, panel], []);
  const panelId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }, []);
  useDismiss(open, parts, close);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="site-button is-quiet site-head-button is-icon site-menu-button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? "x" : "menu"} />
      </button>
      <div ref={panel} id={panelId} className="site-menu site-nav-menu" hidden={!open}>
        <nav aria-label="Site, compact">
          {links.map((link) =>
            link.external ? (
              <a key={link.href} className="site-menu-item" href={link.href}>
                {link.label}
                <Icon name="external" />
              </a>
            ) : (
              <Link
                key={link.href}
                className="site-menu-item"
                href={link.href}
                onClick={() => close(false)}
              >
                {link.label}
              </Link>
            ),
          )}
          <a className="site-menu-item" href={LINKS.repo}>
            GitHub
            <Icon name="external" />
          </a>
        </nav>
        <div className="site-menu-switch">
          <button
            type="button"
            className="site-menu-item"
            aria-pressed={dark ?? undefined}
            onClick={(event) => toggle(event.currentTarget)}
          >
            Dark theme
            <span className="site-switch" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
