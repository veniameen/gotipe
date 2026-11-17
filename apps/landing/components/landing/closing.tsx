import Link from "next/link";
import { Icon } from "../site/icon";
import { Catch, Lamp } from "../site/lamp";
import { LINKS } from "../site/links";

/** The mark's G without its tile: the engine's face carries it, dark against the light. */
const G_PATH = "M23 11a8 8 0 1 0 1 9v-5h-8v3h5v1a5 5 0 1 1-1-6z";

/**
 * The engine: a dark dial lit from the left in blue and from the right in cyan, a grain of dots in
 * that light, two arcs of light on its rings and two hands turning slowly; two beams cross behind
 * it. Decoration, hidden from assistive technology.
 */
function Engine() {
  return (
    <div className="site-engine" aria-hidden="true">
      <span className="site-engine-beam" />
      <span className="site-engine-beam is-second" />
      <span className="site-engine-face">
        <span className="site-engine-ring" />
        <span className="site-engine-ring is-inner" />
        <span className="site-engine-arc" />
        <span className="site-engine-arc is-second" />
        <svg className="site-engine-mark" viewBox="7 7 18 18" aria-hidden="true" focusable="false">
          <path d={G_PATH} />
        </svg>
        <span className="site-engine-hand" />
        <span className="site-engine-hand is-short" />
        <span className="site-engine-hub" />
      </span>
    </div>
  );
}

/**
 * The closing band (Atlas frame 20): a night stage in either theme, the engine beside the last
 * words and the two calls; the lamp of the first lights the edge of the second when it comes near.
 */
export function Closing() {
  return (
    <section className="site-section" aria-labelledby="site-closing-title">
      <div className="site-wrap">
        <div className="site-stage site-band" data-theme="dark" data-reveal data-play>
          <Engine />
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
