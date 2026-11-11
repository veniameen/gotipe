---
"@gotipe/theme": minor
"@gotipe/block-editor": minor
"@gotipe/react": patch
---

Draw the editor from the GoTipe Atlas (frames 1–5): one document in four views.

- Theme tokens take the Atlas values: the system font stack (no web fonts), radii by role
  (4 inline, 6 control, 8 block, 10 overlay, 12 card), the light and dark palettes without
  purple or orange, quiet links in ink with an underline, an ink task box.
- Views are token sets over the same markup: `notion` is the base on `:root` and
  `[data-gt-view]`; `[data-gt-view="docs" | "modern" | "minimal"]` change only what makes
  them. A narrow editor container (640 and 359 px) changes the tokens through `@container`.
  New document tokens: `--gt-page-width`, `--gt-page-pad-*`, `--gt-body-*`, `--gt-h1…h4-*`,
  `--gt-flow-*`, `--gt-indent`, interface sizes `--gt-ui-*`, `--gt-menu-*`, `--gt-handle-*`.
  Older names remain as aliases of the new ones. `tokens.css` now imports the generated
  `tokens/palette.css` and `tokens/views.css`.
- `BlockEditor` takes `view?: ThemePreset` (default `"notion"`) and sets `data-gt-view` on its
  root, which is a size container. The block handle reads `--gt-handle-offset`; a narrow notion
  page keeps a rail for the handle so touch reordering stays available.
- `base.css` draws the document of every view (flow, scale, lists, tasks, quote, callout,
  toggle, columns, placeholders) and skips PageEditor's content, which keeps `page.css`.
  Code, table and image blocks follow the Atlas in their shared style owners.
- Icons replace glyphs: the code block's copy button, the toggle chevron, a callout without
  an emoji shows the icon of its kind, the handle and the theme switch use the GoTipe set.
