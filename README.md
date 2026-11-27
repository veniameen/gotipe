<p align="center">
  <a href="https://gotipe.com"><img src=".github/assets/gotipe-logo-256.webp" width="112" height="112" alt="GoTipe logo"></a>
</p>

<h1 align="center">GoTipe</h1>

<p align="center">
  Your editor. Your engine. Your rules.<br>
  A document editor framework built from the engine up: lossless Markdown, real-time collaboration, TypeScript and Rust/WASM.
</p>

<p align="center">
  <a href="https://gotipe.com">Website</a> ·
  <a href="https://gotipe.com/docs/">Docs</a> ·
  <a href="https://crates.io/search?q=gotipe">Crates</a> ·
  <a href="https://gotipe.com/docs/resources/changelog/">Changelog</a>
</p>

GoTipe is a block editor framework for the web: a ready Notion-style editor for React, headless
adapters for React, Vue, Svelte and Solid, lossless Markdown and real-time collaboration, on its own
TypeScript and Rust/WASM engine. The core, Markdown, transactions, history and CRDT are all owned
by the project; Tiptap and ProseMirror are not used.

Three ways to integrate:

- **Headless core**: `@gotipe/core` plus adapters (React, Vue, Svelte, Solid); you build the UI yourself
- **Ready-made UI**: `@gotipe/block-editor`, a Markdown-first PageEditor and BlockEditor with
  shared tokens, tables, media and review
- **GoTipe Cloud**: the source of our own backend that you deploy yourself: API,
  WebSocket, PostgreSQL, background exports and AI adapters

`engine: 'js'` works without WASM and suits a strict CSP. `engine: 'wasm'` enables Rust and
collaboration; `'auto'` tries WASM and falls back to JS when the module is unavailable. Schema and
document errors are never masked by switching engines.

Each version's changes are in the [changelog](https://gotipe.com/docs/resources/changelog/); the
required checks are in the [test matrix](docs/development/testing.md). There is no hosted GoTipe
Cloud: you deploy the backend yourself.

## Get started

Start a new app from a starter project, or add the editor to a project that uses shadcn/ui:

```sh
npx create-next-app@latest my-editor --example https://github.com/veniameen/gotipe/tree/main/examples/nextjs
npx degit veniameen/gotipe/examples/vite-react my-editor
npx shadcn@latest add @gotipe/block-editor
```

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/veniameen/gotipe/tree/main/examples/vite-react?file=src%2Feditor.tsx)

The [starters](examples) run the ready block editor on the published packages. To install the
packages yourself, follow [installation](https://gotipe.com/docs/getting-started/installation/)
and the [quick start](https://gotipe.com/docs/getting-started/quick-start/).

## Local setup

You need Node.js, the pnpm version from `packageManager`, Rust with `wasm32-unknown-unknown`,
wasm-pack and Binaryen (`wasm-opt`). Building the full workspace includes a separate PDF/DOCX WASM:

```sh
pnpm install --frozen-lockfile
pnpm build:wasm
pnpm build:export-wasm
pnpm build
pnpm --filter @gotipe/playground exec vite --host 127.0.0.1 --port 5173
```

Local address: `http://127.0.0.1:5173/`. PageEditor opens by default; the other examples are
available from the menu. The PDF/DOCX exporter loads only when you run the corresponding export and
is not part of the main editor WASM.

## PageEditor

```tsx
import { useState } from 'react';
import { PageEditor } from '@gotipe/block-editor';
import '@gotipe/theme/base.css';
import '@gotipe/theme/theme.css';

export function Document() {
  const [markdown, setMarkdown] = useState('# Document\n\nStart writing.\n');
  return <PageEditor markdown={markdown} onChange={setMarkdown} locale="en" />;
}
```

PageEditor renders with a shared view: `view` is `notion` (the default), `docs`, `modern` or
`minimal`. To store files, provide `host.saveAsset` and `host.resolveAsset`. Without a host, small
files are embedded in the document as data URLs; callbacks and limits are described in the
[media contract](docs/development/assets.md).
Use `getJSON()` for the full rich-document structure; Markdown preserves the syntax and semantics of
the supported Markdown constructs, not arbitrary JSON.

## AI coding agents

GoTipe ships a skill that teaches coding agents to install, configure and debug it:

```sh
npx skills add veniameen/gotipe
```

In Claude Code: `/plugin marketplace add veniameen/gotipe`, then `/plugin install gotipe@gotipe`.
Tools that discover skills by domain can read the [GoTipe skill index](https://gotipe.com/.well-known/agent-skills/index.json).
Agents can also read [llms.txt](https://gotipe.com/llms.txt), which lists every docs page, and the
Markdown copy of any page at the same address with `.md` instead of the trailing slash.

## Stack

Rust + WASM (Core) · TypeScript + pnpm + Turborepo (Packages) · Go + Chi (Cloud API) · PostgreSQL · Valkey · Playwright (E2E)

## Documentation

- [Development rules and SOLID](AGENTS.md), [code map](docs/development/code-map.md)
- [Dependencies](docs/development/dependencies.md), [checks](docs/development/testing.md)
- [Browser synchronization](docs/development/browser-collaboration.md)
- [Cloud API and operational contracts](docs/development/cloud-contract.md)
- [WASM budget](docs/development/wasm-budget.md)

Documents `00`–`20` describe the original design and requirements. An idea appearing there does not
confirm that it is implemented; check status against the release plan, the public API and the
current tests.

## License

The headless packages are licensed under MIT. The ready-made UI and theme packages keep their own
commercial license, stated in their `package.json` and LICENSE files. License files and third-party
compiler and font notices are included in the package archives.
