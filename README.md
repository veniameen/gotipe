# GoTipe

GoTipe is a block editor written from scratch in TypeScript and Rust/WASM. The core, Markdown,
transactions, history and CRDT are all owned by the project; Tiptap and ProseMirror are not used.

Three ways to integrate:

- **Headless core**: `@gotipe/core` plus adapters (React, Vue, Svelte, Solid); you build the UI yourself
- **Ready-made UI**: `@gotipe/block-editor`, a Markdown-first PageEditor and BlockEditor with
  shared tokens, tables, media and review
- **GoTipe Cloud**: the source of our own backend that you deploy yourself: API,
  WebSocket, PostgreSQL, background exports and AI adapters

`engine: 'js'` works without WASM and suits a strict CSP. `engine: 'wasm'` enables Rust and
collaboration; `'auto'` tries WASM and falls back to JS when the module is unavailable. Schema and
document errors are never masked by switching engines.

For the current release-candidate status and the required checks, see the
[release plan](docs/22-release-readiness.md). Being ready locally does not mean the packages are
published or that an external Cloud is already deployed.

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
