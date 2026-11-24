# Content and features

Sources: https://gotipe.com/docs/concepts/content-formats.md,
https://gotipe.com/docs/concepts/host.md, https://gotipe.com/docs/collaboration/overview.md,
the review pages under https://gotipe.com/docs/review/, https://gotipe.com/docs/ai/overview.md
and https://gotipe.com/docs/conversion/overview.md.

## Content in and out

The document JSON is the only lossless format; store it when every attribute and block ID
matters. HTML, Markdown and plain text are conversions.

| Format | In | Out |
| --- | --- | --- |
| JSON | `createEditor({ content })`, `editor.setContent(doc)` | `editor.getJSON()` |
| HTML | `content: html`, `editor.setContent(html)`; browser only | `editor.getHTML()`, `serializeHtml(blocks, options)`, `renderToHtml()` |
| Markdown | `parseMarkdown(text).doc` from `@gotipe/markdown`, then `setContent` | `editor.getMarkdown()`, `renderToMarkdown()` |
| Plain text | build paragraphs as JSON | `editor.getText()`, `renderToText()` |

- A string passed to `content` or `setContent` is always read as HTML. Parse stored JSON
  first: `editor.setContent(JSON.parse(json))`.
- `setContent(doc, { preserveSelection, addToHistory })` validates the whole document and
  throws `VALIDATION_ERROR` without changing anything. By default it clears undo history.
- Markdown the editor cannot map to blocks (HTML, footnotes, link definitions, inline images)
  parses to `markdownRaw` blocks and `mdRaw` marks. A schema without them rejects such
  documents; the content-formats page shows the `MarkdownRaw` extension to add.
  `parseMarkdown` also returns a `snapshot`; `serializeMarkdown(doc, snapshot)` writes
  untouched blocks back byte for byte.
- For editing Markdown files in React, prefer `PageEditor`, which does all of this.
- On a server, `@gotipe/core/server` exports `renderToHtml(doc, options)`,
  `renderToMarkdown(doc)`, `renderToText(doc)` and `createHeadlessEditor({ extensions })`;
  they take a document object, not a string.

## Host

The host is how the editor reaches the application. Pass it as `createEditor({ host })` (or
`useEditor({ host })`) or as the `host` prop of `PageEditor`. Every member is optional.

```ts title="host.ts"
import { type EditorHost, GoTipeError } from "@gotipe/core";

export const host: EditorHost = {
  async saveAsset(file, { name }) {
    const body = new FormData();
    body.append("file", file, name);
    const response = await fetch("/api/assets", { method: "POST", body });
    if (!response.ok) throw new GoTipeError("ASSET_SAVE_FAILED", `Upload failed: ${response.status}`);
    const { path } = (await response.json()) as { path: string };
    return { src: path, name };
  },
  resolveAsset(src) {
    return /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : `/api/assets/${encodeURIComponent(src)}`;
  },
  onError(error) {
    console.warn(error.code, error.message);
  },
};
```

| Member | Purpose |
| --- | --- |
| `saveAsset(file, { kind, name, mediaType, size })` | Store a pasted, dropped or picked file; return `{ src, name? }`. Without it, files up to 10 MiB become `data:` URLs and larger ones fail with `ASSET_TOO_LARGE`. |
| `resolveAsset(src)` | Turn a stored `src` into a URL to show; return `null` when unavailable. |
| `discardAsset(asset)` | A stored file that was then not inserted. |
| `openLink(href, { blockId, newTab, target })` | Open a link the user activated; unsafe schemes are blocked before it runs. |
| `onError(error)` | Every reported `GoTipeError` (`code`, `message`, `details`). |
| `imageSources` | Image catalogs searched in the React image dialog. |

Images must be PNG, JPEG, GIF or WebP. Calls you make (`createEditor`, `setContent`,
`dispatch`) throw; errors from user actions go to `host.onError` and the `error` event.
`BlockEditor` shows a toast unless `errorToast={false}`.

## Features

### Collaboration

Needs the WASM engine and `@gotipe/wasm`:

```sh
npm install @gotipe/core @gotipe/wasm @gotipe/collaboration
```

`CollaborationProvider` from `@gotipe/collaboration` speaks the protocol of GoTipe Cloud, a Go
backend the application runs itself (https://gotipe.com/docs/cloud/overview.md). GoTipe does
not operate a hosted instance. The flow: load the document over Cloud's REST API, create the
editor from `collaboration_state.baseline` with `engine: "wasm"`, then connect:

```ts
const provider = new CollaborationProvider({
  documentId,
  wsUrl, // the Cloud sync endpoint, wss://…/sync
  initialState, // collaboration_state from GET /v1/documents/{id}
  token: getToken,
  user: { name: "Alice", color: "#3264ab" },
  onError: (error) => console.warn(error.message),
});
provider.connect(editor);
editor.mount(element);
// on close: provider.destroy(); editor.destroy();
```

Without Cloud, the editor's own methods (`enableCollaboration`, `getCollaborationUpdate`,
`receiveCollaborationUpdate`) carry updates over a transport the application writes. Every
replica must start from the same baseline. `PageEditor` and `@gotipe/core/js` cannot join a
session. Comments, suggestions and versions are not replicated. `BlockEditor` draws remote
cursors from the provider. Details: https://gotipe.com/docs/collaboration/provider.md.

### Comments, suggestions, versions

| Package (MIT) | Core API | Ready UI in `@gotipe/block-editor` (commercial) |
| --- | --- | --- |
| `@gotipe/comments` | `CommentsManager`, `defineComments`, `getCommentsManager` | `CommentSidebar` |
| `@gotipe/suggestions` | `SuggestionsManager`, `defineSuggestions`, `getSuggestionsManager`; anchored edits for model output | `SuggestionToolbar`, `BlockEditor` suggestion props, `PageEditor` `review` |
| `@gotipe/versions` | `VersionsManager`, `defineVersions`, `getVersionsManager`, `compareDocuments` | `VersionHistory` |

Managers keep their records in memory; the application stores and shares them (for
versions, `exportState()` and `loadState()`). Read
https://gotipe.com/docs/review/comments.md, suggestions.md, versions.md and model-edits.md
for the options and a full example of each.

### AI

`npm install @gotipe/ai`. The application implements an `AiProvider` that calls its own
backend (or GoTipe Cloud's AI proxy); the package ships no vendor SDK. Add
`defineAi.configure({ provider })`, `defineAiContext` and `defineAiAgent` to `extensions`.
Without a provider every command fails. `BlockEditor` shows the AI controls when these
extensions are present; `@gotipe/ai-ui` (commercial) has standalone React components. Read
https://gotipe.com/docs/ai/provider.md before writing a provider.

### Export

```sh
npm install @gotipe/core @gotipe/export
npm install @gotipe/export-wasm # only for PDF and DOCX
```

`@gotipe/export` exports `exportToHtml`, `exportToMarkdown`, `exportToPlainText` (synchronous)
and `exportToPdf`, `exportToDocx` (asynchronous); each takes an editor. In Node, use a
headless editor from `@gotipe/core/server`. GoTipe imports no DOCX or PDF. `@gotipe/migration`
converts other editors' JSON documents. See https://gotipe.com/docs/conversion/overview.md.
