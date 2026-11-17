---
"@gotipe/i18n": minor
"@gotipe/react": minor
"@gotipe/block-editor": patch
---

The document and the menus of `@gotipe/react` are named in the interface's language (D-195).

- `@gotipe/react`: without `ariaLabel`, `EditorContent` and `Editor` take the document's
  name from `GoTipeI18nProvider` (`a11y.editorLabel`), `BubbleMenu` takes
  `a11y.toolbarLabel` and `FloatingMenu` takes `a11y.insertLabel`. Without a provider they
  are English as before: "Document content", "Text formatting" and "Insert block".
  `FloatingMenu` has a new `ariaLabel` prop; an `ariaLabel` still wins over the dictionary.
- `@gotipe/block-editor`: `BlockEditor` without `ariaLabel` names its document in the
  interface's language (“Содержимое документа” in Russian).
- `@gotipe/i18n`: new keys `a11y.editorLabel` and `a11y.insertLabel` in English and Russian.
  A dictionary of your own typed as `Locale` needs them too.
