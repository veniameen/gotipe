---
"@gotipe/core": minor
"@gotipe/react": minor
---

JS engine and host API for strict-CSP hosts.

- `createEditor({ engine: "auto" | "wasm" | "js" })`; new entry `@gotipe/core/js` with the same API and no reference to `@gotipe/wasm` (now an optional peer).
- `EditorHost`: `saveAsset`, `resolveAsset`, `openLink`, `onError`; `editor.reportError`, `editor.openLink`, `toSafeHref`; events `error`, `editableChange`, `decorationsChange`.
- Read-only at runtime: `setEditable` / `isEditable`. Links never navigate: Cmd/Ctrl+click (or any click when read-only) goes through `host.openLink`.
- `setContent(doc, { preserveSelection, addToHistory })` keeps the caret and never steals focus.
- Decoration layers (`setDecorations`): inline ranges, widgets, node classes, phantom blocks; widget text never counts in offsets (`createTextWalker`).
- IME composition (CJK, dead keys) is committed once from the DOM; shortcuts match the physical key on non-Latin layouts.
- React: decorations in `TextRenderer`, `blockViews` and `placeholder` on `Editor`/`EditorContent`, `GoTipeI18nProvider`, image and file blocks through the host.
