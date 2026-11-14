import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { LINKS, primaryNav } from "./links";
import { NavMenu } from "./nav-menu";
import { ThemeMenu } from "./theme-menu";

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

/** The landing's head: a pill floating over the first stage (Atlas frame 20). */
export function SiteHeader() {
  const links = primaryNav();
  return (
    <header className="site-head">
      <div className="site-head-in">
        <div className="site-head-start">
          <Brand />
        </div>
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
          <ThemeMenu className="is-wide" />
          <Link className="site-button is-primary site-head-button" href={LINKS.docs}>
            Get started
            <Icon name="arrow-up-right" />
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

/** The documentation's head: a sticky bar with the version and search (Atlas frame 21). */
export function DocsHeader({ search, searchButton, menu }: DocsHeaderProps) {
  const links = primaryNav();
  return (
    <header className="site-docs-head">
      <div className="site-docs-head-in">
        <Brand docs />
        <span className="site-version">v0.1</span>
        {search}
        <div className="site-head-end">
          {LINKS.playground && (
            <a className="site-button is-quiet site-head-button is-wide" href={LINKS.playground}>
              Playground
            </a>
          )}
          <GitHubLink />
          <ThemeMenu className="is-wide" />
          {searchButton}
          {menu ?? <NavMenu links={links} />}
        </div>
      </div>
    </header>
  );
}
