---
"@gotipe/ai": minor
"@gotipe/block-editor": minor
"@gotipe/i18n": minor
---

The AI status says what runs, and the block editor says it in the interface's language
(D-196).

- `@gotipe/ai`: `aiStatusChange` carries `task`, what the request does (`suggestions`,
  `completion`, `rewrite`, `continue`, `paragraph`, `proofread`, `review`, `command`). A
  finished proofread or review ends with `{ active: false, task, count }`, `count` being how
  many suggestions or comments it found; a review used to end with `{ active: false }`
  alone. `label` keeps its English words ("Proofreading...", "Found 3 suggestions") and the
  message of a failure, so hosts that show it as it is work as before. New types `AiStatus`
  and `AiTask` name the core's type of the event and the codes of `task`.
- `@gotipe/block-editor`: `AiStatusIndicator` says the task by the new keys `ai.status.*`
  (in Russian «Модель проверяет правописание…» instead of "Proofreading..."), `command` by
  `ai.processing`. A status of the host's own without a known `task` still shows its
  `label`; without one it says `ai.processing` instead of "Using AI toolkit...".
  `blockEditorEn` and `blockEditorRu` have the new keys.
- `@gotipe/i18n`: `BlockEditorTranslationKey` names the keys `ai.status.*`.
