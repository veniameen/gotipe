import Link from "next/link";
import { Icon } from "../site/icon";
import { LINKS } from "../site/links";

/** The closing band: the first stage again, centred. */
export function Closing() {
  return (
    <section className="site-section" aria-labelledby="site-closing-title">
      <div className="site-wrap">
        <div className="site-stage site-band">
          <p className="site-eyebrow">The next chapter is yours</p>
          <h2 id="site-closing-title">
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
            <Link className="site-button site-cta" href={LINKS.docs}>
              Read the docs
              <Icon name="arrow-right" />
            </Link>
            {LINKS.playground && (
              <a className="site-button site-cta is-second" href={LINKS.playground}>
                Open the playground
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
    </section>
  );
}
