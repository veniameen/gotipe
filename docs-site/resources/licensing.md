---
title: Licensing
description: Which GoTipe packages are MIT, which are under the GoTipe Commercial License, and what that means for your project.
---

GoTipe is split in two. The engine, the Markdown codec, the framework adapters and every
headless feature are MIT. The ready interface (the block editor, its theme, the Vue block
editor and the AI UI) is under the GoTipe Commercial License. Each package states its
license in `package.json` and ships the license file.

## Packages

| Package | License |
|---|---|
| `@gotipe/core`, `@gotipe/wasm`, `@gotipe/markdown` | MIT |
| `@gotipe/react`, `@gotipe/vue`, `@gotipe/svelte`, `@gotipe/solid`, `@gotipe/i18n` | MIT |
| `@gotipe/collaboration`, `@gotipe/comments`, `@gotipe/suggestions`, `@gotipe/versions` | MIT |
| `@gotipe/ai`, `@gotipe/export`, `@gotipe/export-wasm`, `@gotipe/migration`, `@gotipe/sdk` | MIT |
| `@gotipe/block-editor` | Commercial |
| `@gotipe/block-editor-vue` | Commercial |
| `@gotipe/ai-ui` | Commercial |
| `@gotipe/theme` | Commercial |

The Rust crates (`gotipe-core`, `gotipe-crdt`, `gotipe-export` and the others) are MIT.
No MIT package depends on a commercial one, so a headless setup never pulls commercial
code in.

## MIT

The MIT License lets you use, copy, modify, merge, publish, distribute, sublicense and
sell the software, in open or closed products, free of charge. Keep the copyright notice
and the license text with copies or substantial portions of it. The software comes without
warranty. The full text is in `LICENSE-MIT` at the root of the repository and in each
package's `LICENSE` file.

## Commercial

The commercial packages carry `"license": "SEE LICENSE IN LICENSE-COMMERCIAL"`. That file
says the software may be used only under the terms of the GoTipe Commercial License
Agreement. The agreement itself is not part of the repository or the packages.

To get a commercial license, or to ask whether your use needs one, write to
[license@gotipe.com](mailto:license@gotipe.com).

## What needs which

| You use | License |
|---|---|
| `createEditor`, extensions, commands, Markdown, HTML, export, server rendering | MIT |
| `useEditor`, `Editor`, `EditorContent`, `BubbleMenu`, `FloatingMenu` in React | MIT |
| The adapters for Vue, Svelte and Solid | MIT |
| Collaboration, comments, suggestions, versions, the AI provider layer, migration, the Cloud SDK | MIT |
| `BlockEditor`, `PageEditor`, the slash menu, block handle, formatting bubble, review UI | Commercial |
| `BlockEditorVue`, `SlashMenuVue`, `BlockToolbarVue` | Commercial |
| `@gotipe/ai-ui` components | Commercial |
| The stylesheets and tokens of `@gotipe/theme` | Commercial |

The MIT packages ship no CSS. With them alone you style the editor yourself: blocks are
plain HTML elements inside `.gotipe-content`, each with `data-block-id` and
`data-block-type`. The table bars and resize handles, the image and file controls and the
menu primitives of `@gotipe/react` are MIT; their look comes from `@gotipe/theme` or from
your CSS.

## Third-party notices

Some MIT packages contain third-party data, listed in their `THIRD_PARTY_NOTICES.md` and
`licenses/` folder:

- `@gotipe/markdown`: the HTML named character table, from CPython (Python license).
- `@gotipe/wasm`: the same table, Unicode range data from the Rust regex project (MIT) and
  the notices of the Rust libraries in its WebAssembly binary.
- `@gotipe/export-wasm`: the Rust libraries in its WebAssembly binary and the bundled
  fonts: Libertinus Serif and Noto Emoji (SIL OFL 1.1), New Computer Modern (GUST Font
  License), DejaVu Sans Mono (Bitstream Vera and DejaVu licenses).

Keep these files when you redistribute the packages.

> [!NOTE]
> The self-hosted Cloud server (`apps/cloud`) is not on the commercial list and has no
> license file of its own; `LICENSE-COMMERCIAL` states that all other packages in the
> repository are MIT. Its Go dependencies' licenses are in `apps/cloud/licenses`. Ask
> [license@gotipe.com](mailto:license@gotipe.com) if you need this confirmed in writing.

## Related

- [Installation](/docs/getting-started/installation) · [Introduction](/docs/getting-started/introduction)
- [Theming](/docs/ui/theming) · [React](/docs/frameworks/react) · [Cloud](/docs/cloud/overview)
