import { Closing } from "../components/landing/closing";
import { Features } from "../components/landing/features";
import { Hero } from "../components/landing/hero";
import { Licences } from "../components/landing/licences";
import { Looks } from "../components/landing/looks";
import { MotionController } from "../components/landing/motion/controller";
import { Proof } from "../components/landing/proof";
import { QuickStart } from "../components/landing/quick-start";
import { Run } from "../components/landing/run";
import { Stack } from "../components/landing/stack";
import { SiteFooter } from "../components/site/site-footer";
import { SiteHeader } from "../components/site/site-header";
import "../styles/landing/hero.css";
import "../styles/landing/window.css";
import "../styles/landing/sections.css";
import "../styles/landing/closing.css";
import "../styles/landing/live.css";
import "../styles/landing/motion.css";

/** The landing (Atlas frame 20), section by section; the motion is one controller over them. */
export default function Home() {
  return (
    <div className="site site-landing">
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Proof />
        <Stack />
        <Features />
        <section className="site-stage is-alt" aria-labelledby="site-looks-title">
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
      <MotionController />
    </div>
  );
}
