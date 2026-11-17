import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { Lamp } from "./lamp";
import { LINKS, primaryNav } from "./links";
import { NavMenu } from "./nav-menu";
import { ThemeToggle } from "./theme-toggle";

/**
 * The mark, linking home. The docs head does not prefetch the landing: a docs reader rarely goes
 * there, and the prefetch would preload the landing's CSS on every docs page.
 */
function Brand({ docs = false }: { docs?: boolean }) {
  return (
    <Link className="site-brand" href={LINKS.home} prefetch={docs ? false : undefined}>
      <Icon name="logo" className="site-logo" />
      GoTipe{docs && <small>Docs</small>}
    </Link>
  );
}

function GitHubLink() {
  return (
    <a className="site-button is-quiet site-head-button is-wide" href={LINKS.repo}>
      GitHub
      <Icon name="external" />
    </a>
  );
}

/**
 * The landing's head (Atlas frame 20): a bar in the frame, clear over the first stage and glass
 * once the page scrolls (`data-scrolled` on the head, motion/controller.tsx). The mark, the links in the
 * middle and the actions stand on one middle line.
 */
export function SiteHeader() {
  const links = primaryNav();
  return (
    <header className="site-head">
      <div className="site-head-in">
        <Brand />
        <nav className="site-nav" aria-label="Site">
          {links.map((link) =>
            link.external ? (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ) : (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <div className="site-head-end">
          <GitHubLink />
          <ThemeToggle className="is-wide" />
          <Link className="site-button site-cta site-head-button" href={LINKS.docs} data-lamp>
            <Lamp />
            <span>Get started</span>
            <Icon name="arrow-right" />
          </Link>
          <NavMenu links={links} />
        </div>
      </div>
    </header>
  );
}

export interface DocsHeaderProps {
  /** The search field of wide screens (the docs pages own search). */
  search?: ReactNode;
  /** The search icon button of phones (`site-search-button`). */
  searchButton?: ReactNode;
  /**
   * The menu button of narrow screens. The docs pages pass the button that opens their
   * navigation; without it the head shows the site's own menu of links.
   */
  menu?: ReactNode;
}

/**
 * The documentation's head (Atlas frame 21): a sticky bar with the version and search. It stands
 * on the columns of the page: the search field starts where the page does.
 */
export function DocsHeader({ search, searchButton, menu }: DocsHeaderProps) {
  const links = primaryNav();
  return (
    <header className="site-docs-head">
      <div className="site-docs-head-in">
        <div className="site-docs-brand">
          <Brand docs />
          <span className="site-version">v0.1</span>
        </div>
        {search}
        <div className="site-head-end">
          {LINKS.playground && (
            <a className="site-button is-quiet site-head-button is-wide" href={LINKS.playground}>
              Playground
            </a>
          )}
          <GitHubLink />
          <ThemeToggle className="is-wide" />
          {searchButton}
          {menu ?? <NavMenu links={links} />}
        </div>
      </div>
    </header>
  );
}
