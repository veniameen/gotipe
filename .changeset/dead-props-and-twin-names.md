---
"@gotipe/block-editor": minor
"@gotipe/ai-ui": minor
"@gotipe/suggestions": minor
---

Declared-but-dead API is gone or works, and twin names are told apart.

- `@gotipe/block-editor`: `showCollaborationCursors` works. It defaults to `true`; `false` draws
  no other people's carets and selections, neither of `remotePeers` nor of the editor's
  `collaboration` layer. The toolbar's item type is now `ToolbarSuggestion`, apart from the
  tracked change `Suggestion` of `@gotipe/suggestions`; the earlier name `Suggestion` stays as a
  deprecated alias.
- `@gotipe/ai-ui`: the controlled ghost text is `AiGhostText` (props `AiGhostTextProps`), apart
  from `GhostText` of `@gotipe/block-editor`; `GhostText` and `GhostTextProps` stay as deprecated
  aliases.
- `@gotipe/suggestions`: `SuggestionState` is `"tracking" | "off"`. `"viewing"` was declared but
  `getState()` never returned it; code that compared with it never matched.
