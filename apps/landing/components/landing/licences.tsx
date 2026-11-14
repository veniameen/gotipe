import Link from "next/link";
import { Icon } from "../site/icon";
import { LINKS } from "../site/links";
import { Badge } from "./features";

type Part = readonly [string, string];

/** The MIT parts: everything but the four packages of the commercial licence. */
const OPEN: Part[] = [
  ["Transaction engine", "selection, history, IME"],
  ["Markdown parser", "lossless, 652 / 652 CommonMark"],
  ["Framework adapters", "React, Vue, Svelte and Solid"],
  ["Real-time collaboration", "CRDT in Rust/WASM"],
  ["Comments, suggestions, versions", "anchored threads, block compare"],
  ["AI layer, PDF and DOCX", "your model; browser and server writers"],
  ["Migration", "ProseMirror, Tiptap, Slate, Lexical"],
  ["GoTipe Cloud and the SDK", "Go service, Docker Compose"],
];

/** GoTipe Commercial License 1.0: block-editor, block-editor-vue, ai-ui and theme. */
const READY: Part[] = [
  ["BlockEditor and PageEditor", "for React"],
  ["The block editor for Vue", "slash menu, drag handle, toolbar"],
  ["AI interface components", "command line, suggestions"],
  ["The theme and its four views", "notion, docs, modern, minimal"],
];

function Parts({ parts }: { parts: Part[] }) {
  return (
    <ul>
      {parts.map(([name, note]) => (
        <li key={name}>
          <Icon name="check-16" />
          <span>
            {name}
            <small>{note}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** «Open where it matters.»: the two licences side by side, in the terms of the licence files. */
export function Licences() {
  return (
    <section className="site-stage is-grey" aria-labelledby="site-licences-title">
      <div className="site-wrap">
        <div className="site-head-row">
          <div>
            <p className="site-eyebrow">A clear line. No fine print.</p>
            <h2 id="site-licences-title">Open where it matters.</h2>
          </div>
          <p className="site-sub">
            The engine and every service around it are MIT. Only the ready-made interface is
            commercial, and it is free for most teams.
          </p>
        </div>
        <div className="site-licences">
          <article className="site-licence">
            <div className="site-licence-top">
              <span className="site-label">Build it your way</span>
              <Badge licence="MIT" />
            </div>
            <h3>Engine and services</h3>
            <p className="site-licence-meta">{OPEN.length} parts · use, fork, ship</p>
            <Parts parts={OPEN} />
          </article>
          <article className="site-licence is-tint">
            <div className="site-licence-top">
              <span className="site-label">Ship a little sooner</span>
              <Badge licence="Commercial" />
            </div>
            <h3>Ready-made interface</h3>
            <p className="site-licence-meta">{READY.length} parts · one licence per product</p>
            <Parts parts={READY} />
            <p className="site-licence-free">
              <strong>Free</strong> for personal projects, open source, non-profits, education and
              companies under $1M revenue, and while you evaluate. Otherwise, one licence per
              product. <Link href={LINKS.licensing}>Read the terms</Link>
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
