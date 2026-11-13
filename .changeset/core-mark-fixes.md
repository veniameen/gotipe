---
"@gotipe/core": patch
"@gotipe/react": patch
"@gotipe/wasm": patch
---

Mark commands, mark attributes and Markdown input rules work as documented, the same in the JS
and WASM engines.

- Mark commands format every rich-text block a selection covers — list items, nested items and
  table cells included — and pass over lists, tables, dividers, images and code blocks.
  `selectAll().toggleBold()` no longer throws `VALIDATION_ERROR` in a document with a list or a
  table. Toggling removes a mark only when every selected character has it; `isActive()` and the
  toolbar's `activeMarks` still report the marks at the start of the selection.
- An `addMark` step replaces a mark of the same type in place, so `setMark`, `setLink` and the
  colour picker change a link address or a colour in one undo step. Adding a mark removes the
  other marks of its `exclusiveGroup` (superscript and subscript); text inserted with several
  marks of one type or group keeps the last. Mark spans whose attributes differ only in key
  order merge in the JS engine as they do in WASM.
- Commands write declared attribute defaults into the blocks and marks they create: `setLink`
  stores `target` and `rel`, `insertBlockAfter("callout")` stores `type: "info"`. Steps you
  dispatch are applied as written. `toggleHighlight()` without a colour still stores a
  colourless highlight (the theme's `<mark>`): `Highlight` declares no default colour.
- A new code block is plain text with an empty `language`: `setBlockType("codeBlock")`, the
  ```` ``` ```` shortcut without a language and HTML `<pre><code>` without a `language-` class
  write a bare fence and a bare `<pre><code>` (the `CodeBlock` default was `"plain"`). The
  React language menu shows Plain text for an empty language, `plain` and `plaintext`, and
  writes an empty language when chosen.
- `Heading.configure({ levels })` is read: input rules, `Mod+Alt+N`, the "/" menu and
  `setBlockType`/`insertBlockAfter` create only the configured levels; other levels in loaded or
  pasted content stay. `FullPreset` lists `Heading` once. `AttrSpec.values` may list numbers to
  limit what commands create.
- `**text**`, `*text*`, `~~text~~` and `` `text` `` typed up to the caret, anywhere in a block,
  become formatted text without the delimiters; one undo brings them back. The opening delimiter
  must start a word, so `2*3*` stays text. Text committed by an IME composition is not
  converted. An input rule handler may return `false` to let the next rule try, and the built-in
  rules do so when a transaction filter cancels their change.
- `ChainableCommands` takes the editor's command schema as its second argument; the earlier
  `allowsChild(parentType, childType)` function is still accepted.
