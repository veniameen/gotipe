import type { CSSProperties } from "react";
import { Badge } from "../site/badge";
import { Icon, type IconName } from "../site/icon";
import { Beams } from "./motion/beams";

const INTERFACES = ["React", "Vue", "Svelte", "Solid"];

const INFRASTRUCTURE: { icon: IconName; label: string }[] = [
  { icon: "page", label: "Markdown" },
  { icon: "braces", label: "JSON · HTML" },
  { icon: "download", label: "PDF · DOCX" },
  { icon: "cloud", label: "GoTipe Cloud" },
];

const PILLARS: { icon: IconName; title: string; text: string; badge: string }[] = [
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

/**
 * «The GoTipe stack» (Atlas frame 20): your interface on one side, your infrastructure on the
 * other, the engine between them with beams running through it; then the three parts it stands
 * on. The words are in the boxes; the beams are drawn over them by the browser.
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
              {INTERFACES.map((name) => (
                <li key={name} className="site-stack-node" data-beam="in">
                  <span className="site-stack-dot" aria-hidden="true" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <div className="site-stack-hub" data-hub>
            <span className="site-stack-mark">
              <Icon name="logo" className="site-logo" />
            </span>
            <strong>GoTipe engine</strong>
            <span>TypeScript · Rust/WASM</span>
          </div>
          <div className="site-stack-col is-out">
            <p className="site-label">Your infrastructure</p>
            <ul>
              {INFRASTRUCTURE.map((item) => (
                <li key={item.label} className="site-stack-node" data-beam="out">
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
                <Icon name={pillar.icon} />
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
