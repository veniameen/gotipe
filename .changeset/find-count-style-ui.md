---
"@gotipe/core": minor
"@gotipe/react": minor
"@gotipe/vue": minor
"@gotipe/block-editor": minor
"@gotipe/theme": minor
"@gotipe/i18n": minor
"@gotipe/wasm": patch
"@gotipe/export-wasm": patch
---

Find, the counter, alignment, fonts, invisible characters and text direction in the interface
(GoTipe Atlas, frames 25–28).

- `@gotipe/core`: marks `fontFamily` (`system` | `serif` | `mono`, names of theme faces) and
  `fontSize` (whole px, 6–96; commands clamp to 10–48 by default) in the `FontFamily` and `FontSize`
  extensions with `setFontFamily`/`unsetFontFamily`/`getFontFamily`,
  `setFontSize`/`unsetFontSize`/`getFontSize`; the block attribute `dir` (`ltr` | `rtl` | `auto`)
  on paragraphs, headings, list items and tasks with `TextDirection`,
  `setTextDirection`/`unsetTextDirection`/`getTextDirection`. Both engines and the Rust default
  schema; HTML writes and reads them byte-identically with the native port; Markdown cannot hold
  them (untouched blocks keep their bytes, edited ones drop them). `ToolbarState.activeMarkAttrs`.
- `@gotipe/react`, `@gotipe/vue`: font marks drawn as `.gotipe-font[data-font]` and a px size;
  text blocks get `dir="auto"` unless their `dir` says otherwise.
- `@gotipe/block-editor`: the find and replace bar (`Mod+F`, `Mod+Alt+F` while the editor has
  focus; `find` prop, `FindBar`, `FIND_KEYS`); the words and characters line with a limit, warning
  tone, reason tooltip and the over-limit tint (`status` prop on `BlockEditor` and `PageEditor`,
  `StatusLine`, `OVER_LIMIT_LAYER`); an Alignment group in the bubble's More menu; `AlignPicker`,
  `FontFamilyPicker`, `FontSizeStepper`, `InvisiblesToggle` for fixed toolbars; the handle of a
  right-to-left block in the right gutter. `PageEditor` installs `FindReplace` and
  `CharacterCount`.
- `@gotipe/theme`: tokens `--gt-find*`, `--gt-over-limit`, `--gt-font-serif`, `--gt-radius-match`,
  `--gt-status-gap`, `--gt-size-field-w`, `--gt-space-mark-shift` (light and dark, narrow layout of
  the bar) and `find.css`, `status.css`, `text-style.css`.
- `@gotipe/i18n`: strings of the bar, the counter (plural forms), alignment, fonts and the ¶ switch
  in English and Russian.
