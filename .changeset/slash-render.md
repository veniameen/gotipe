---
"@gotipe/block-editor": patch
---

The "/" menu takes the host's row drawing: `PageEditor`'s `slashMenu.renderIcon` and
`slashMenu.renderMeta`, `BlockEditor`'s `slashRenderIcon` and `slashRenderMeta`. In `SlashMenu`,
`undefined` from either keeps the built-in icon or Markdown shortcut (it used to draw nothing),
and `null` from `renderMeta` shows none. The menu's row and group classes are documented, so a
host can put the description beside the title or hide the group lines in its CSS.
