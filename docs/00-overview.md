# GoTipe — Product Overview

> **Historical specification, not a guide to the current API.** The examples, schedules,
> performance comparisons, commercial terms and promises below do not confirm an
> implementation or the availability of a service. For current information see: [contracts](development/editor-contracts.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and the manifest
> of each package, not by this document.

> **GoTipe** — a Rust-powered editor framework: headless core + block editor + real-time collaboration + AI — all open source, cloud optional.

**Domain:** [gotipe.com](https://gotipe.com)
**License:** MIT
**Repository:** github.com/veniameen/gotipe

---

## What GoTipe Is

GoTipe is a headless, framework-agnostic rich text editor framework with Notion-like UX out of the box. The core is written in Rust and compiled to WebAssembly, giving a 2-5x performance gain over pure-JS solutions. CRDT-based real-time collaboration works without the cloud. AI integration is built into the core, not added as a paid add-on.

```
┌─────────────────────────────────────────────────────────┐
│                    GoTipe Framework                      │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │  React   │ │  Vue 3   │ │ Svelte 5 │ │  Solid   │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       └──────┬─────┴──────┬─────┴─────────────┘         │
│              ▼            ▼                              │
│  ┌──────────────────────────────────────────────┐       │
│  │          @gotipe/core (JS Bindings)           │       │
│  └──────────────────┬───────────────────────────┘       │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────┐       │
│  │         gotipe-wasm (Rust/WASM Core)          │       │
│  │  ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────────┐ │       │
│  │  │ Schema  │ │ CRDT │ │  AI  │ │ Export   │ │       │
│  │  │ Engine  │ │Engine│ │Layer │ │ Engine   │ │       │
│  │  └─────────┘ └──────┘ └──────┘ └──────────┘ │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

---

## What GoTipe Is NOT

| Misconception | Reality |
|-------------|-----------|
| A wrapper around ProseMirror | Its own Rust engine, its own document model, its own transform layer |
| A SaaS-only product | Works fully offline, self-hosted, zero vendor lock-in |
| A generic CMS component | Focused on developer experience: headless API, typed schema, extensible |
| A React-only library | Framework-agnostic core. First-class support for React, Vue, Svelte, Solid |
| Freemium with a paywall on extensions | Headless core is MIT. Block Editor UI (Notion-like) has a commercial license. Cloud is managed infrastructure |
| Browser-only | The WASM core works in Node.js, Deno, Go, Rust — server-side validation and rendering without a browser |
| A research project | A product with a commercial model (GoTipe Cloud) and a roadmap to v2.0 |

---

## Target Audience

| Persona | Need | What GoTipe provides |
|---------|-------------|-----------------|
| **Frontend developer** at a startup | Quickly embed a Notion-like editor in a SaaS | Block Editor — 1 line of code, ready-made Notion-like UI (licensed) |
| **Backend engineer** | Validate and process rich text on the server | WASM core in Node.js/Go/Rust — parsing without a browser (MIT) |
| **Tech Lead** | Pick an editor framework that won't become vendor lock-in | MIT headless core, self-hosted collaboration, you can build your own UI |
| **Product Manager** | Add collaborative editing without Tiptap Cloud pricing | CRDT out of the box, self-hosted WebSocket server (MIT) |
| **AI product** | Integrate an LLM into a text editor | Ghost text, AI commands, multi-provider — in the headless core (MIT) |
| **Enterprise architect** | On-premise editor with SOC 2 and GDPR compliance | Everything self-hosted, audit log, GoTipe Enterprise |
| **Open-source contributor** | Work with clear, typed Rust code | Rust workspace with clear modularity, documented API |
| **Indie developer** | A free headless editor without limits | MIT headless core, including collaboration and the AI layer |

---

## Value Proposition

### 1. Rust/WASM Core — performance
Parsing, validation, CRDT, transforms — all in Rust compiled to WASM. On documents with >10K blocks GoTipe is 2-5x faster than ProseMirror-based solutions. See [01-architecture.md#performance](01-architecture.md#performance).

### 2. Native CRDT — collaboration without the cloud
CRDT-based collaboration (Loro-inspired) is built into the core. It works peer-to-peer, through a self-hosted server, or through GoTipe Cloud. You don't pay for sync — it's part of the open-source core. See [02-collaboration.md](02-collaboration.md).

### 3. Two tiers: MIT headless + commercial Block Editor
The headless core (all extensions, CRDT, AI layer, export) is MIT. A developer can build **any** UI for free. For those who want a **ready-made Notion-like UI** out of the box there is `@gotipe/block-editor` with a commercial license. Same as Tiptap: the core is free, the premium UI is paid. See [05-extensions.md](05-extensions.md).

### 4. Block Editor — Notion-like UX in one line
`@gotipe/block-editor` is a commercial package with a ready-made Notion-like UI: slash commands, drag and drop, nested blocks, floating toolbar, themes. One line, `<BlockEditor />`, gives a finished editor. The headless API lets you build your own UI for free. See [04-block-editor.md](04-block-editor.md).

### 5. AI-first — LLM in the core of the architecture
Ghost text (inline suggestions), AI commands (rewrite, expand, translate), streaming generation — built into the core, not an add-on. Provider-agnostic: OpenAI, Anthropic, Gemini, Ollama. See [07-ai.md](07-ai.md).

### 6. Server-side rendering and validation
The WASM core works everywhere: Node.js, Deno, Go, Rust. Parse, validate and render documents on the server without instantiating a browser DOM. See [03-editor-core.md#server-side](03-editor-core.md#server-side).

### 7. Framework-agnostic — React, Vue, Svelte, Solid
A thin adapter layer for each framework. The core knows nothing about React/Vue. Switching frameworks means replacing one package. See [06-framework-adapters.md](06-framework-adapters.md).

### 8. Multi-backend bindings
WASM bindings for Go, Python, Ruby. Backend developers work with the same types and schema as the frontend. One source of truth. See [09-sdk-and-api.md](09-sdk-and-api.md).

---

## Market Context

- **WYSIWYG editor market:** $211M (2025) → $350M+ (2033)
- **71%** of respondents consider an RTE critical for platforms
- **60%** of organizations buy an RTE instead of building their own
- **42%** named "collaboration with AI" the top feature for the next 5 years

GoTipe enters the market with a differentiated offering: Rust/WASM performance + native CRDT + AI-first + honest open source. Detailed analysis in [13-competitive.md](13-competitive.md).

---

## Monetization

### 3 products

```
┌──────────────────────────────────────────────────────────┐
│  @gotipe/block-editor (COMMERCIAL)                        │
│  Notion-like UI: SlashMenu, DragHandle, BubbleMenu,      │
│  BlockToolbar, themes, AI UI — a ready-made editor         │
│  Commercial license by key                                │
├──────────────────────────────────────────────────────────┤
│  GoTipe Cloud (SUBSCRIPTION)                              │
│  Managed sync, AI proxy, export, analytics                │
│  Block Editor license included in the subscription        │
├──────────────────────────────────────────────────────────┤
│  GoTipe Core (MIT, FREE)                                  │
│  Headless: Rust/WASM engine, extensions, CRDT, AI layer,  │
│  export, framework adapters, self-hosted server            │
└──────────────────────────────────────────────────────────┘
```

### Pricing

| Tier | What's included | Price |
|------|-----------|------|
| **Headless Core (MIT)** | Editor engine, all extensions, CRDT, AI layer, export, framework adapters, self-hosted server | **$0** |
| **Block Editor** | Notion-like UI components, themes, slash commands, DnD, toolbars. License for 1 production domain | **$149/app/year** |
| **Block Editor Business** | Block Editor + up to 10 domains, priority support | **$499/app/year** |
| **GoTipe Cloud Starter** | Managed sync (1K docs), AI (10K req/mo), Export (1K/mo) + **Block Editor included** | **$29/mo** |
| **GoTipe Cloud Pro** | 10K docs, 100K AI req, unlimited export, analytics + **Block Editor included** | **$99/mo** |
| **GoTipe Cloud Business** | 100K docs, 1M AI req, SSO, priority support + **Block Editor included** | **$299/mo** |
| **GoTipe Enterprise** | On-premise, SLA, dedicated support, SOC 2, audit log + **Block Editor included** | **Custom** |

> **Principle:** Headless core = MIT, always free. Block Editor UI = commercial license (like Tiptap Editor). Cloud = managed infrastructure + Block Editor license bundled.

Pricing details and comparison with competitors in [10-cloud.md#pricing](10-cloud.md#pricing) and [12-release-plan.md#pricing](12-release-plan.md#pricing).

---

## Documentation Index

| # | Document | Description |
|---|---------|----------|
| 00 | [00-overview.md](00-overview.md) | Product overview *(this file)* |
| 01 | [01-architecture.md](01-architecture.md) | System architecture, Rust/WASM core, document model |
| 02 | [02-collaboration.md](02-collaboration.md) | Real-time collaboration, CRDT, sync protocol |
| 03 | [03-editor-core.md](03-editor-core.md) | Editor core (Rust/WASM): schema, transforms, commands |
| 04 | [04-block-editor.md](04-block-editor.md) | Block editor: Notion-like UX, slash commands, drag-n-drop |
| 05 | [05-extensions.md](05-extensions.md) | Extension system: API, built-in extensions, custom extensions |
| 06 | [06-framework-adapters.md](06-framework-adapters.md) | Framework integration: React, Vue, Svelte, Solid |
| 07 | [07-ai.md](07-ai.md) | AI integration: ghost text, commands, providers |
| 08 | [08-export-import.md](08-export-import.md) | Document conversion: PDF, DOCX, Markdown, HTML |
| 09 | [09-sdk-and-api.md](09-sdk-and-api.md) | SDK and API: packages, types, examples |
| 10 | [10-cloud.md](10-cloud.md) | GoTipe Cloud: architecture, API, pricing |
| 11 | [11-monorepo.md](11-monorepo.md) | Repository structure, tooling, CI/CD |
| 12 | [12-release-plan.md](12-release-plan.md) | Implementation and release plan |
| 13 | [13-competitive.md](13-competitive.md) | Competitive analysis |
| 14 | [14-security-privacy.md](14-security-privacy.md) | Security and privacy |
| 15 | [15-accessibility-i18n.md](15-accessibility-i18n.md) | Accessibility, i18n, RTL, IME, mobile devices |
| 16 | [16-comments-versioning.md](16-comments-versioning.md) | Comments, versioning, access rights |
| 17 | [17-migration-guide.md](17-migration-guide.md) | Migration from Tiptap, ProseMirror, Lexical, Slate |
| 18 | [18-design-system.md](18-design-system.md) | Design system: UI components, themes, CSS tokens, animations |
| 19 | [19-testing.md](19-testing.md) | Testing strategy: Rust, TS, Go, E2E, coverage |
