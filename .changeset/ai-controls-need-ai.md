---
"@gotipe/core": minor
"@gotipe/block-editor": minor
---

The AI controls of `BlockEditor` show only where an AI extension answers them. Without
`defineAi` there is no Improve button, no ⌘J (the key stays the browser's), no ghost text and
no status line, whatever `showAiCommandBar` says. Improve needs `defineAi` and
`defineAiContext`. The command bar needs `defineAi` with `defineAiAgent` or `defineAiContext`,
or with your own `onAiCommand`; with the context but no agent it sends `askAi`, every prompt
adds a paragraph, and Ask AI of `defineAiContext` opens it. `AiPreset` has all of them. The
exported `AiCommandBar`, `GhostText`, `AiStatusIndicator` and the Improve button of
`BlockEditorBubbleMenu` (`enableAI`) follow the same rule, so `showAiCommandBar={false}` is no
longer needed in an editor without AI.

`editor.hasExtension(name)` is new in `@gotipe/core`: whether the editor was created with an
extension of that name, alone or in a preset. The answer is fixed for the editor's life and the
same on both engines.
