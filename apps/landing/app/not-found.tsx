import Link from "next/link";
import { Icon } from "../components/site/icon";
import { Catch, Lamp } from "../components/site/lamp";
import { LINKS } from "../components/site/links";
import { SiteFooter } from "../components/site/site-footer";
import { SiteHeader } from "../components/site/site-header";
import "../styles/landing/hero.css";

export const metadata = { title: "Page not found" };

/** A missing address: the first stage with the way back. */
export default function NotFound() {
  return (
    <div className="site site-landing">
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <section className="site-stage site-hero site-missing" aria-labelledby="site-missing-title">
          <div className="site-wrap">
            <p className="site-eyebrow">404</p>
            <h1 id="site-missing-title">
              <span className="site-ink">This page</span>
              <br />
              <span className="site-ink is-accent">is not here.</span>
            </h1>
            <p className="site-lede">
              The address may be old or mistyped. The documentation and the landing are one click
              away.
            </p>
            <div className="site-actions">
              <Link className="site-button site-cta" href={LINKS.docs} data-lamp>
                <Lamp />
                <span>Read the docs</span>
                <Icon name="arrow-right" />
              </Link>
              <Link className="site-button site-cta is-second" href={LINKS.home}>
                <Catch />
                Back to the start
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
