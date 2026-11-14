---
"@gotipe/react": minor
"@gotipe/i18n": minor
"@gotipe/block-editor": minor
---

An app that uses only `@gotipe/react` no longer loads the image and file editing UI or the block editor's strings: the React entry's import graph shrinks from 45,634 to 31,859 gzip bytes.

**@gotipe/react.** Image and file editing (upload, link, resize, crop, caption, alt text, preview and the image actions menu) moves to the new MIT entry `@gotipe/react/media`. Without it, `EditorContent` shows images and files read-only: the picture with its width and caption, the failed state, and a file card whose name opens or downloads the file. To edit them, provide the entry: `<MediaBlocksContext.Provider value={mediaBlocks}>` with `mediaBlocks` from `@gotipe/react/media`. `ImageBlock` and `FileBlock` are now exported from `@gotipe/react/media` instead of `@gotipe/react`; `MediaBlocksContext`, `MediaBlocks` and `MediaBlockProps` are new in `@gotipe/react`.

**@gotipe/i18n.** `en` and `ru` carry only the strings `@gotipe/react` draws and the shared words (178 keys). The 266 strings of the block editor's own interface (toolbar, slash and formatting menus, block menu, review, page, history, find, status line, alignment, fonts, invisibles, emoji, mentions, formula editing, table menus) move to `@gotipe/block-editor`. `TranslationKey` still names every key: it is `BaseTranslationKey | BlockEditorTranslationKey`. A `Locale` needs every base key and may carry block editor keys, so `{ ...en, "find.label": "Search" }` still overrides a block editor string. The plural keys (`PluralKeyBase`) are block editor keys.

**@gotipe/block-editor.** Ships `blockEditorEn` and `blockEditorRu` (`BlockEditorLocale`). `BlockEditor`, `PageEditor` and every component of the package put these strings under the host's `I18n`: a string of the host's dictionaries wins, then the package's table of the current language, then English. `withBlockEditorStrings(i18n)`, `useBlockEditorI18n()` and the `BlockEditorStrings` provider expose this layering; `pageBlockCommands` and `pageSlashGroups` apply it to the `I18n` they are given. `BlockEditor` and `PageEditor` provide `@gotipe/react/media`, so their image and file features are unchanged. An `I18n` that is not made by `createI18n` must return the key itself for a missing key.
