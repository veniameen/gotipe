---
"@gotipe/block-editor": minor
"@gotipe/theme": minor
"@gotipe/markdown": minor
"@gotipe/i18n": minor
"@gotipe/core": patch
---

PageEditor moves onto the shared views (GoTipe Atlas, frame 19). Breaking for hosts that styled the
old page markup.

- `PageEditor` is BlockEditor with a Markdown session and the model's proposals. The bubble, «/»,
  the block handle and menu, and the column menu are the shared ones. It takes `view` (`notion` by
  default, the owner's choice; `docs`, `modern`, `minimal`), `blockViews` for the host's own views
  and shows no toast of its own when the host handles `onError`. The file's leading `# heading` is
  the page's title (`.gotipe-page-title`); raw Markdown blocks are `.gotipe-raw`.
- The `docs` view shows its outline (frame 2): a sticky column of the page's headings beside the
  page, the current section marked, gone on narrow containers. New tokens: `--gt-outline-*`.
- `BlockEditor` takes `blockViews`, `slashCommands`, `ariaLabel` and `errorToast`. Every table
  header has the column menu of frame 9 (type, a row or a column more, the column away);
  `TableColumnButton` is exported. Page commands use the shared «/» groups and icons.
- `@gotipe/theme`: the `page` theme is gone. `page.css` stays and loads `base.css` + `theme.css`.
  Review marks, cards, cursors and the review bar are drawn by `theme/review.css` on the shared
  tokens. The palette is no longer re-declared on `.gotipe-page`, so a host's `--gt-*` on a
  container reach the content in both themes.
- The SpecOrbit-specific «Инструкции для агента» callout is gone: the Markdown codec reads such a
  quote as a plain blockquote (files still round-trip byte for byte), the page has no agent
  command or glyph, and `block.agentInstructions*` / `slash.agentInstructions` keys are removed.
  `agent` stays in the core callout enum, deprecated; such a callout serializes as `> [!NOTE]`.
- `calloutKind` no longer reads `Object.prototype` members as alerts.
