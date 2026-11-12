---
"@gotipe/block-editor": minor
"@gotipe/theme": minor
"@gotipe/i18n": minor
"@gotipe/react": patch
"@gotipe/core": patch
---

Finish the GoTipe Atlas in BlockEditor: the page's head, the editor's states, tooltips with keys,
code colours and the editor's own language.

- `PageHead` (icon, plain-text title, the host's byline, the read-only sign with its reason) goes
  into the new `BlockEditor` `header` prop. An empty page offers quick blocks (`starters`, on in
  the notion and docs views); while `editor` is null the editor shows the page's skeleton;
  errors the editor reports become a toast at the top (`EditorErrorToast`), and the control that
  failed keeps its message for screen readers only. `EditorSkeleton`, `EditorErrorToast` and
  `EditorStarters` are exported.
- Toolbar buttons show a tooltip with their key; menus show the bound keys of block types. Keys
  are the core's own bindings, checked by a test.
- The model's command bar opens with ⌘J; ⌘K is the link, as in the Atlas.
- `BlockEditor` takes `highlight`. `@gotipe/block-editor/shiki` adds `gotipeCodeTheme` (colours
  from `--gt-syn-*`, one theme for light and dark), `codeLanguages` and `codeLanguageAliases`.
- BlockEditor and the document's blocks take their strings from `@gotipe/i18n`: English stays as
  it was, `ru` follows the Atlas. New keys cover placeholders, the bubble, link, colours, menus,
  the handle, the slash menu's names and groups, the model's bar, suggestions, the head and the
  states.
- A new callout has no emoji by default (JS and Rust schemas alike) and shows the glyph of its
  kind; documents keep the emoji they have.
