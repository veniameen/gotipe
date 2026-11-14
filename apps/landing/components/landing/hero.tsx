import Link from "next/link";
import { CopyButton } from "../site/copy-button";
import { Icon, type IconName } from "../site/icon";
import { LINKS } from "../site/links";

const INSTALL = "npm i @gotipe/core @gotipe/react";

const STACK: { icon: IconName; title: string; text: string; badge: string }[] = [
  {
    icon: "braces",
    title: "Your own engine",
    text: "TypeScript and Rust/WASM. No editor underneath.",
    badge: "MIT",
  },
  {
    icon: "page",
    title: "Markdown, untouched",
    text: "The same file in. Untouched blocks come back byte for byte.",
    badge: "Lossless",
  },
  {
    icon: "nodes",
    title: "Built to work together",
    text: "Real-time sync, review and offline editing.",
    badge: "MIT",
  },
];

/** The first stage: three lines, the calls to action, the install line, the stack, the strip. */
export function Hero() {
  return (
    <section className="site-stage site-hero" aria-labelledby="site-hero-title">
      <div className="site-wrap">
        <div className="site-hero-grid">
          <div className="site-hero-copy">
            <Link className="site-chip" href={LINKS.repo}>
              <span>v0.1</span>Open source. Built from scratch.
              <Icon name="arrow-right" />
            </Link>
            <h1 id="site-hero-title">
              Your editor.
              <br />
              Your engine.
              <br />
              <span className="site-accent">Your rules.</span>
            </h1>
            <p className="site-lede">
              A document editor framework built from the engine up. Lossless Markdown, real-time
              collaboration, and an interface that’s entirely yours.
            </p>
            <div className="site-actions">
              <Link className="site-button site-cta" href={LINKS.docs}>
                Start building
                <Icon name="arrow-right" />
              </Link>
              {LINKS.playground && (
                <a className="site-button site-cta is-second" href={LINKS.playground}>
                  Try the playground
                  <Icon name="arrow-right" />
                </a>
              )}
            </div>
            <div className="site-install">
              <code>{INSTALL}</code>
              <CopyButton
                text={INSTALL}
                label="Copy the install command"
                className="site-button is-quiet"
              />
            </div>
          </div>

          <div className="site-stack">
            <p className="site-stack-head">
              <span className="site-label">The GoTipe stack</span>
              <Icon name="layers" />
            </p>
            {STACK.map((item, index) => (
              <div key={item.title} className="site-stack-item">
                <p className="site-stack-title">
                  <Icon name={item.icon} />
                  <strong>{item.title}</strong>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                </p>
                <p>{item.text}</p>
                <span className="site-badge">{item.badge}</span>
              </div>
            ))}
            <p className="site-stack-foot">
              <Icon name="arrow-down" />
              Your interface. Your infrastructure.
            </p>
          </div>
        </div>

        <div className="site-strip">
          <span>Not a wrapper. A foundation.</span>
          <span className="site-strip-labels">
            <span>TypeScript</span>
            <span>Rust / WASM</span>
            <span>React</span>
            <span>Vue</span>
            <span>
              <Icon name="lock" />
              MIT core
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
