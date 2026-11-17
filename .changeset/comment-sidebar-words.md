---
"@gotipe/i18n": minor
"@gotipe/block-editor": minor
---

`CommentSidebar` and the block editor's menus speak the interface's language; the
dictionaries hold only keys that a component uses (D-34).

- `@gotipe/block-editor`: `CommentSidebar` takes its words from `GoTipeI18nProvider`, English
  without one: new keys `comments.*` (heading, filters, navigation, thread actions, reply
  form, empty states, the orphaned quote) in English and Russian; a failed action without
  its own message says `error.comment`. The formatting bubble is named by
  `a11y.toolbarLabel` (“Форматирование текста” in Russian, "Text formatting" as before), and
  the block and table menus fall back to `block.actionFailed` and `table.actionFailed`
  instead of English text. `blockEditorEn` and `blockEditorRu` have the new keys.
- `@gotipe/i18n`: removed keys that no component drew, so overriding them changed nothing:
  `toolbar.highlight`, `toolbar.heading`, `toolbar.table`, `toolbar.image`,
  `toolbar.divider`, `placeholder.empty`, `placeholder.slashCommand`, `slashMenu.file`,
  `comments.add`, `ai.complete`, `a11y.editorLabel`, `format.label`, `format.link`,
  `format.linkPlaceholder`, `page.placeholder.*`, `block.image`, `block.file`,
  `block.codeLanguage`, `block.menu`, `block.moveUp`, `block.moveDown`, `slash.menuLabel`,
  `slash.empty`, `slash.group.media`, `slash.group.basic`, `review.now`, `review.editing`,
  `table.addRowShort`, `table.addColumnShort`, `media.fileSourceTabs` and `media.fileNote`.
  Use the keys the components read: `placeholder.paragraph`, `slashMenu.menu`,
  `slashMenu.empty`, `slashMenu.group.*` and `block.handle`. `comments.resolve`,
  `comments.reply` and `comments.delete` moved to the block editor's tables, which
  `withBlockEditorStrings` puts under every `I18n`. `a11y.toolbarLabel` is now
  "Text formatting".
