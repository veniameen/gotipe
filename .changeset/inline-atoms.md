---
"@gotipe/core": minor
"@gotipe/wasm": minor
"@gotipe/markdown": minor
---

Inline atoms: mentions, inline formulas, custom emoji and inline images.

**@gotipe/core, @gotipe/wasm.** A mark spec may set `atomic: true`: its text is one inline element whose text is the fallback. Both engines keep the caret off atoms (keyboard, pointer, `setSelection`, IME), never extend an atom with typed text, delete and format whole atoms, move `insertText` and `splitBlock` to an atom's edge, and undo an atom as one unit. Atomic marks carry `atomic: true` in the view state. New extensions, in no preset: `Mention`, `InlineMath`, `CustomEmoji`, `InlineImage`, with `insertMention`, `insertInlineMath`, `insertCustomEmoji`, `insertInlineImage`, `findAtom`, `updateAtom` and friends. `defineSuggestion` is a headless controller for `@`/`:` menus with open/update/select/close events, keyboard hooks and cancellation of stale async results. The emoji shortcode table is the separate entry `@gotipe/core/emoji` (`searchEmoji`, `emojiSource`). Every new atom has a unique `key`, so equal atoms never join; a pasted copy gets a new one. After a collaboration update the editor repairs text a remote client typed into an atom (a transaction with `metadata.origin: "repair"`, not undoable); `normalizeRemoteAtoms` is the pure function behind it. `setContent` and HTML paste read the atom HTML back. The repair and the HTML read-back come from the new extension field `atomSupport` (type `InlineAtomSupport`), which the four atom extensions carry, so `@gotipe/core` does not load them for an editor without atoms; an extension with its own atomic mark reuses theirs (`atomSupport: Mention.atomSupport`). HTML writes mentions and formulas as `<span data-type>` and emoji and inline images as checked `<img>`.

**@gotipe/markdown.** `parseMarkdown(text, { atoms })` reads `[@Anna](mention:user-42)`, `$x^2$` (pandoc rules), registered `:name:` and inline `![alt](src)`; the writer writes them and escapes typed dollars that would open a formula. Without `atoms` reading is unchanged.
