import { Closing } from "../components/landing/closing";
import { Features } from "../components/landing/features";
import { Hero } from "../components/landing/hero";
import { Licences } from "../components/landing/licences";
import { Looks } from "../components/landing/looks";
import { QuickStart } from "../components/landing/quick-start";
import { Run } from "../components/landing/run";
import { Signature } from "../components/landing/signature";
import { SiteFooter } from "../components/site/site-footer";
import { SiteHeader } from "../components/site/site-header";
import "../styles/landing/hero.css";
import "../styles/landing/window.css";
import "../styles/landing/sections.css";
import "../styles/landing/closing.css";
import "../styles/landing/live.css";

/** The landing (Atlas frame 20), section by section. */
export default function Home() {
  return (
    <div className="site site-landing">
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Signature />
        <Features />
        <section className="site-stage is-grey" aria-labelledby="site-looks-title">
          <div className="site-wrap">
            <Looks />
          </div>
        </section>
        <QuickStart />
        <Run />
        <Licences />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  );
}
