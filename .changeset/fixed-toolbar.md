---
"@gotipe/block-editor": minor
"@gotipe/theme": minor
"@gotipe/i18n": minor
---

`FixedToolbar`: the toolbar over the document of the `modern` view (GoTipe Atlas, frame 31).
Undo and redo, the block type, the font and size, the marks with link and colour, alignment,
lists, Insert and ¶, in one `toolbar` with one Tab stop: the arrows, Home and End move between
the tools. A tool that is on is pressed; a tool that can't act now stays focusable as
`aria-disabled` and its tooltip says why (nothing to undo, read-only, code takes no formatting,
the block takes no alignment, the smallest or largest size, a table cell). When the bar is too
narrow, whole groups move to More, a second bar under its button, the least needed first; the
bar measures its own width, not the window. Insert lists the blocks and media of the `/` menu
and adds the block after the caret's block in one undo step. The font tools and ¶ show only
when the editor has `FontFamily` and `FontSize`, or `InvisibleCharacters`. Props: `editor`,
`hide`, `label`, `children` (the host's own tools at the end), `className`; the type
`FixedToolbarTool` is exported.

`AlignPicker`, `FontFamilyPicker`, `FontSizeStepper`, `BlockTypeDropdown`, the bubble's link and
colour buttons say why they are unavailable instead of going grey without a reason.
`BlockTypeDropdown` takes `lists` (default `true`): `false` keeps the list out of its name and
menu, for a toolbar with its own list buttons.

**@gotipe/theme.** `toolbar.css` in `theme.css`: the sticky bar, its separators and More; the
token `--gt-toolbar-row-gap`. An unavailable tool fades its glyphs, not the tooltip with its
reason.

**@gotipe/i18n.** New block editor keys: `toolbar.label`, `toolbar.insert`, `toolbar.moreTools`,
`toolbar.readOnly`, `toolbar.noFormatting`, `toolbar.noText`, `toolbar.nothingToUndo`,
`toolbar.nothingToRedo`, `align.unavailable`, `font.smallest`, `font.largest`,
`editor.blockTypeInCell`, with English and Russian strings in `@gotipe/block-editor`.
