import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { LINKS } from "./links";

function FootLink({ href, children }: { href: string; children: ReactNode }) {
  return href.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href}>{children}</a>;
}

/** The foot of every page (Atlas frame 20): the mark, three columns of links, the base line. */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-wrap">
        <div className="site-foot-grid">
          <div>
            <Link className="site-brand is-large" href={LINKS.home}>
              <Icon name="logo" className="site-logo" />
              GoTipe
            </Link>
            <p>A document editor framework with its own engine. TypeScript and Rust/WASM.</p>
          </div>
          <nav aria-labelledby="site-foot-product">
            <h2 id="site-foot-product">Product</h2>
            <FootLink href={LINKS.docs}>Docs</FootLink>
            {LINKS.playground && <FootLink href={LINKS.playground}>Playground</FootLink>}
            <FootLink href={LINKS.licensing}>Licensing</FootLink>
            <FootLink href={LINKS.changelog}>Changelog</FootLink>
          </nav>
          <nav aria-labelledby="site-foot-resources">
            <h2 id="site-foot-resources">Resources</h2>
            <FootLink href={LINKS.quickStart}>Quick start</FootLink>
            <FootLink href={LINKS.security}>Security</FootLink>
            <FootLink href={LINKS.browsers}>Browser support</FootLink>
          </nav>
          <nav aria-labelledby="site-foot-project">
            <h2 id="site-foot-project">Project</h2>
            <FootLink href={LINKS.repo}>GitHub</FootLink>
            <FootLink href={LINKS.npm}>npm</FootLink>
            <FootLink href={LINKS.contributing}>Contributing</FootLink>
            <FootLink href={LINKS.vulnerability}>Report a vulnerability</FootLink>
          </nav>
        </div>
        <p className="site-foot-base">
          <span>© 2026 GoTipe contributors · MIT and commercial licences</span>
          <span className="site-mono">0.1</span>
        </p>
      </div>
    </footer>
  );
}
