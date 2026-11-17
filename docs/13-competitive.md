# GoTipe — Competitive Analysis

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

## Full Comparison Table

| Aspect | GoTipe | Tiptap | Lexical | Slate | Plate | BlockNote | CKEditor | TinyMCE |
|--------|--------|--------|---------|-------|-------|-----------|----------|---------|
| **Stars** | New | ~35K | ~22.9K | ~31.3K | ~15.5K | ~8.8K | Legacy | Legacy |
| **License** | MIT (headless) + Commercial (Block Editor UI) | MIT + Commercial (Editor) | MIT | MIT | MIT | MPL 2.0 | GPL-2 | GPL-2 |
| **Foundation** | Own (Rust/WASM) | ProseMirror | Own (Meta) | Own | Slate | ProseMirror+Tiptap | Own | Own |
| **Language** | Rust + TS | TypeScript | TypeScript | TypeScript | TypeScript | TypeScript | TypeScript | TypeScript |
| **WASM** | Core | No | No | No | No | No | No | No |
| **Block paradigm** | Block-first | Node tree | Node tree | Node tree | Slate blocks | Block-first | Node tree | Node tree |
| **Framework** | Agnostic | Agnostic | React-first | React-first | React-only | React-first | Agnostic | Agnostic |
| **React** | First-class | First-class | First-class | First-class | Only | First-class | Via adapter | Via adapter |
| **Vue** | First-class | First-class | Community | Community | No | No | Via adapter | Via adapter |
| **Svelte** | First-class | Community | No | No | No | No | No | No |
| **Solid** | First-class | No | No | No | No | No | No | No |
| **Collaboration** | CRDT (built-in) | Yjs (Hocuspocus) | Yjs (buggy) | Yjs | Hocuspocus | Yjs/Liveblocks | Proprietary | Proprietary |
| **CRDT type** | Loro-inspired Rust | Yjs (JS) | Yjs (JS) | Yjs (JS) | Yjs (JS) | Yjs (JS) | N/A (OT) | N/A (OT) |
| **Offline** | Full CRDT | Yjs CRDT | Limited | Yjs CRDT | Yjs CRDT | Yjs CRDT | No | No |
| **AI** | Built-in core | Content AI (paid) | DIY | DIY | DIY | No | AI plugin | AI Assistant |
| **Ghost text** | Built-in | No (Content AI) | No | No | No | No | No | No |
| **Slash commands** | Built-in | Extension | DIY | DIY | Built-in | Built-in | No | No |
| **DnD blocks** | Built-in | Extension | DIY | DIY | Built-in | Built-in | No | No |
| **Tables** | Built-in | TableKit (v3) | Built-in | Community | Built-in | Basic | Built-in | Built-in |
| **Export PDF** | Built-in (typst) | Paid Cloud | DIY | DIY | DIY | No | Paid | No |
| **Export DOCX** | Built-in (docx-rs) | Paid Cloud | DIY | DIY | DIY | No | Paid | No |
| **Server-side** | WASM (Node/Deno/Go) | Full Tiptap stack | Manual | Manual | Manual | No | Server-side | No |
| **NPM downloads** | New | 3M+/mo | 3M+/mo | 600K+/mo | 200K+/mo | 100K+/mo | 800K+/mo | 500K+/mo |
| **Company** | GoTipe | Tiptap GmbH | Meta | Community | Community | TypeCell | CKSource | Tiny Technologies |
| **Revenue** | $0 (pre-launch) | $2.3M (2024) | Meta-funded | $0 | Small | Grants | ~$11-15M | ~$10M |
| **Pricing** | Block Editor $149/yr, Cloud $29+/mo | Editor $149/mo, Cloud $49+/mo | Free | Free | Free+ | Free | $144+/mo | $25+/mo |

---

## Moat: GoTipe's Unique Advantages

### 1. Rust/WASM Core
The only RTE framework with a Rust core compiled to WASM. This gives:
- 2-5x faster parsing, validation and CRDT operations vs JavaScript
- Memory safety without GC pauses on large documents
- One codebase for the browser and the server (WASM + native Rust)
- Compact binary (~255KB gzip vs ProseMirror+Tiptap ~90KB, but GoTipe includes CRDT+export)

**No competitor has a Rust/WASM core.** All are based on pure JavaScript.

### 2. Native CRDT
CRDT is built into the document model rather than added as an adapter on top (like Yjs on top of ProseMirror in Tiptap). This means:
- Tighter integration: CRDT operations = document transforms (no mapping layer)
- History via CRDT (correct undo in collaborative editing)
- MovableTree CRDT for drag-and-drop of blocks (Yjs has no native tree CRDT)
- Binary sync protocol (more compact than Yjs encoding on large documents)

### 3. AI-first
AI integration (ghost text, commands, context builder) is part of the core architecture, not an addon:
- Provider-agnostic: OpenAI, Anthropic, Gemini, Ollama
- Ghost text rendering via the decoration layer (not a DOM hack)
- The context builder knows about document structure (not just a plaintext dump)
- Self-hosted AI (Ollama): data never leaves the user

Tiptap Content AI is a paid addon. CKEditor AI is a plugin. GoTipe AI is part of the MIT core.

### 4. Honest Open Source + Commercial Block Editor
**Headless core is fully MIT**: all extensions, CRDT, AI layer, export. No "Pro tier" on the headless API. The ready-made Notion-like UI (`@gotipe/block-editor`) has a commercial license, like Tiptap Editor.

| Feature | GoTipe | Tiptap |
|---------|--------|--------|
| DragHandle (headless API) | MIT | MIT (since 2025) |
| FileHandler | MIT | MIT (since 2025) |
| Collaboration | MIT | MIT (client), Hocuspocus MIT |
| AI layer (headless) | MIT | Content AI (Cloud paid) |
| Export PDF/DOCX | MIT (client) | Cloud paid |
| Comments | MIT | Cloud paid |
| **Notion-like Block Editor UI** | **Commercial ($149/app/yr)** | **Commercial ($149/app/mo)** |
| Block Editor + Cloud bundle | **Included in Cloud ($29+/mo)** | **Separate** |

> **Model:** Headless core = MIT (free forever). Block Editor UI = commercial license. Cloud = managed infrastructure + Block Editor license bundled.

### 5. Multi-framework
First-class support for React, Vue, Svelte, Solid + Vanilla JS. Not "React-first with community Vue adapter", but tested & documented adapters for every framework.

### 6. Server-side without browser
The WASM core runs in Node.js, Deno, Go, and natively in Rust. Validation, parsing and rendering work without instantiating a DOM. Tiptap needs the whole ProseMirror stack for server-side parsing.

### 7. Self-hosted everything
Collaboration server, AI proxy, export service: everything is self-hosted via Docker. No vendor lock-in. GoTipe Cloud is a convenience, not a necessity.

---

## GoTipe vs Competitors: Advantages by Area

| Area | Competitor | Competitor's approach | GoTipe |
|---------|-----------|-------------------|--------|
| **Extension API** | Tiptap | JS class inheritance, untyped | Typed Rust extensions, functional `defineExtension()`, built-in slash commands |
| **Block paradigm** | BlockNote | ProseMirror+Tiptap wrapper | Own Rust/WASM core, block-first document model |
| **Performance** | Lexical | Lightweight JS architecture | WASM core, 2-5x faster on large documents |
| **Document model** | Slate | Untyped flexible tree | Typed schema, Rust-validated structure |
| **Block editor UX** | Notion | Proprietary, closed | Open source, fully customizable |
| **CRDT** | Loro | Standalone Rust CRDT library | Tight integration with the editor document model |
| **Collaboration UX** | Figma | C++/WASM multiplayer | Applied to text editing with awareness and cursors |
| **Enterprise** | CKEditor | GPL license, SaaS-only collab | MIT, self-hosted, SOC 2 compliance |
| **AI integration** | Novel (Vercel) | Single provider, hosted only | Multi-provider, self-hosted Ollama support |

---

## Price Positioning

```
Price/month (for ~1000 collaborative documents):

$0       GoTipe Self-Hosted (MIT) ████████████████████████████  FREE (headless)
$12/mo   GoTipe Block Editor     ████  ($149/app/yr, ~$12/mo)
$25      TinyMCE Starter          ████████
$29      GoTipe Cloud Starter     █████████  (Block Editor included!)
$49      Tiptap Starter (500 docs)████████████████
$99      GoTipe Cloud Pro (10K)   ████████████████████████████████
$144     CKEditor Small            ████████████████████████████████████████████████
$149     Tiptap Growth (5K docs)  █████████████████████████████████████████████████
$299     GoTipe Business (100K)   ██████████████████████████████████████████████████████████████
$405     TinyMCE Professional     █████████████████████████████████████████████████████████████████████████
$999     Tiptap Scale (50K docs)  ███████████████████████████████████████████████████████████████████████████████████████
```

### Cost per 1000 Documents (Cloud collaboration)

| Editor | Cost per 1K docs/mo |
|--------|-------------------|
| GoTipe Self-Hosted | **$0** (+ your infra ~EUR 8/mo Hetzner VDS) |
| GoTipe Cloud | **$29** |
| Tiptap Cloud | **$49-98** |
| Liveblocks | **$29** (per MAU, not docs) |
| CKEditor | **$144+** (per editor loads, not docs) |

---

## Key Differentiators (summary)

| # | Differentiator | Competitor | GoTipe Advantage |
|---|---------------|-----------|-----------------|
| 1 | **Rust/WASM core** | All: pure JS | 2-5x speed, memory safety, server-side WASM |
| 2 | **Native CRDT** | Tiptap/BlockNote: Yjs adapter | Tighter integration, MovableTree, binary protocol |
| 3 | **AI-first** | Tiptap: paid addon | Ghost text in the MIT core, provider-agnostic |
| 4 | **Headless MIT + Block Editor UI** | Tiptap: Editor commercial | Headless 100% MIT, Block Editor $149/yr (vs Tiptap $149/mo) |
| 5 | **Multi-framework** | Lexical/Slate/Plate: React-only | React, Vue, Svelte, Solid — first-class |
| 6 | **Server-side WASM** | Tiptap: needs the PM stack | Validation without a browser, multi-language bindings |
| 7 | **Self-hosted** | CKEditor/TinyMCE: SaaS-only collab | Hetzner VDS + Docker Compose + Cloudflare R2, ~EUR 8/mo, zero lock-in |
| 8 | **Block editor out of the box** | Slate/Lexical: DIY | Notion-like UX: commercial license or free headless API |
| 9 | **Export built-in** | Tiptap: paid Cloud | PDF (typst), DOCX (docx-rs) in MIT |
| 10 | **Price** | Tiptap: $49+ for 500 docs | $29 for 1000 docs, self-hosted = $0 |

---

## Market Trends (2025-2030)

### 1. AI + Editor = Standard
- **42%** named "collaboration with AI" the top feature for the next 5 years
- Ghost text (inline autocomplete) is becoming table stakes
- Content AI (rewrite, expand, translate) — emerging differentiator
- **GoTipe position:** AI-first architecture, provider-agnostic, self-hosted option

### 2. Block Editors = New Default
- Notion set the UX standard for rich text
- Notion-like editors (BlockNote, Plate, Tiptap v3) are growing faster than classic ones
- The block paradigm is better for structured content
- **GoTipe position:** Block-first architecture, not a ProseMirror node tree with a block layer

### 3. Rust/WASM on the Web
- Figma (C++/WASM), Google Sheets (WASM), Adobe (WASM): a trend toward performance-critical WASM
- Loro, Automerge, Diamond Types: CRDTs in Rust
- typst, Dioxus, Leptos: the Rust web ecosystem is growing
- **GoTipe position:** The first RTE with a Rust/WASM core

### 4. Local-First / Offline-First
- Figma, Linear, Notion — offline editing
- CRDTs enable true local-first architecture
- GDPR / data sovereignty → on-premise demand
- **GoTipe position:** CRDT native, offline by design, self-hosted

### 5. Open Source Sustainability
- Tiptap: $2.6M seed → VC pressure → pricing increases
- "VCs will want ROI, so prices will go up" (HN comment)
- HashiCorp, Redis, Terraform — license changes
- **GoTipe position:** Headless core MIT forever, revenue from Block Editor UI licenses + Cloud services

### 6. Collaboration = Table Stakes
- **65%** consider real-time collaboration important
- Collaboration is no longer a premium feature; it is expected by default
- Comments, presence, version history are the baseline set
- **GoTipe position:** Collaboration in the MIT core, not a Cloud-only addon

---

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Tiptap open-sources everything** | Medium | High | GoTipe WASM core = structural advantage, not a feature advantage |
| **Lexical improves collaboration** | Medium | Medium | Lexical is tied to React; GoTipe = multi-framework |
| **WASM binary size scares people off** | Low | Medium | Lazy loading, JS fallback, tree-shaking |
| **Loro becomes the standard** | Medium | Positive | We can switch to a Loro dependency instead of a custom CRDT |
| **Developers don't want a new framework** | High | High | Yjs compatibility adapter, Tiptap migration guide, killer features |
| **Not enough contributors** | Medium | Medium | Good DX, Rust attracts quality contributors, well-documented |
| **Revenue below expectations** | Medium | High | Two sources: Block Editor licenses + Cloud subscriptions, enterprise sales, partnerships |

---

## Go-to-Market Strategy

### Launch: Developer Awareness
1. **HN / Reddit launch post:** "GoTipe: Rust-powered editor framework — MIT headless core, Notion-like Block Editor"
2. **Show HN:** Playground demo with live collaboration
3. **Comparison blog posts:** "GoTipe vs Tiptap: benchmarks", "Why Rust for RTE"
4. **Discord community:** Early adopters, feedback, contributions

### Post-Launch: Ecosystem Growth
1. **Extension marketplace:** Community extensions, templates
2. **Framework-specific content:** "GoTipe + Next.js", "GoTipe + Nuxt", "GoTipe + SvelteKit"
3. **Integration guides:** Supabase, Firebase, Vercel, Railway
4. **Conference talks:** React Conf, VueConf, RustConf

### Scale: Enterprise
1. **Case studies:** Early adopter success stories
2. **Enterprise sales:** SOC 2, on-premise, SLA
3. **Partnerships:** Hosting providers, AI providers, CMS platforms
4. **Analyst coverage:** Gartner, G2, StackOverflow survey

---

## Related Documents

- [00-overview.md](00-overview.md) — product positioning, market context
- [01-architecture.md](01-architecture.md) — technical architecture decisions
- [10-cloud.md](10-cloud.md) — pricing, cloud features
- [12-release-plan.md](12-release-plan.md) — implementation and release plan
