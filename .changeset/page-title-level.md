---
"@gotipe/block-editor": minor
"@gotipe/theme": patch
---

The page title can be any heading level. `PageEditor` drew the file's leading `# heading` as an
`h1` and `PageHead` its title as another `h1`, so a host page with its own `h1` had two or three.
Both take `titleLevel` (`1`–`6`, default `1`); the title looks the same at every level, and the
other headings of the file keep their levels. `createPageBlockViews` takes `titleLevel` too, and
the type `PageTitleLevel` is exported.

**@gotipe/theme.** The page title is styled by its class (`.gotipe-page-title`), not by the `h1`
tag, and the block after it keeps the spacing after an `h1`.
