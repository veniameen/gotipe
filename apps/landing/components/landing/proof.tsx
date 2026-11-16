import { FACTS } from "./facts";

/**
 * Facts that can be checked, under the first stage (Atlas frame 20): numbers from the test suite
 * and the build. They count up once as they come into view; the HTML holds the final figures.
 */
export function Proof() {
  return (
    <section className="site-section site-facts-section" aria-label="Shipped in 0.1">
      <div className="site-wrap" data-reveal>
        <div className="site-facts-head">
          <span>Shipped in 0.1</span>
          <span>Numbers from the test suite and the build.</span>
        </div>
        <div className="site-facts">
          <p className="site-fact">
            <strong data-count>{FACTS.BROWSER_SCENARIOS}</strong>browser scenarios in Chromium,
            Firefox and WebKit
          </p>
          <p className="site-fact">
            <strong data-count>{FACTS.COMMONMARK}</strong>CommonMark examples parsed like the
            reference
          </p>
          <p className="site-fact">
            <strong data-count>{FACTS.JS_ENGINE_GZIP}</strong>gzip for the JavaScript engine with
            Markdown
          </p>
          <p className="site-fact">
            <strong className="site-accent">0</strong>third-party runtime dependencies in the engine
          </p>
        </div>
      </div>
    </section>
  );
}
