import Link from "next/link";
import { Icon } from "../site/icon";
import { Catch, Lamp } from "../site/lamp";
import { LINKS } from "../site/links";
import { MantaMark } from "../site/logo";

/**
 * A document built on the engine: glass plates stacked in depth, light rising through them from
 * the engine at the foot (the manta, lit); above it the Markdown source, then the blocks, then the page with
 * a phrase selected, a caret and a collaborator's flag. The plates breathe slowly. Decoration,
 * hidden from assistive technology.
 */
function Build() {
  return (
    <div className="site-build" aria-hidden="true">
      <span className="site-build-glow" />
      <div className="site-build-scene">
        <span className="site-build-plate is-engine">
          <MantaMark className="site-build-mark" />
        </span>
        <span className="site-build-plate is-source">
          <span className="site-build-row">
            <span className="site-build-sign">#</span>
            <span className="site-build-line is-long" />
          </span>
          <span className="site-build-row">
            <span className="site-build-sign">-</span>
            <span className="site-build-line" />
          </span>
          <span className="site-build-row">
            <span className="site-build-sign">-</span>
            <span className="site-build-line is-short" />
          </span>
          <span className="site-build-row">
            <span className="site-build-sign">&gt;</span>
            <span className="site-build-line" />
          </span>
        </span>
        <span className="site-build-plate is-blocks">
          <span className="site-build-block is-head" />
          <span className="site-build-block" />
          <span className="site-build-block is-list" />
          <span className="site-build-block is-code" />
        </span>
        <span className="site-build-plate is-page">
          <span className="site-build-line is-head" />
          <span className="site-build-line is-long" />
          <span className="site-build-row">
            <span className="site-build-line is-picked" />
            <span className="site-build-caret">
              <span className="site-build-flag">Ana</span>
            </span>
          </span>
          <span className="site-build-line" />
          <span className="site-build-line is-short" />
        </span>
      </div>
    </div>
  );
}

/**
 * The closing band (Atlas frame 20): the first stage's light in the page's theme, a document built
 * on the engine
 * beside the last words and the two calls; the lamp of the first lights the edge of the second
 * when it comes near.
 */
export function Closing() {
  return (
    <section className="site-section" aria-labelledby="site-closing-title">
      <div className="site-wrap">
        <div className="site-stage site-band" data-reveal data-play>
          <Build />
          <div className="site-band-copy">
            <p className="site-eyebrow">The next chapter is yours</p>
            <h2 id="site-closing-title" className="site-title">
              Build on an engine
              <br />
              you own.
            </h2>
            <p className="site-sub">
              {LINKS.playground
                ? "Start with the quick start, or open the playground and edit a real document."
                : "Start with the quick start, or edit the live document above."}
            </p>
            <div className="site-actions">
              <Link className="site-button site-cta" href={LINKS.docs} data-lamp>
                <Lamp />
                <span>Read the docs</span>
                <Icon name="arrow-right" />
              </Link>
              {LINKS.playground ? (
                <a className="site-button site-cta is-second" href={LINKS.playground}>
                  <Catch />
                  Open the playground
                </a>
              ) : (
                <a className="site-button site-cta is-second" href={LINKS.repo}>
                  <Catch />
                  View on GitHub
                </a>
              )}
            </div>
            <p className="site-band-legend">
              <span>
                Engine <strong>MIT</strong>
              </span>
              <span>
                Services <strong>MIT</strong>
              </span>
              <span>
                Interface <strong>Commercial</strong>
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
