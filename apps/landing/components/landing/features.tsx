import { Badge } from "../site/badge";
import { Icon, type IconName } from "../site/icon";

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

function TileTop({ icon, licence }: { icon: IconName; licence: Licence }) {
  return (
    <div className="site-tile-top">
      <Icon name={icon} />
      <Badge licence={licence} />
    </div>
  );
}

/** «Everything you need. Nothing in your way.»: the bento of three, then nine on hairlines. */
export function Features() {
  return (
    <section className="site-section is-features" aria-labelledby="site-features-title">
      <div className="site-wrap">
        <div className="site-head-row">
          <div>
            <p className="site-eyebrow">The whole document stack</p>
            <h2 id="site-features-title">
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

        <div className="site-bento">
          <article className="site-tile is-tint">
            <TileTop icon="braces" licence="MIT" />
            <h3>An engine. Not a wrapper.</h3>
            <p>
              Transactions, history, selection and IME in TypeScript, with the same contract in
              Rust/WASM. No ProseMirror, Tiptap or Slate underneath.
            </p>
            <div className="site-diagram" aria-hidden="true">
              <span className="site-diagram-box">Your interface</span>
              <Icon name="arrow-down" />
              <span className="site-diagram-engine">
                <strong>GoTipe engine</strong>
                <span>TypeScript · Rust/WASM</span>
              </span>
              <span className="site-diagram-note">No third-party runtime dependencies.</span>
            </div>
          </article>
          <article className="site-tile is-sage">
            <TileTop icon="page" licence="MIT" />
            <h3>Your Markdown stays yours.</h3>
            <p>
              Our own parser keeps the file intact: an edit rewrites only the block it touched, your
              spacing and formatting are written back as they were.
            </p>
            <div className="site-md-card">
              <p className="is-head"># Offline drafts</p>
              <p>Drafts write first, sync later.</p>
              <p>- [x] keep my spacing</p>
              <p className="site-md-foot">
                <span>written back</span>
                <span className="is-ok">
                  <Icon name="check-16" />0 lines changed
                </span>
              </p>
            </div>
          </article>
          <article className="site-tile is-sand is-wide">
            <div>
              <TileTop icon="nodes" licence="MIT" />
              <h3>Better, together.</h3>
              <p>
                Our own CRDT in Rust. Concurrent and offline edits merge on reconnect; cursors and
                selections included.
              </p>
            </div>
            <div className="site-pair">
              <p className="site-pair-text">
                Two people,
                <br />
                <span className="site-pair-selection">one paragraph.</span>
                <span className="site-pair-caret" aria-hidden="true">
                  <span className="site-pair-flag">Jonas</span>
                </span>
              </p>
              <p className="site-pair-note">
                two&nbsp;edits ·&nbsp;one&nbsp;merge ·&nbsp;no&nbsp;conflict
              </p>
            </div>
          </article>
        </div>

        <div className="site-features">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="site-feature">
              <div className="site-feature-top">
                <Icon name={feature.icon} />
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
