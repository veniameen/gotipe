# 23 — GoTipe vs Tiptap: what we have, what we lack, what to do

State as of 2026-11-12. Tiptap was reviewed on the live tiptap.dev and tiptap.dev/docs;
GoTipe from the `main` code (c45dd4c). The full Tiptap inventory with links is stored
locally: `output/research/tiptap-inventory-20261112.md` (outside Git).

## Tiptap today

- Version 3.33 (3.0 shipped in July 2025). Built on ProseMirror and Yjs; the collaboration
  server is Hocuspocus 4.8 (Node, Bun, Deno, Workers). 39k stars, about 770 open issues.
- Positioning has moved upmarket: no longer a "headless editor" but "document
  infrastructure for regulated industries". The home page sells SOC 2, HIPAA, EU
  hosting and on-prem, Word compatibility, and AI edits under review.
- Open (MIT): the core, about 71 extensions, Markdown (marked "early release"),
  static renderer, Hocuspocus, Find & Replace, a simple template.
- Paid: everything stored in their cloud (comments, history, webhooks), the
  `@tiptap-pro/*` packages from a private registry, and the Notion-like UI (slash menu,
  handle menu, "turn into"). Separate add-ons: Tracked Changes from $249/mo,
  Compare from $3,299/mo, AI Toolkit through the sales team.
- Plans are priced by documents: Start $49, Team $149, Business $999 per month;
  when you exceed the limit the plan is upgraded automatically. No free cloud since June 2025.
- Documentation is about 790 pages: demos with React/Vue tabs on every extension
  page, "Copy markdown", "Ask AI" (opens external chats), ⌘K search,
  llms.txt, every page available as `.md`. There is no official MCP server.
- UI components are React only, distributed as source through a CLI, like shadcn.

## Comparison

| Area | Tiptap | GoTipe | Verdict |
|---|---|---|---|
| Engine | ProseMirror + Yjs | own: TS and Rust/WASM with one contract, own CRDT | we are stronger |
| Document model | tree with inline nodes | blocks with `TextSpan[]`; no inline nodes | we are weaker |
| Markdown | `@tiptap/markdown` in beta, escaping bugs | own codec, untouched blocks keep their bytes, CommonMark 652/652 | we are stronger |
| Extensions | ~71 under MIT | 14 nodes, 10 marks, 4 behaviors | we are weaker |
| Tables | cell merge and split, resize | resize, column types; merged cells are only stored | we are weaker |
| Formulas | KaTeX, inline and block | TeX is stored, not rendered | we are weaker |
| Embeds | YouTube, Twitch, audio | link card without an iframe | we are weaker |
| Ready-made UI | React, Notion-like is paid | BlockEditor and PageEditor for React; Vue minimal; commercial license | on par |
| Frameworks | vanilla, React, Vue 2/3, Svelte, Next, Nuxt, PHP | React and Vue fully; Svelte and Solid without rendering | we are weaker |
| Collaboration | Hocuspocus (MIT) + paid cloud | own CRDT and own Cloud on your servers, MIT | we are stronger |
| Comments | paid, only in their cloud | MIT, but no sync between people | mixed |
| Change tracking | paid add-on | MIT | we are stronger |
| Versions and comparison | paid, Compare from $3,299/mo | MIT, block-level comparison; history UI only in the playground | mixed |
| AI | AI Toolkit: agents with tools, edits under review — paid | provider contract, commands, ghost text; no tools | we are weaker |
| Export | DOCX, PDF, ODT, EPUB, MD — paid | PDF, DOCX, HTML, MD free, in the browser and on the server | we are stronger |
| Import | DOCX, Markdown | HTML, Markdown, JSON; no DOCX | we are weaker |
| Pages (pagination) | beta, Team plan | none | we are weaker |
| Migration | 8 guides | ProseMirror/Tiptap, Slate, Lexical converters | on par |
| Server | cloud, dedicated, on-prem; SOC 2, HIPAA | own Go server at the customer's site, no certifications | mixed |
| Documentation | ~790 pages with live demos | no public docs yet — being written now | we are weaker |
| License and price | per-document, auto-upgrade, private registry | core MIT, UI commercial; commercial license terms not written yet | we are stronger, but the UI terms are not written |

## Where we are already stronger

1. **Everything Tiptap charges for is MIT with us**: collaboration, change tracking,
   versions and comparison, PDF and DOCX export, the AI layer. Only the ready-made UI
   is commercial.
2. **Our own engine.** Their best bugs come from ProseMirror: Backspace in lists (#2493,
   #3367, since 2022), IME in Safari and CJK (#7186, #4499), duplicate versions (#577). Our
   selection, IME and lists are our own and are checked in Chromium, Firefox and WebKit.
3. **Lossless Markdown.** Theirs is "early release" with escaping bugs (#8471)
   and soft-break bugs (#8136); with us, editing a paragraph does not rewrite the rest of the file.
4. **Our own server with no per-document bill.** No automatic plan upgrades and no lock-in to their
   cloud: Cloud runs at the customer's site with a single Docker Compose.
5. **Stable names.** Tiptap's AI products were renamed three times, Snapshot
   Compare was replaced by Compare, and the roadmap page is out of date.

## What is missing

**P0 — we cannot compete without these:**
- **Inline nodes in the model.** A block stores only `TextSpan[]`, so mentions,
  inline formulas, emoji as a node and images in text are impossible. This is a decision
  at the level of the core, JS and Rust together — an ADR is needed before any "mentions".
- **Public documentation and a site** — in progress (`docs-site/`, Atlas frames 20–21).
- **Rendering for Svelte, Solid and vanilla.** The core does not render DOM; without React or Vue
  the host renders the blocks itself. Tiptap has vanilla and Svelte.
- **Commercial license terms.** `LICENSE-COMMERCIAL` is a stub with an address;
  `packages/theme/src/base.css` is marked MIT even though the package is commercial.

**P1 — what people expect from an editor:**
- Small extensions: find and replace, character and word counter, text
  alignment, typography (quotes, dashes), autolinks, pasting Markdown from the clipboard,
  table of contents as a block, an empty paragraph at the end of the document.
- Tables: merging and splitting cells in the UI.
- Syncing comments and suggestions between people; storing versions and a
  ready-made history UI in the library.
- Collaboration in PageEditor (currently only the JS engine).
- An AI agent with tools: read the document and propose edits for review.
  The foundation already exists — anchored edits (`applyAnchoredEdits`) and the PageEditor review layer.
- DOCX import; cleaning up pasted content from Word and Google Docs (Tiptap: Team plan).
- Formulas: a pluggable TeX renderer; embeds with an iframe from an allowlist of
  hosts; audio and video.

**P2 — later:**
- A pages view with pagination, headers and footers, and footnotes.
- Angular, Web Components, a bridge for mobile WebViews.
- A CLI that drops UI components into the project as source.
- Mermaid diagrams, ODT and EPUB.

## What to adopt in presentation

- **Home page:** a live editor on the first screen with tabs (BlockEditor, PageEditor,
  views); feature cards with MIT and Commercial badges — like their Free and Paid;
  verifiable facts instead of customer logos; three ways to run (browser, WASM,
  your own server).
- **Documentation:** an extension page in one fixed order — demo, installation,
  options, commands, keys, Markdown, limitations; "Copy Markdown" and `.md` on
  every page; llms.txt; ⌘K search; prev/next; "Edit on GitHub".
- **Getting ahead:** an official documentation MCP server (Tiptap has none); the documentation
  is rendered by GoTipe itself as `docs`; live demos come from the playground.
- **Not adopting:** per-document billing, automatic plan upgrades, a private package registry,
  a paid Notion-like UI on top of an open core.

## Order of work

1. Site and documentation: Atlas frames 20–21 → owner decision → `apps/landing`.
2. ADR on inline nodes (JS, Rust, CRDT, Markdown), then mentions and inline formulas.
3. A batch of small extensions from P1.
4. Syncing comments and suggestions, version storage, history UI.
5. An AI agent with tools on top of anchored edits.
6. Rendering for Svelte, Solid and vanilla.
7. DOCX import and paste cleanup.
