import type { CSSProperties } from "react";
import { Badge } from "../site/badge";
import { Icon, type IconName } from "../site/icon";
import { MarkdownMock, PairMock, TransactionMock } from "./bento/mocks";

type Licence = "MIT" | "Commercial";

const FEATURES: { icon: IconName; licence: Licence; title: string; text: string }[] = [
  {
    icon: "edit",
    licence: "Commercial",
    title: "Block editor",
    text: "Slash menu, drag handle, bubble toolbar, tables and media.",
  },
  {
    icon: "page",
    licence: "Commercial",
    title: "Page editor",
    text: "A Markdown page with comments in the margin.",
  },
  {
    icon: "comment",
    licence: "MIT",
    title: "Comments and suggestions",
    text: "Anchored threads and tracked changes.",
  },
  {
    icon: "restore",
    licence: "MIT",
    title: "Versions",
    text: "Snapshots, block-level compare, a restore you can undo.",
  },
  {
    icon: "sparkle",
    licence: "MIT",
    title: "AI layer",
    text: "Your model: streaming, cancel, proofreading.",
  },
  {
    icon: "download",
    licence: "MIT",
    title: "PDF and DOCX",
    text: "Our own writers, in the browser or on the server.",
  },
  {
    icon: "swap",
    licence: "MIT",
    title: "Migration",
    text: "ProseMirror, Tiptap, Slate and Lexical JSON.",
  },
  {
    icon: "palette",
    licence: "Commercial",
    title: "Views and themes",
    text: "Four looks, light and dark, your CSS variables.",
  },
  {
    icon: "cloud",
    licence: "MIT",
    title: "Your own cloud",
    text: "Documents, sync, exports and an AI proxy in one Go service.",
  },
];

// the site's one badge; the landing's other sections take it from here
export { Badge };

const order = (index: number) => ({ "--site-i": index }) as CSSProperties;

function TileTop({ icon, licence }: { icon: IconName; licence: Licence }) {
  return (
    <div className="site-tile-top">
      <span className="site-icon-box">
        <Icon name={icon} />
      </span>
      <Badge licence={licence} />
    </div>
  );
}

/**
 * «Everything you need. Nothing in your way.»: three tiles with their live pictures, then the nine
 * parts of the stack. Light follows the pointer over the cards (motion/controller.tsx).
 */
export function Features() {
  return (
    <section className="site-section is-features" aria-labelledby="site-features-title">
      <div className="site-wrap">
        <div className="site-head-row" data-reveal>
          <div>
            <p className="site-eyebrow">The whole document stack</p>
            <h2 id="site-features-title" className="site-title">
              Everything you need.
              <br />
              Nothing in your way.
            </h2>
          </div>
          <p className="site-sub">
            The engine and every service around it are open source. Only the ready-made interface
            has a commercial license.
          </p>
        </div>

        <div className="site-bento" data-glow>
          <article className="site-tile is-engine" data-glow-card data-reveal style={order(0)}>
            <TileTop icon="braces" licence="MIT" />
            <h3>An engine. Not a wrapper.</h3>
            <p>
              Transactions, history, selection and IME in TypeScript, with the same contract in
              Rust/WASM. No ProseMirror, Tiptap or Slate underneath.
            </p>
            <TransactionMock />
          </article>
          <article className="site-tile is-markdown" data-glow-card data-reveal style={order(1)}>
            <TileTop icon="page" licence="MIT" />
            <h3>Your Markdown stays yours.</h3>
            <p>
              Our own parser keeps the file intact: an edit rewrites only the block it touched, your
              spacing and formatting are written back as they were.
            </p>
            <MarkdownMock />
          </article>
          <article
            className="site-tile is-together is-wide"
            data-glow-card
            data-reveal
            data-play
            style={order(2)}
          >
            <div>
              <TileTop icon="nodes" licence="MIT" />
              <h3>Better, together.</h3>
              <p>
                Our own CRDT in Rust. Concurrent and offline edits merge on reconnect; cursors and
                selections included.
              </p>
            </div>
            <PairMock />
          </article>
        </div>

        <div className="site-features" data-glow>
          {FEATURES.map((feature, index) => (
            <article
              key={feature.title}
              className="site-feature"
              data-glow-card
              data-reveal
              style={order(index % 3)}
            >
              <div className="site-feature-top">
                <span className="site-icon-box">
                  <Icon name={feature.icon} />
                </span>
                <Badge licence={feature.licence} />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
