import { Icon } from "../site/icon";
import { FACTS } from "./facts";
import { SignatureLive } from "./signature-live";

/** «Plain text. Rich possibilities.»: the live window, then facts that can be checked. */
export function Signature() {
  return (
    <section className="site-section is-signature" aria-labelledby="site-signature-title">
      <div className="site-wrap">
        <div className="site-title-row">
          <div>
            <p className="site-eyebrow">Made for the way you build</p>
            <h2 id="site-signature-title">Plain text. Rich possibilities.</h2>
          </div>
          <Icon name="arrow-down-right" className="site-icon site-title-arrow" />
        </div>

        <SignatureLive />
        <p className="site-plinth-note">
          Markdown source and the document it becomes. One model, nothing lost. Edit the document:
          the source follows.
        </p>

        <div className="site-facts-head">
          <span>Shipped in 0.1</span>
          <span>Numbers from the test suite and the build.</span>
        </div>
        <div className="site-facts">
          <p className="site-fact">
            <strong>{FACTS.BROWSER_SCENARIOS}</strong>browser scenarios in Chromium, Firefox and
            WebKit
          </p>
          <p className="site-fact">
            <strong>{FACTS.COMMONMARK}</strong>CommonMark examples parsed like the reference
          </p>
          <p className="site-fact">
            <strong>{FACTS.JS_ENGINE_GZIP}</strong>gzip for the JavaScript engine with Markdown
          </p>
          <p className="site-fact">
            <strong className="site-accent">0</strong>third-party runtime dependencies in the engine
          </p>
        </div>
      </div>
    </section>
  );
}
