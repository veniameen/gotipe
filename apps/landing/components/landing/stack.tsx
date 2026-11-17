import type { CSSProperties } from "react";
import { Badge } from "../site/badge";
import { Icon, type IconName } from "../site/icon";
import { Logo } from "../site/logo";
import { Beams } from "./motion/beams";
import { PartIcon, type PartIconName } from "./part-icons";

const INTERFACES = ["React", "Vue", "Svelte", "Solid"];

const INFRASTRUCTURE: { icon: IconName; label: string }[] = [
  { icon: "page", label: "Markdown" },
  { icon: "braces", label: "JSON · HTML" },
  { icon: "download", label: "PDF · DOCX" },
  { icon: "cloud", label: "GoTipe Cloud" },
];

const PILLARS: { icon: PartIconName; title: string; text: string; badge: string }[] = [
  {
    icon: "engine",
    title: "Your own engine",
    text: "TypeScript and Rust/WASM. No editor underneath.",
    badge: "MIT",
  },
  {
    icon: "markdown",
    title: "Markdown, untouched",
    text: "The same file in. Untouched blocks come back byte for byte.",
    badge: "Lossless",
  },
  {
    icon: "together",
    title: "Built to work together",
    text: "Real-time sync, review and offline editing.",
    badge: "MIT",
  },
];

/** A box's place in its column: its comet leaves or arrives in turn (styles/landing/motion.css). */
const order = (index: number) => ({ "--site-beam-i": index }) as CSSProperties;

/**
 * «The GoTipe stack» (Atlas frame 20): a panel of the page's theme (light glass by day, night
 * glass by night), your interface on one side, your
 * infrastructure on the other, the engine between them, lit, with comets of light running in and
 * out along the beams; then the three parts it stands on. The words are in the boxes; the beams
 * and their light are drawn by the browser.
 */
export function Stack() {
  return (
    <section className="site-section site-stack-section" aria-labelledby="site-stack-title">
      <div className="site-wrap">
        <div className="site-center-head" data-reveal>
          <p className="site-eyebrow">The GoTipe stack</p>
          <h2 id="site-stack-title" className="site-title">
            Your interface. Your infrastructure.
          </h2>
        </div>
        <Beams className="site-stack-diagram">
          <div className="site-stack-col">
            <p className="site-label">Your interface</p>
            <ul>
              {INTERFACES.map((name, index) => (
                <li key={name} className="site-stack-node" data-beam="in" style={order(index)}>
                  <span className="site-stack-dot" aria-hidden="true" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <div className="site-stack-hub" data-hub>
            <span className="site-beam-ring" aria-hidden="true">
              <span />
            </span>
            <span className="site-stack-mark">
              <Logo place="hub" />
            </span>
            <strong>GoTipe engine</strong>
            <span>TypeScript · Rust/WASM</span>
          </div>
          <div className="site-stack-col is-out">
            <p className="site-label">Your infrastructure</p>
            <ul>
              {INFRASTRUCTURE.map((item, index) => (
                <li
                  key={item.label}
                  className="site-stack-node"
                  data-beam="out"
                  style={order(index)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </Beams>
        <ol className="site-pillars">
          {PILLARS.map((pillar, index) => (
            <li
              key={pillar.title}
              className="site-pillar"
              data-reveal
              style={{ "--site-i": index } as CSSProperties}
            >
              <p className="site-pillar-top">
                <PartIcon name={pillar.icon} place="pillar" />
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              </p>
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
              <Badge>{pillar.badge}</Badge>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
