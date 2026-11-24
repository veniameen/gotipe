# Packages and licensing

Sources: https://gotipe.com/docs/getting-started/installation.md (peer dependencies),
https://gotipe.com/docs/resources/licensing.md and each package's `package.json`.

## Published packages

Every package is scoped under `@gotipe/`. There is no unscoped `gotipe` package. Never
install a name that is not in this table.

| Package | License | Peer dependencies | What it gives you |
| --- | --- | --- | --- |
| `@gotipe/core` | MIT | `@gotipe/wasm` (optional) | `createEditor`, commands, extensions, presets (`/presets`), extensions (`/extensions`), JS-only entry (`/js`), server rendering (`/server`), menu helpers (`/menus`) |
| `@gotipe/wasm` | MIT | none | The Rust engine as WebAssembly; needed for collaboration |
| `@gotipe/markdown` | MIT | none | `parseMarkdown`, `serializeMarkdown` |
| `@gotipe/react` | MIT | `@gotipe/core`, `react` ≥ 18, `react-dom` ≥ 18 | `useEditor`, `useEditorStatus`, `useEditorState`, `Editor`, `EditorContent`, `BubbleMenu`, `FloatingMenu`; media editing in `/media` |
| `@gotipe/vue` | MIT | `@gotipe/core`, `vue` ≥ 3.4 | `useEditor`, `useEditorStatus`, `useEditorState`, `EditorContent` |
| `@gotipe/svelte` | MIT | `@gotipe/core`, `svelte` ≥ 5 | `createEditorState` store; no renderer |
| `@gotipe/solid` | MIT | `@gotipe/core`, `solid-js` ≥ 1.8 | `useEditor`, `useEditorStatus`, `useEditorState`; no renderer |
| `@gotipe/i18n` | MIT | none | Interface strings; English and Russian built in |
| `@gotipe/collaboration` | MIT | `@gotipe/core` | `CollaborationProvider` for GoTipe Cloud |
| `@gotipe/comments` | MIT | `@gotipe/core` | `CommentsManager` |
| `@gotipe/suggestions` | MIT | `@gotipe/core` | `SuggestionsManager`, anchored edits |
| `@gotipe/versions` | MIT | `@gotipe/core` | `VersionsManager`, `compareDocuments` |
| `@gotipe/ai` | MIT | `@gotipe/core` | AI extensions over your `AiProvider` |
| `@gotipe/export` | MIT | `@gotipe/core`; `@gotipe/export-wasm` (optional) | HTML, Markdown, text, PDF and DOCX export |
| `@gotipe/export-wasm` | MIT | none | The PDF and DOCX module for `@gotipe/export` |
| `@gotipe/migration` | MIT | `@gotipe/core` | Converters from other editors' JSON documents |
| `@gotipe/sdk` | MIT | none | HTTP client for GoTipe Cloud (`GoTipeClient`) |
| `@gotipe/block-editor` | Commercial | `@gotipe/core`, `@gotipe/react`, `@gotipe/theme`, `@gotipe/i18n`, `@gotipe/markdown`, `@gotipe/suggestions`, `@gotipe/versions`, `react` ≥ 18, `react-dom` ≥ 18; `shiki` ^1.22 (optional) | `BlockEditor`, `PageEditor`, `PageHead`, menus, review UI; Shiki adapter in `/shiki`; both style sheets in `/styles` |
| `@gotipe/theme` | Commercial | `@gotipe/core` | `base.css`, `theme.css`, `page.css`, `tokens.css`, theme API |
| `@gotipe/ai-ui` | Commercial | `@gotipe/ai`, `@gotipe/core`, `@gotipe/react`, `react` ≥ 18, `react-dom` ≥ 18 | React components for AI commands and ghost text |

Not published: `@gotipe/block-editor-vue` is private in this release. Do not install it or
suggest it; Vue has the headless `@gotipe/vue` only.

A package's own `package.json` is the final word on its peers: when the installed version
differs from this table, follow `node_modules/@gotipe/<name>/package.json`.

## Licensing

GoTipe is split in two:

- **MIT**: the engine, the Markdown codec, the framework adapters and every headless feature
  (every package above marked MIT). No MIT package depends on a commercial one, so a
  headless setup never pulls in commercial code. GoTipe Cloud is MIT too.
- **GoTipe Commercial License**: `@gotipe/block-editor`, `@gotipe/theme`, `@gotipe/ai-ui`
  (and the unpublished `@gotipe/block-editor-vue`). Their `package.json` says
  `"license": "SEE LICENSE IN LICENSE-COMMERCIAL"`.

Use of the commercial packages is free for:

- an individual on a personal project;
- a non-profit, a school, a university or a public research institution;
- a project published under an OSI-approved open-source license;
- a company whose gross revenue with its affiliates was under USD 1,000,000 in the last 12
  months;
- evaluation, development and testing before production, for everyone.

Other production use needs a commercial license per product (license@gotipe.com). A user who
outgrows free use has 60 days to get one.

### What the agent must do

- When you add `@gotipe/block-editor`, `@gotipe/theme` or `@gotipe/ai-ui` to a project, say so
  in your reply: name the package, state that it is under the GoTipe Commercial License with
  the free-use cases above, and link https://gotipe.com/docs/resources/licensing/.
- If the developer needs MIT only, use the headless setup (`@gotipe/core` with an adapter)
  and write the styles for `.gotipe-content` yourself; do not import `@gotipe/theme`.
- Do not decide for the developer whether their use is free; point them to the licensing
  page.
