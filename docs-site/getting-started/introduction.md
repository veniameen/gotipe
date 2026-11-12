---
title: Introduction
description: What GoTipe is, which packages it ships and how they fit together.
---

GoTipe is a library for building block-based rich-text editors on the web. It owns every
layer of the editor: the document engine, transactions and history, the Markdown codec,
collaboration and export. Use the headless core and draw your own interface, or drop a
ready editor component into a React app.

```demo
page-editor
```

## What is in the box

- **Document engine.** A document is a tree of blocks with stable IDs. Every change is a
  validated, atomic transaction with undo history. The engine has two implementations of
  one contract: TypeScript, and Rust compiled to WebAssembly.
- **Markdown codec.** GitHub-flavoured Markdown in and out, written for GoTipe. Blocks you
  did not edit keep their original bytes.
- **Framework adapters** for React, Vue, Svelte and Solid.
- **Editor UI** for React: `BlockEditor` (slash menu, block handles, formatting bar,
  tables, media) and `PageEditor`, the same editor bound to a Markdown file.
- **Review**: comments, tracked suggestions, model edits and version snapshots.
- **Collaboration** on GoTipe's own CRDT, with a WebSocket provider.
- **AI** commands over a provider interface that you implement.
- **Export** to HTML, Markdown, plain text, PDF and DOCX, and **GoTipe Cloud**, a
  self-hosted server written in Go.

## Packages

| Package | Layer | License | What it gives you |
|---|---|---|---|
| `@gotipe/core` | Engine | MIT | `createEditor`, transactions, commands, extensions, presets, HTML import, server rendering (`/server`), menu helpers (`/menus`) |
| `@gotipe/wasm` | Engine | MIT | The Rust engine as WebAssembly; optional |
| `@gotipe/markdown` | Formats | MIT | Markdown parser and serializer |
| `@gotipe/react` | Adapter | MIT | `useEditor`, `EditorContent`, `useEditorState`, block views, media blocks |
| `@gotipe/vue` | Adapter | MIT | `useEditor`, `EditorContent`, `useEditorState` |
| `@gotipe/svelte`, `@gotipe/solid` | Adapter | MIT | Editor lifecycle and view state; no block renderer |
| `@gotipe/i18n` | UI support | MIT | Interface strings; English and Russian built in |
| `@gotipe/block-editor` | UI | Commercial | `BlockEditor`, `PageEditor`, menus and review UI for React |
| `@gotipe/block-editor-vue` | UI | Commercial | `BlockEditorVue`, a slash menu and a block toolbar for Vue |
| `@gotipe/theme` | UI | Commercial | `base.css`, `theme.css`, design tokens and the theme API |
| `@gotipe/ai-ui` | UI | Commercial | React components for AI commands and ghost text |
| `@gotipe/comments`, `@gotipe/suggestions`, `@gotipe/versions` | Review | MIT | Comment threads, tracked changes, snapshots and diffs |
| `@gotipe/collaboration` | Collaboration | MIT | WebSocket provider for the CRDT engine |
| `@gotipe/ai` | AI | MIT | Provider contract, AI commands, autocomplete |
| `@gotipe/export`, `@gotipe/export-wasm` | Formats | MIT | HTML, Markdown, text, PDF and DOCX export |
| `@gotipe/migration` | Formats | MIT | Converters from other editors' JSON documents |
| `@gotipe/sdk` | Cloud | MIT | HTTP client for GoTipe Cloud |

The core and the Markdown codec have no third-party runtime dependencies.

> [!NOTE]
> The four packages marked Commercial are licensed under the GoTipe Commercial License.
> Everything else is MIT. See [licensing](/docs/resources/licensing).

## How the pieces fit

```text
your app
 ├─ UI ........ BlockEditor, PageEditor           @gotipe/block-editor + @gotipe/theme
 ├─ adapter ... useEditor, EditorContent          @gotipe/react, @gotipe/vue
 ├─ features .. comments, suggestions, versions, collaboration, ai
 └─ core ...... createEditor → engine (JS or Rust/WASM) → @gotipe/markdown
```

1. `createEditor` builds a schema from your extensions and loads the document. The core
   renders no blocks: `editor.mount(element)` attaches input, selection and clipboard
   handling to an element.
2. A renderer draws `editor.getViewState()` into that element: `EditorContent` from
   `@gotipe/react` or `@gotipe/vue`, or your own code.
3. Every change is a [transaction](/docs/concepts/transactions).
   [Commands](/docs/concepts/commands) build transactions for you, and
   [events](/docs/concepts/events) tell the interface what changed.
4. Features plug in as [extensions](/docs/concepts/extensions) or managers on the same
   editor. Storage, links and errors go through the [host](/docs/concepts/host) you pass.

## Where to start

| You want to | Read |
|---|---|
| Add a full editor to a React app | [Quick start](/docs/getting-started/quick-start) |
| Edit Markdown files | [PageEditor](/docs/ui/page-editor) |
| Build your own interface | [Document model](/docs/concepts/document-model), then [commands](/docs/concepts/commands) |
| Add your own block type | [Extensions](/docs/concepts/extensions) |
| Pick the JS or WASM engine | [Engines](/docs/getting-started/engines) |
| Edit together in real time | [Collaboration](/docs/collaboration/overview) |
| Render documents on a server | [Server rendering](/docs/conversion/server) |

Next: [install the packages](/docs/getting-started/installation).
