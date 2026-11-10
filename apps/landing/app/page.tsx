const features = [
  [
    "01",
    "Your document model",
    "A typed tree of blocks, attributes and marks. Transactions validate changes before they reach the document, with undo and redo.",
  ],
  [
    "02",
    "Markdown that stays yours",
    "GoTipe’s own parser keeps untouched source intact. Edit a paragraph without rewriting the rest of the file.",
  ],
  [
    "03",
    "A complete editing surface",
    "PageEditor and BlockEditor share media, tables and code controls. Add your own views, commands and host integrations.",
  ],
  [
    "04",
    "Review in context",
    "Anchored comments, tracked changes and version snapshots keep the discussion beside the content. Accept, reject, compare and restore.",
  ],
  [
    "05",
    "Work together",
    "The Rust CRDT engine merges concurrent changes. Connect the collaboration provider to your own GoTipe Cloud deployment.",
  ],
  [
    "06",
    "Choose what to load",
    "Use JavaScript or Rust/WASM, with adapters for React, Vue, Svelte and Solid. AI providers, syntax highlighting and PDF/DOCX export are optional.",
  ],
];

const example = `import { createEditor } from '@gotipe/core/js';
import { FullPreset } from '@gotipe/core/presets';

const editor = await createEditor({
  extensions: FullPreset,
  content: '<h1>A document of your own</h1>',
});

editor.on('update', () => {
  save(editor.getJSON());
});`;

function playgroundUrl() {
  const value = process.env.NEXT_PUBLIC_PLAYGROUND_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const playground = playgroundUrl();
  return (
    <main id="top">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="site-header wrap">
        <a className="brand" href="#top" aria-label="GoTipe home">
          <span aria-hidden="true">G</span>GoTipe
        </a>
        <nav aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#start">Get started</a>
          <a href="#licensing">Licensing</a>
        </nav>
      </header>

      <section className="hero wrap" id="content">
        <div className="hero-copy">
          <p className="eyebrow">
            <span aria-hidden="true" /> An editor you can make your own
          </p>
          <h1>
            Good ideas deserve
            <br />
            <em>a better page.</em>
          </h1>
          <p className="lede">
            A block editor built around your content. Own the document, shape the experience, and
            keep control of the engine underneath.
          </p>
          <div className="actions">
            <a className="button primary" href={playground ?? "#start"}>
              {playground ? "Open the playground" : "Start building"}
              <span aria-hidden="true">↗</span>
            </a>
            <a className="button secondary" href="#features">
              Explore GoTipe
            </a>
          </div>
          <p className="hero-note">Own core · Own Markdown · JavaScript & Rust/WASM</p>
        </div>
        <figure className="document-preview" aria-label="Example document layout">
          <div className="preview-bar">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <span>Product notes</span>
            <span className="preview-tag">Markdown</span>
          </div>
          <div className="preview-page">
            <p className="preview-kicker">IDEAS → SOMETHING REAL</p>
            <h2>Space to think.</h2>
            <p>
              Start with a sentence. Give it structure.
              <br />
              Make room for what comes next.
            </p>
            <div className="preview-callout">
              <span aria-hidden="true">✦</span>
              <p>
                Your content stays portable.
                <br />
                <strong>Your experience stays yours.</strong>
              </p>
            </div>
            <ul className="preview-checklist">
              <li>Write with a clear head</li>
              <li>Review changes together</li>
              <li>Keep every detail in place</li>
            </ul>
            <div className="preview-bottom">
              <span>One document. Many possibilities.</span>
              <span aria-hidden="true">⌘</span>
            </div>
          </div>
          <figcaption>Example layout. Open the playground to edit a real document.</figcaption>
        </figure>
      </section>

      <section className="features wrap" id="features">
        <div className="section-intro">
          <p className="eyebrow">BUILT TO FIT YOUR PRODUCT</p>
          <h2>
            The foundations are yours.
            <br />
            So is the experience.
          </h2>
          <p>
            Start with a ready editor or build a surface around the headless core. Each feature has
            a clear boundary.
          </p>
        </div>
        <div className="feature-grid">
          {features.map(([number, title, description]) => (
            <article className="feature" key={number}>
              <span className="feature-number">{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="build-section" id="start">
        <div className="wrap build-grid">
          <div>
            <p className="eyebrow">START WITH A DOCUMENT</p>
            <h2>
              Small surface.
              <br />
              Room to grow.
            </h2>
            <p>
              Use public extensions and transactions. Add a framework adapter when you need a view;
              connect your own storage through the host API.
            </p>
            <p>
              The local playground contains editable examples for tables, media, collaboration,
              comments, versions and AI.
            </p>
            <details>
              <summary>Run from the source checkout</summary>
              <pre className="setup-code">
                <code>{`pnpm install --frozen-lockfile
pnpm build:wasm
pnpm build
pnpm --filter @gotipe/playground dev`}</code>
              </pre>
              <p>
                Open the local URL printed by Vite. The repository README covers optional export
                builds, Cloud setup and licenses.
              </p>
            </details>
          </div>
          <div className="code-example">
            <div className="code-heading">
              <span>editor.ts</span>
              <span>JavaScript engine</span>
            </div>
            <pre>
              <code>{example}</code>
            </pre>
            <p>Connect the save callback to your application’s storage.</p>
          </div>
        </div>
      </section>

      <section className="licensing wrap" id="licensing">
        <div>
          <p className="eyebrow">CLEAR BOUNDARIES</p>
          <h2>Choose your building blocks.</h2>
        </div>
        <div className="license-grid">
          <article>
            <span className="license-tag">MIT</span>
            <h3>Core & integrations</h3>
            <p>
              The engine, Markdown, framework adapters, collaboration, review APIs, AI layer and
              export wrappers ship with MIT licenses. Optional native export dependencies have their
              own notices.
            </p>
          </article>
          <article>
            <span className="license-tag">Commercial</span>
            <h3>Ready-made interface</h3>
            <p>
              BlockEditor, PageEditor, AI UI and the visual theme use the commercial license
              included with their packages. Review those terms before using the UI in a product.
            </p>
          </article>
        </div>
      </section>
      <footer className="site-footer wrap">
        <a className="brand" href="#top">
          GoTipe
        </a>
        <p>A place for your ideas. A foundation for your product.</p>
        <a href="#start">Build with GoTipe ↑</a>
      </footer>
    </main>
  );
}
