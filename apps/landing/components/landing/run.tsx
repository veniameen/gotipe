import { Icon, type IconName } from "../site/icon";
import { FACTS } from "./facts";
import { Badge } from "./features";

const WAYS: {
  icon: IconName;
  label: string;
  big: string;
  title: string;
  text: string;
  foot: string;
  tint?: boolean;
}[] = [
  {
    icon: "globe",
    label: "JavaScript",
    big: FACTS.JS_ENGINE_GZIP,
    title: "JavaScript engine",
    text: "The default. The whole editing model in TypeScript, nothing extra to load.",
    foot: "TypeScript · gzip, with Markdown",
  },
  {
    icon: "chip",
    label: "Rust / WASM",
    big: FACTS.WASM_ENGINE_GZIP,
    title: "Rust/WASM engine",
    text: "The same API and document contract, compiled from Rust. Required for real-time collaboration.",
    foot: "Rust · gzip · CRDT, cursors, reconnect",
    tint: true,
  },
  {
    icon: "server",
    label: "Go · self-hosted",
    big: "1 service",
    title: "GoTipe Cloud",
    text: "Documents, permissions, sync, exports and an AI proxy, on your servers.",
    foot: "PostgreSQL · Valkey · Docker Compose",
  },
];

/** «Same document. Different ways to run.»: one big number each. */
export function Run() {
  return (
    <section className="site-section is-run" aria-labelledby="site-run-title">
      <div className="site-wrap">
        <div className="site-center-head">
          <p className="site-eyebrow">Run it your way</p>
          <h2 id="site-run-title">
            Same document.
            <br />
            Different ways to run.
          </h2>
          <p className="site-sub">
            In the browser, in WebAssembly, on your servers. One document model, wherever you need
            it.
          </p>
        </div>
        <div className="site-run-grid">
          {WAYS.map((way) => (
            <article key={way.title} className={`site-run${way.tint ? " is-tint" : ""}`}>
              <div className="site-tile-top">
                <Icon name={way.icon} />
                <Badge licence="MIT" />
              </div>
              <p className="site-label">{way.label}</p>
              <p className="site-big">{way.big}</p>
              <h3>{way.title}</h3>
              <p>{way.text}</p>
              <p className="site-run-foot">{way.foot}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
