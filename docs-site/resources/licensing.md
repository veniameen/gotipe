---
title: Licensing
description: Which GoTipe packages are MIT, which are under the GoTipe Commercial License, and what that means for your project.
---

GoTipe is split in two. The engine, the Markdown codec, the framework adapters and every
headless feature are MIT. The ready interface (the block editor, its theme and the AI UI, and
the Vue block editor once it is published) is under the GoTipe Commercial License. Each package states its
license in `package.json` and ships the license file.

## Packages

| Package | License |
|---|---|
| `@gotipe/core`, `@gotipe/wasm`, `@gotipe/markdown` | MIT |
| `@gotipe/react`, `@gotipe/vue`, `@gotipe/svelte`, `@gotipe/solid`, `@gotipe/i18n` | MIT |
| `@gotipe/collaboration`, `@gotipe/comments`, `@gotipe/suggestions`, `@gotipe/versions` | MIT |
| `@gotipe/ai`, `@gotipe/export`, `@gotipe/export-wasm`, `@gotipe/migration`, `@gotipe/sdk` | MIT |
| `@gotipe/block-editor` | Commercial |
| `@gotipe/block-editor-vue` (not published yet) | Commercial |
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

The commercial packages carry `"license": "SEE LICENSE IN LICENSE-COMMERCIAL"` and ship
the full text of the GoTipe Commercial License 1.0.

**Free use.** You pay nothing if you are an individual on a personal project, a non-profit,
a school or a public research institution, an open-source project under an OSI-approved
license, or a company whose revenue with its affiliates was under USD 1,000,000 in the
last 12 months. Evaluation and development before production are free for everyone. If you
outgrow free use, you have 60 days to get a commercial license.

**Commercial license.** Any other production use needs a license for your product. One
license covers every developer on that product and every one of its users; there are no
fees per document, user, server or environment. It is perpetual for the versions released
during your period of updates.

**Both** let you read and modify the source and ship it, in source or compiled form, as part
of your own application. Neither lets you sell the components on their own or build a
competing editor framework, UI kit or theme from them.

To buy a license or ask whether your use needs one, write to
[license@gotipe.com](mailto:license@gotipe.com).

## What needs which

| You use | License |
|---|---|
| `createEditor`, extensions, commands, Markdown, HTML, export, server rendering | MIT |
| `useEditor`, `Editor`, `EditorContent`, `BubbleMenu`, `FloatingMenu` in React | MIT |
| The adapters for Vue, Svelte and Solid | MIT |
| Collaboration, comments, suggestions, versions, the AI provider layer, migration, the Cloud SDK | MIT |
| `BlockEditor`, `PageEditor`, the slash menu, block handle, formatting bubble, review UI | Commercial |
| `BlockEditorVue`, `SlashMenuVue`, `BlockToolbarVue` (not published yet) | Commercial |
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

GoTipe Cloud (`apps/cloud`) is MIT, as `LICENSE-COMMERCIAL` states for everything outside
its four packages. The licenses of its Go dependencies are in `apps/cloud/licenses`.

## Related

- [Installation](/docs/getting-started/installation) · [Introduction](/docs/getting-started/introduction)
- [Theming](/docs/ui/theming) · [React](/docs/frameworks/react) · [Cloud](/docs/cloud/overview)
