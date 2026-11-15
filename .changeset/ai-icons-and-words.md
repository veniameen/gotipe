---
"@gotipe/ai": patch
"@gotipe/ai-ui": minor
"@gotipe/i18n": minor
"@gotipe/block-editor": patch
---

AI controls draw icons of the shared set and speak the interface's language.

- `@gotipe/ai`: the `/` rows of `defineAiContext`, Continue Writing and Ask AI, have the icon
  `sparkles` instead of the emoji `✨` and `💬`, which the block editor's menu could not draw
  and showed as a letter.
- `@gotipe/block-editor`: the `/` menu shows both with the sparkle and names them in the
  editor's language (`slashMenu.continueWriting`, `slashMenu.askAi`; in Russian «Продолжить
  текст» and «Спросить модель»); the English names stay search aliases. The AI bar's "AI is not
  available in this editor" is the key `ai.unavailable`.
- `@gotipe/ai-ui`: `AiCommandPalette` and `AiToolbar` take their words from
  `GoTipeI18nProvider` of `@gotipe/react`, English without one. `@gotipe/react` is a new peer
  dependency.
- `@gotipe/i18n`: new keys `ai.expand`, `ai.actions`, `ai.commands`, `ai.ask`,
  `ai.searchCommands`, `ai.running`, `ai.noCommands` and `ai.closeCommands` in English and
  Russian; `ai.rewrite`, `ai.summarize`, `ai.fixGrammar` and `ai.translate` are now used.
