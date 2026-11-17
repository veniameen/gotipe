# GoTipe — Implementation and Release Plan

> **PDF: historical proposal.** The mentions of Typst/docx-rs, and the size and capability
> estimates below, do not describe the current backend. GoTipe owns PDF layout and
> OOXML rendering; the current references are the [export contract](development/export-contract.md)
> and the [dependency policy](development/dependencies.md).

> **Historical specification, not a guide to the current API.** The examples, timelines,
> performance comparisons, commercial terms and promises below do not confirm an
> implementation or the availability of the service. Current references: [contracts](development/editor-contracts.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and the manifest
> of each package, not by this document.

## Goal

A complete, production-ready rich text editor framework with Notion-like UX, multi-framework adapters, CRDT collaboration, AI integration, document export and GoTipe Cloud. Not an iterative MVP but a finished product, ready for a public release.

**v1.0 readiness criteria:**
- The editor renders and edits documents of any complexity
- 19+ block types (paragraph, heading 1-6, bulletList, orderedList, listItem, codeBlock, image, blockquote, divider, callout, table, tableRow, tableCell, tableHeader, toggle, columns, column, embed, math, file)
- Inline marks: bold, italic, underline, strikethrough, code, link, highlight, superscript, subscript
- Slash commands with fuzzy search and keyboard navigation
- Input rules (Markdown shortcuts: `# `, `- `, `**bold**`, `` ``` ``, `> `, etc.)
- Drag-and-drop of blocks with nesting
- Real-time collaboration (N users, CRDT, remote cursors, presence)
- Offline editing with automatic sync on reconnect
- AI ghost text (inline suggestions), AI commands (rewrite, expand, translate)
- Export: HTML, Markdown, PDF (typst), DOCX (docx-rs)
- Import: HTML, Markdown, Notion export, Google Docs paste
- React, Vue 3, Svelte 5, Solid adapters, all first-class
- Vanilla JS API for framework-agnostic use
- Server-side WASM (Node.js, Deno) + native Rust
- GoTipe Cloud: managed sync, AI proxy, export service, REST API
- Documentation site (docs.gotipe.com)
- Interactive playground (playground.gotipe.com)
- Landing page (gotipe.com)

---

## Development Architecture

### Modules and Dependencies

```
gotipe-schema ──────────────────────────────┐
     │                                       │
     ▼                                       │
gotipe-core ─────────────────────────┐      │
     │              │                 │      │
     ▼              ▼                 ▼      ▼
gotipe-crdt    gotipe-ai    gotipe-export   gotipe-wasm
     │              │                 │         │
     └──────┬───────┴────────┬───────┘         │
            ▼                ▼                  ▼
    @gotipe/collaboration  @gotipe/ai    @gotipe/core (JS)
                                               │
                    ┌──────────┬──────────┬─────┤
                    ▼          ▼          ▼     ▼
             @gotipe/react @gotipe/vue @gotipe/svelte @gotipe/solid
```

### Parallelization

Critical path: `gotipe-schema` → `gotipe-core` → `gotipe-wasm` → `@gotipe/core` → framework adapters.

Once `gotipe-core` is ready, the remaining crates (`gotipe-crdt`, `gotipe-ai`, `gotipe-export`) are developed **in parallel**.

---

## Effort

### By Component

| Component | Person-months | Dependencies | Critical path |
|-----------|:------------:|-------------|:----------------:|
| **gotipe-schema** (NodeSpec, MarkSpec, validation) | 1.5 | — | Yes |
| **gotipe-core** (Document, EditorState, Transaction, Steps, Commands) | 3 | gotipe-schema | Yes |
| **gotipe-crdt** (RichText CRDT, MovableTree, Sync, Awareness, History) | 3 | gotipe-core | No |
| **gotipe-ai** (context builder, ghost text engine, provider interface) | 1.5 | gotipe-core | No |
| **gotipe-export** (HTML, Markdown, PDF via typst, DOCX via docx-rs) | 2 | gotipe-core | No |
| **gotipe-wasm** (wasm-bindgen, WasmEditor, JS interop) | 1.5 | gotipe-core | Yes |
| **@gotipe/core** (JS wrapper, createEditor, event system, extensions) | 2 | gotipe-wasm | Yes |
| **@gotipe/react** (hooks, components, block renderers, toolbars) | 2 | @gotipe/core | Yes |
| **@gotipe/vue** (composables, components, provide/inject) | 1.5 | @gotipe/core | No |
| **@gotipe/svelte** (runes, components, stores) | 1.5 | @gotipe/core | No |
| **@gotipe/solid** (signals, components) | 1 | @gotipe/core | No |
| **@gotipe/collaboration** (GoTipeProvider, WebSocket client) | 1 | gotipe-crdt, @gotipe/core | No |
| **@gotipe/ai** (AIInline extension, AI commands, providers) | 1.5 | gotipe-ai, @gotipe/core | No |
| **@gotipe/export** (client-side JS API) | 1 | gotipe-export, @gotipe/core | No |
| **Block editor UX** (slash commands, DnD, toolbars, block types) — **COMMERCIAL** | 3 | @gotipe/react | Yes |
| **Block Editor license system** (JWT verification, watermark, domain check) | 0.5 | @gotipe/core | No |
| **Go sync server** (WebSocket, REST API, PostgreSQL, auth) | 2 | gotipe-crdt | No |
| **Go Cloud API** (documents CRUD, API keys, billing, AI proxy) | 2 | Go sync server | No |
| **Infrastructure** (Docker, CI/CD, monitoring, deployment) | 1.5 | — | No |
| **Documentation site** (Mintlify, API reference from OpenAPI, guides, examples) | 1.5 | All packages | No |
| **Playground** (interactive demo, collaboration, AI) | 1 | Documentation | No |
| **Landing page** (gotipe.com, marketing) | 0.5 | — | No |
| **Testing & QA** (unit, integration, e2e, browser matrix, accessibility) | 2 | All | No |
| **Total** | **~36 person-months** | | |

### With Parallelization

| Team | Duration | Critical path |
|---------|:----:|:----------------:|
| **3 engineers** | ~12 months | schema → core → wasm → JS → React → UX |
| **5 engineers** | ~8 months | The same chain, more parallelization |
| **7 engineers** | ~6 months | Maximum parallelization |

---

## Work by Module

### 1. Rust Core (gotipe-schema + gotipe-core)

| Task | Description |
|--------|----------|
| NodeSpec, MarkSpec, AttrSpec | Typed schema DSL: content rules, marks rules, attribute validators |
| Schema validation engine | Document validation, checking block and mark types |
| Document model | Block, TextSpan, Mark, nested children, block metadata |
| EditorState | Immutable state: document + selection + schema + extensions |
| Transaction & Steps | InsertText, DeleteText, AddMark, RemoveMark, InsertBlock, DeleteBlock, MoveBlock, SetBlockAttrs, MergeBlocks, SplitBlock |
| Commands | toggleMark, wrapInBlock, liftBlock, splitBlock, joinBlocks, selectAll, insertBlock |
| InputRules | Markdown shortcuts: `# ` → heading, `- ` → list, `**text**` → bold, `` ``` `` → code block |
| Schema presets | MinimalPreset (paragraph + bold/italic), DefaultPreset (all blocks + marks), FullPreset (+ AI + collaboration) |
| Property-based tests | Fuzzing with proptest, convergence tests, roundtrip serialization |

### 2. CRDT Engine (gotipe-crdt)

| Task | Description |
|--------|----------|
| RichTextCrdt | Fugue-based text CRDT with marks (bold/italic ranges) |
| MovableTreeCrdt | Tree CRDT for block hierarchy, drag-and-drop, nesting |
| CrdtDocument | Combines RichText + Tree, snapshot/update encoding |
| SyncProtocol | Binary sync protocol: state vectors, incremental updates |
| AwarenessProtocol | Cursor positions, selection ranges, user presence (name, color) |
| CrdtHistory | Undo/redo via CRDT: per-user undo stacks, correct collaborative undo |
| Offline queue | Operations in IndexedDB, automatic sync on reconnect |
| Yjs compatibility | Adapter for migrating from Yjs-based solutions |

### 3. AI Engine (gotipe-ai)

| Task | Description |
|--------|----------|
| Context builder | Context extraction from the document structure (not a plaintext dump) |
| Provider interface | Trait `AiProvider`: complete(), stream(), embed() |
| Ghost text engine | Debounce, context window, caching, accept/reject logic |
| OpenAI provider | GPT-4o, streaming, function calling |
| Anthropic provider | Claude, streaming |
| Ollama provider | Local LLM, zero data leakage |
| AI commands | Rewrite, expand, summarize, translate, fix grammar, change tone |
| Streaming | Server-Sent Events, incremental rendering |

### 4. Export/Import Engine (gotipe-export)

| Task | Description |
|--------|----------|
| HTML exporter | Semantic HTML5, XSS-safe, custom element mapping |
| HTML importer | Sanitized parsing, table/list reconstruction |
| Markdown exporter | CommonMark + GFM (tables, task lists, strikethrough) |
| Markdown importer | Pulldown-cmark parser, block type mapping |
| PDF exporter | typst-based rendering: headers, footers, page numbers, TOC |
| DOCX exporter | docx-rs: styles, tables, images, headers, bookmarks |
| Notion importer | Notion export ZIP → GoTipe blocks |
| Clipboard handler | Google Docs paste, Word paste, HTML paste |

### 5. WASM Bridge (gotipe-wasm)

| Task | Description |
|--------|----------|
| wasm-bindgen exports | WasmEditor class, all public methods |
| Serialization | serde-wasm-bindgen for JSON ↔ Rust structs |
| Event system | Callback registration, transaction events, state change events |
| Lazy loading | Core WASM (~150KB gzip), CRDT module (+50KB), Export module (+55KB) |
| Error handling | Rust panics → JS errors, typed error codes |
| Memory management | Document lifecycle, cleanup, WeakRef tracking |

### 6. JavaScript SDK (@gotipe/core)

| Task | Description |
|--------|----------|
| createEditor() | Factory with options: extensions, content, schema, plugins |
| Extension registration | defineExtension(), extension lifecycle, priority ordering |
| Event emitter | on/off/emit: transaction, update, focus, blur, selectionChange |
| Commands API | editor.commands.toggleBold(), chain().toggleBold().focus().run() |
| Plugin system | InputRule plugins, paste handlers, key bindings |
| Schema utilities | nodeSpec(), markSpec(), createSchema() |
| Storage | getJSON(), getHTML(), getMarkdown(), load() |
| TypeScript types | Full typing of all public APIs |

### 7. Framework Adapters

**React (@gotipe/react)**
| Task | Description |
|--------|----------|
| useEditor hook | Create/manage an editor instance with the React lifecycle |
| useEditorState hook | Reactive state access with the selector pattern |
| Editor component | Rendering container, DOM mount/unmount |
| Block components | ParagraphBlock, HeadingBlock, CodeBlock, ImageBlock, etc. |
| BubbleMenu | Floating toolbar: bold, italic, link, code, highlight |
| BlockToolbar | Drag handle + plus menu + block type menu |
| SlashMenu | Fuzzy search, keyboard navigation, categories |
| NodeViewRenderer | Custom React components for block types |

**Vue 3 (@gotipe/vue)**
| Task | Description |
|--------|----------|
| useEditor composable | Reactive editor instance |
| useEditorState composable | Reactive state access with computed |
| EditorContent component | Rendering, provide/inject |
| All block components | Same as React, with Vue template syntax |

**Svelte 5 (@gotipe/svelte)**
| Task | Description |
|--------|----------|
| createEditor (runes) | $state-based editor management |
| Editor component | Svelte 5 component with snippet-based rendering |
| Block components | All block types as Svelte 5 components |

**Solid (@gotipe/solid)**
| Task | Description |
|--------|----------|
| createEditor (signal) | Signal-based editor management |
| Editor component | Solid JSX rendering |
| Block components | All block types as Solid components |

### 8. Block Editor UX (Commercial — `@gotipe/block-editor`)

| Task | Description |
|--------|----------|
| 19 block types | All types from [04-block-editor.md](04-block-editor.md) |
| Slash commands | `/` menu, fuzzy search, keyboard nav, categories, custom commands |
| Input rules | All Markdown shortcuts from [03-editor-core.md](03-editor-core.md) |
| Drag and drop | Block reordering, nesting, visual drop indicator, touch support |
| BubbleMenu | Floating toolbar, smart positioning, inline formatting |
| BlockToolbar | Drag handle, plus button, block type switcher |
| Placeholder | Per-block placeholders, first block hint |
| Selection | Block selection, multi-block selection, keyboard shortcuts |
| Clipboard | Copy/paste of blocks, cross-editor paste, rich paste from external sources |
| Keyboard shortcuts | The full set from [04-block-editor.md#keyboard-shortcuts](04-block-editor.md#keyboard-shortcuts) |

### 9. GoTipe Cloud (Go)

| Task | Description |
|--------|----------|
| REST API | Documents CRUD, API keys, auth (JWT), organization management |
| WebSocket server | Real-time sync, document rooms, connection management |
| Persistence | PostgreSQL (metadata, auth), Cloudflare R2 (CRDT snapshots, assets) |
| AI proxy | OpenAI/Anthropic proxy, rate limiting, usage tracking |
| Export service | Async PDF/DOCX generation queue, R2 upload |
| Auth | API keys + JWT, organization scoping, RBAC |
| Billing | Stripe integration, usage metering, plan limits |
| Monitoring | Prometheus metrics, health checks, structured logging |
| Docker | docker-compose for self-hosted, Kubernetes manifests |

### 10. Documentation & Launch

| Task | Description |
|--------|----------|
| Documentation site | Mintlify-hosted (docs.gotipe.com), quickstart, API reference (auto-generated from OpenAPI), extension guides, examples |
| Playground | Interactive editor: collaboration demo, AI demo, export demo |
| Landing page | Next.js → Vercel (gotipe.com), value proposition, pricing, comparison |
| Migration guides | From Tiptap, from ProseMirror, from Lexical, from Slate |
| npm packages | Publish @gotipe/* packages to npm registry |
| GitHub | README, CONTRIBUTING, issue templates, PR templates |
| Community | Discord server, discussion templates, code of conduct |

---

## Team Allocation

| Role | Count | Focus |
|------|:----------:|-------|
| **Rust engineer** | 2 | gotipe-schema, gotipe-core, gotipe-crdt, gotipe-ai, gotipe-export, gotipe-wasm |
| **Frontend engineer** | 2 | @gotipe/core, @gotipe/react, block editor UX, other framework adapters |
| **Full-stack engineer** | 1 | Go cloud, infrastructure, CI/CD, documentation |
| **Total** | **5** | |

### Timeline Allocation (5 people, ~8 months)

```
Month   1     2     3     4     5     6     7     8
        │     │     │     │     │     │     │     │
Rust-1  ████████████████████████████████░░░░░░░░░░░░
        schema ──► core ──► wasm   testing & fixes

Rust-2  ░░░░░░████████████████████████████░░░░░░░░░░
              crdt ──► ai ──► export   testing

Front-1 ░░░░░░░░░░░░████████████████████████████████
                    @gotipe/core ──► react ──► UX

Front-2 ░░░░░░░░░░░░░░░░░░████████████████████████░░
                          vue ──► svelte ──► solid

Full-St ░░░░░░░░░░░░░░░░░░░░░░████████████████████████
                              cloud ──► docs ──► launch
```

**Legend:** `████` = active development, `░░░░` = maintenance / waiting on a dependency

---

## Pricing (v1.0 Launch)

### 3 Products

| Product | Model | Description |
|---------|--------|----------|
| **GoTipe Core** | MIT (free) | Headless editor engine, all extensions, CRDT, AI layer, export, framework adapters |
| **GoTipe Block Editor** | Commercial license | Notion-like UI: SlashMenu, BubbleMenu, DragHandle, BlockToolbar, themes, AI UI |
| **GoTipe Cloud** | Subscription | Managed sync, AI proxy, export service, analytics + Block Editor license included |

### Block Editor (license without Cloud)

| Tier | Domains | Price |
|------|--------|------|
| **Indie** | 1 production domain | **$149/app/year** |
| **Business** | Up to 10 production domains + priority support | **$499/app/year** |
| **Enterprise** | Unlimited domains + SLA + source code | **Custom** |

### GoTipe Cloud (Block Editor included)

| | Free (self-hosted) | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|---|
| **Price** | $0 | $29/mo | $99/mo | $299/mo | Custom |
| **Block Editor** | — (headless only) | ✓ Included | ✓ Included | ✓ Included | ✓ Included |
| **Documents** | Unlimited | 1,000 | 10,000 | 100,000 | Unlimited |
| **Collaboration** | Self-hosted | Cloud sync | Cloud sync | Cloud sync | On-premise |
| **AI requests** | Self-hosted | 10K/mo | 100K/mo | 1M/mo | Unlimited |
| **Export (PDF/DOCX)** | Self-hosted | 1K/mo | Unlimited | Unlimited | Unlimited |
| **Analytics** | — | Basic | Full | Full | Custom |
| **SSO** | — | — | — | SAML/OIDC | SAML/OIDC |
| **Support** | Community | Email | Priority email | Dedicated | Dedicated + SLA |
| **Audit log** | — | — | — | Yes | Yes |
| **Compliance** | — | — | — | SOC 2, GDPR | SOC 2, HIPAA, GDPR |

> **Principle:** Headless core = MIT (free forever). Block Editor UI = commercial license. Cloud = managed infrastructure + Block Editor license bundled.

### Comparison with Tiptap Cloud

| Metric | GoTipe | Tiptap |
|--------|--------|--------|
| **Block Editor license** | $149/app/year | $149/app/mo |
| **Cloud entry price** | $29/mo (1K docs) + Block Editor incl. | $49/mo (500 docs) + Editor separate |
| **Cost per 1K docs** | $29 | $49-$98 |
| **Cost per 10K docs** | $99 | $149 |
| **Cost per 50K docs** | $299 | $999 |
| **AI included** | Yes (10K-1M req) | Separate (Content AI addon) |
| **Export included** | Yes (PDF/DOCX) | Separate (Document Conversion addon) |
| **Self-hosted** | Full-featured, MIT headless | Limited (Hocuspocus, no Comments/AI) |

---

## Success Metrics

### Launch (v1.0)

| Metric | Target | Stretch |
|--------|--------|---------|
| GitHub stars | 2,000 | 5,000 |
| npm downloads/week | 1,000 | 5,000 |
| Discord members | 200 | 1,000 |
| Cloud signups | 100 | 500 |
| Paid customers | 10 | 50 |
| Contributors | 10 | 30 |

### 6 Months After Launch (v1.x)

| Metric | Target |
|--------|--------|
| GitHub stars | 5,000 |
| npm downloads/week | 10,000 |
| Cloud MRR | $5,000 |
| Enterprise customers | 3 |
| Contributors | 30 |
| Framework adapters coverage | 100% parity |

---

## Roadmap After v1.0

### v1.x — Post-Launch (Month 9-14)

| Feature | Description |
|---------|----------|
| Advanced tables | Merge cells, split cells, resize columns, header rows/columns |
| Comments & Annotations | Inline comments, resolved/unresolved states, thread replies |
| Version history | Time travel UI, diff view, named versions, restore |
| Permissions model | Read-only, comment-only, edit, admin per-document |
| Performance optimization | Virtual rendering for 10K+ blocks, lazy block loading |
| Mobile-friendly editing | Touch DnD, responsive toolbar, gesture support |
| Additional AI providers | Gemini, Mistral, Cohere, custom endpoints |
| WebRTC provider | Peer-to-peer collaboration without a central server |

### v2.0 — Platform (Month 15-20)

| Feature | Description |
|---------|----------|
| Multi-document linking | Wiki-style `[[page]]` references, backlinks |
| Embedded databases | Notion-like databases: table, board, calendar, timeline views |
| Custom views | Kanban boards, calendar view, gallery view |
| Version branching | Git-like branching & merging for documents |
| Real-time voice/video | Embedded Livekit/Daily.co for voice/video in the editor |
| Plugin marketplace | Community extensions, verified plugins, monetization for authors |
| White-label solution | Fully customizable branding for enterprise |
| Offline-first PWA | Reference PWA app with full offline support |

---

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|:----------:|:------:|------------|
| WASM binary size scares people off | Low | Medium | Lazy loading of modules, code splitting (~150KB core gzip) |
| wasm-bindgen serialization overhead | Medium | Medium | Benchmark early, shared memory, batch operations |
| CRDT convergence bugs | Medium | High | Property-based testing (proptest), formal verification |
| DOM ↔ WASM state sync complexity | Medium | High | Unidirectional data flow, WASM owns state |
| Tiptap open-sources everything | Medium | High | WASM core = structural advantage, not a feature advantage |
| Developers don't want a new framework | High | High | Yjs compatibility, Tiptap migration guide, killer features |
| Not enough contributors | Medium | Medium | Good DX, Rust attracts quality contributors |
| Revenue below expectations | Medium | High | Two sources: Block Editor licenses + Cloud subscriptions, enterprise sales |

---

## Definition of Done (v1.0)

### Functionality
- [ ] All 19 block types work correctly
- [ ] All 11 inline marks work correctly
- [ ] Slash commands with fuzzy search
- [ ] Input rules (Markdown shortcuts)
- [ ] Drag-and-drop with nesting
- [ ] Real-time collaboration (remote cursors, presence, conflict resolution)
- [ ] Offline editing with sync on reconnect
- [ ] AI ghost text (accept/reject, streaming)
- [ ] AI commands (rewrite, expand, translate)
- [ ] Export: HTML, Markdown, PDF, DOCX
- [ ] Import: HTML, Markdown, Notion, clipboard

### Framework Adapters
- [ ] React: full feature set, hooks, components, toolbars
- [ ] Vue 3: full feature set, composables, components
- [ ] Svelte 5: full feature set, runes, components
- [ ] Solid: full feature set, signals, components
- [ ] Vanilla JS: createEditor API without a framework dependency

### Server-Side
- [ ] WASM works in Node.js (validation, parsing, rendering)
- [ ] WASM works in Deno
- [ ] Go sync server with WebSocket and REST API
- [ ] PostgreSQL + Cloudflare R2 persistence
- [ ] Docker compose for self-hosted deployment

### Quality
- [ ] Unit tests: >80% coverage on Rust crates
- [ ] Integration tests: all extensions + collaboration
- [ ] E2E tests: Playwright, Chrome/Firefox/Safari
- [ ] Browser compatibility: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- [ ] WCAG 2.1 AA accessibility (keyboard navigation, screen reader, ARIA)
- [ ] Performance: <200ms first render, <50ms keystroke latency on 10K blocks
- [ ] WASM binary: <200KB gzip (core), <300KB gzip (full)
- [ ] No known security vulnerabilities (XSS, injection)

### Documentation
- [ ] docs.gotipe.com: quickstart, API reference, extension guides
- [ ] playground.gotipe.com: interactive demo
- [ ] Migration guides: Tiptap, ProseMirror, Lexical, Slate
- [ ] Self-hosted deployment guide
- [ ] CONTRIBUTING.md, code of conduct

### Launch
- [ ] npm: all @gotipe/* packages published
- [x] crates.io: gotipe-* 0.1.0 published on 2026-11-17 (`publish-crates.yml`); the owner's decision revises D-71
- [ ] GitHub: README, templates, labels, milestones
- [ ] GoTipe Cloud: registration, API keys, working sync
- [ ] Monitoring: Prometheus, alerts, health checks

---

## Related Documents

- [00-overview.md](00-overview.md) — product overview, positioning
- [01-architecture.md](01-architecture.md) — system architecture, cost analysis
- [10-cloud.md](10-cloud.md) — cloud architecture, deployment
- [11-monorepo.md](11-monorepo.md) — repo structure, CI/CD
- [13-competitive.md](13-competitive.md) — competitive analysis, pricing
