---
"@gotipe/core": minor
"@gotipe/theme": minor
---

Removes API that nothing in GoTipe used or raised.

**@gotipe/theme.** `defineIcons`, the types `IconSet` and `IconName`, and
`ThemeConfig.componentOverrides` are gone. No component read them, so a theme that set them
changed nothing. The editors' icons and components are replaced through the editor itself
(`blockViews`), and the look through `--gt-*` tokens, as before. Delete the calls and fields from
your code; `defineTheme`, `applyTheme`, `setTheme`, `getTheme`, `onThemeChange`, `lightTheme`
and `darkTheme` are unchanged.

**@gotipe/core.** `GoTipeErrorCode` no longer lists `SCHEMA_ERROR`, `UNKNOWN_BLOCK_TYPE` and
`UNKNOWN_MARK_TYPE`. No engine raised them; a document or step the schema refuses reports
`VALIDATION_ERROR`. If your `onError` or `error` listener compares `error.code` with one of the
three, remove that branch. The package also drops source modules no entry point reached (the
accessibility helper classes, a windowing helper and a browser-side HTML sanitizer): none was
exported, so imports and bundle sizes do not change.
