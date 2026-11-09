---
"@gotipe/block-editor": minor
"@gotipe/theme": minor
---

`PageEditor`: a wiki page on a Markdown file — Notion-like blocks and «/» menu, tables with column types, model suggestions with lane cursors (Specimen v6 look).

- Markdown in and out through `@gotipe/markdown`; untouched blocks keep their bytes.
- `ReviewLayer`, `ReviewBar`, `LaneAvatars`, `ReviewApi` (accept/reject one or all, comments with replies, stale detection, reveal ≤ 1.5 s honouring `prefers-reduced-motion`).
- `@gotipe/theme/page.css`: every colour, size, font, radius and shadow of the page is a `--gt-*` token; light and dark.
- Shiki is no longer a dependency: pass a highlighter to `CodeBlockView`, or use the lazy `@gotipe/block-editor/shiki` adapter (JavaScript regex engine, no WASM).
- `SlashMenu` takes `groups`, `renderIcon`, `renderMeta`, `labels`.
