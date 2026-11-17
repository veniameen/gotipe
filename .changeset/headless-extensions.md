---
"@gotipe/core": minor
"@gotipe/react": minor
"@gotipe/vue": minor
"@gotipe/block-editor": minor
"@gotipe/migration": minor
"@gotipe/export-wasm": patch
"@gotipe/wasm": patch
---

Ten headless extensions, and the renderers draw every decoration layer.

**@gotipe/core — new extensions** in `@gotipe/core/extensions`. None is in a preset, and
none adds a node or a mark.

- `FindReplace` with `getFindReplace(editor)`: a query with case, whole-word and regex
  options, matches across rich-text blocks (raw-text blocks with `includeRaw`), the current
  match with `next()`/`previous()`, `replace()` and `replaceAll()` (promises) as one undo step
  that keeps the marks of the replaced text, `subscribe()` for a UI, and the `search`
  decoration layer. Regular expressions run in a dedicated Worker that is terminated when the
  time budget runs out (`TIMEOUT`, state `pending` meanwhile); without Workers a static check
  refuses patterns that can backtrack badly (`UNSAFE_PATTERN`).
- `CharacterCount` with `getCharacterCount(editor)`: words and characters (grapheme clusters,
  `Intl.Segmenter` with a fallback), and an optional `limit` enforced by a transaction filter.
  Typing past the limit is cancelled; pasted plain text is cut at a cluster boundary.
- `Typography`: quotes for `en` and `ru`, dashes, ellipsis, arrows, ©®™, fractions and `×`
  as you type, at the caret only and never in code; Undo brings back the typed characters.
- `Autolink` and `LinkOnPaste`: an address typed before a space or Enter, or pasted onto a
  selection or at the caret, becomes a link. `linkHref()` is the address check.
- `MarkdownPaste`: plain clipboard text that is clearly Markdown is pasted as blocks parsed by
  `@gotipe/markdown`, in one undo step, within the editor's schema and with safe addresses.
  Code, a single heading and brackets that are no link to a safe address stay text.
- `TextAlign` with `setTextAlign`, `unsetTextAlign`, `getTextAlign` and `Mod+Shift+L/E/R/J`.
- `TrailingNode`: an empty paragraph after a last block of another type, without an undo step;
  `notAfter` adds types to `paragraph` and the `node` type.
- `InvisibleCharacters` (`setInvisibleCharacters`, `toggleInvisibleCharacters`) and `Focus`:
  the `invisibles` and `focus` decoration layers.

**@gotipe/core — contracts.**

- `Paragraph` and `Heading` declare `align` (`left`, `center`, `right`, `justify`), also in the
  native default schema. HTML output writes `style="text-align:…"`, the same from
  `serializeHtml`, `editor.getHTML()` and the native export. Markdown has no syntax for it:
  `getMarkdown()` writes the block without alignment.
- Extensions may define `transformPastedText(text, context)` and
  `parsePastedText(text, context)` for plain clipboard text; `PasteTextContext` carries the
  schema and the editor's address checks. GoTipe and HTML clipboard data keep their priority.
- A transaction with `metadata: { addToHistory: false }` commits without an undo step.
- `editor.isComposing` tells that the browser is composing text (IME) in the mounted editor.
- Input rules no longer run when a transaction filter rejects the typed character.

**@gotipe/react, @gotipe/vue.** `EditorContent` draws every decoration layer: comment
highlights (`gotipe-comment-highlight`), proposals (`gotipe-suggestion-insert`/`-delete`),
other people's carets and selections (`gotipe-remote-cursor`, `gotipe-remote-range`), ghost
text, the `Placeholder` extension's text and the layers of the new extensions. Vue, which
drew no decorations, now also draws `inline`, `widget`, `node` and `blocks`. Blocks with
`align` get `data-align` and `text-align`. When only a decoration layer changes, the native
caret stays where it was. While the browser composes text, the composing block keeps the
decorations it was drawn with and the native selection is left to the IME.

`EditorContent` (React and Vue) and React's `Editor` take `hostLayers`: decoration layers the
host draws itself and the renderer leaves out. Vue's `EditorContent` also takes `placeholder`.

**Placeholder.** `Placeholder` has no text of its own any more (`text: ""`), and the presets
no longer configure English words. Its decoration asks the renderer for words: React shows
its placeholder in the interface language (`placeholder.*` strings), so `BlockEditor` with
`DefaultPreset` shows “Type / for blocks” in `ru` (“Введите “/” для блоков”) and "Text" in `en`, now also on the
empty document away from the caret. A configured `text` or a host `placeholder` function wins.

**@gotipe/block-editor.** Each collaborator is drawn once. `BlockEditor` takes over the
editor's `collaboration` decoration layer, which the provider fills, and draws those people
with its overlay (Atlas frame 12), together with `remotePeers`; a peer ID in both is drawn
once, and without `remotePeers` the provider's peers still show. `COLLABORATION_LAYER` and
`peersFromDecorations()` are exported for an overlay of your own.

**TrailingNode with collaboration.** The new `beforeCollaboration` editor event fires right
before the first `enableCollaboration` fixes the shared baseline; `TrailingNode` takes back
the paragraph it added to the loaded document there, so every replica starts from the same
document. While collaborating it appends only after the replica's own edit, never after a
remote update, so two people do not each add a paragraph.

**Alignment everywhere.** HTML import reads `text-align` (and `align`) of `<p>` and
`<h1>`–`<h6>`. `setBlockType` between paragraph and heading, and the `#` shortcut, keep
`align`. PDF export aligns paragraph and heading lines (a justified paragraph widens its
spaces, except the last line); DOCX writes `w:jc`. `@gotipe/migration` maps Tiptap's
`textAlign` and Lexical's element `format` to `align` instead of reporting them as unmapped;
Slate's `align` already fits. The migration's schema lookup ignores exports of
`@gotipe/core/extensions` that are not extensions.

**MarkdownPaste and inline atoms.** Pasted `[@Anna](mention:user-1)`, `$x^2$`, inline images
and registered `:emoji:` become atoms when the schema has `Mention`, `InlineMath`,
`InlineImage` or `CustomEmoji` (with the new `customEmoji` option); otherwise the text stays.
