---
"@gotipe/block-editor": patch
---

`PageEditor` gives the host more control without workarounds:

- `ref.flush()` sends a draft not yet emitted to `onChange` at once and returns the Markdown;
  call it before saving. `onChange` still comes at most once a frame.
- `ref.setMarkdown(text)` replaces the document even when `text` equals the last `markdown`
  value (for example a revert to the file on disk), as an undoable external edit without
  `onChange`.
- `icon` and `header` draw a page head above the title in the text column (`.gotipe-page-head`).
- `slashMenu: { commands, groups, descriptions }`: the host's commands (a list, or a function over
  the page's own), group order and labels, and an opt-in hint under each command's name.
  `BlockEditor` gets `slashGroups` and `slashDescriptions`, `SlashMenu` gets `descriptions`.
- `reviewLayout: "auto" | "inline" | "margin"` (default `"auto"`, today's width rule).
- `narrow={false}` (also on `BlockEditor`) keeps the wide view sizes, or the host's own, in a
  container up to 640 px wide.
- `undoableReplace={false}` (and `setMarkdown(text, { addToHistory: false })`) loads an external
  text without an undo step: the history is cleared, e.g. while the host shows an earlier version.
