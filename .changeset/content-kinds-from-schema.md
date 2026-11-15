---
"@gotipe/core": patch
---

Commands and the JS engine take a block's content kind from the editor's schema, as the Rust
engine does (D-05).

- `insertBlockAfter`, `insertBlockBefore` and `setBlockType` work for your own node types. A
  new block of a `rawText` type starts with `""` and one of an `empty` type with `null`;
  `setBlockType` keeps the text as raw text without marks, or drops it for a type without
  content, as for the built-in `codeBlock`, `math` and `divider`. Before, the commands chose
  by built-in type names, gave your types rich text and failed schema validation.
- The JS engine converts content in a `setBlockType` step, and gives text to a block without
  content in `insertText`, `splitBlock` and `mergeBlocks` steps, by the `content` the type
  declares. Typing into your own `rawText` block whose content is `null` works; text inserted
  into a block of an `empty` type is rejected with `TRANSFORM_ERROR` on both engines (it was
  `VALIDATION_ERROR`).
- On the JS engine a `setBlockType` step from a block without content, such as a divider, to
  a rich-text type gives `content: []`, as on WASM, instead of `null`.
- In an editor without a schema (`extensions: []`) no type declares a content kind. A
  `setBlockType` step leaves the content as it is on both engines: the JS engine used to turn
  rich text into a string for `codeBlock` and `math`, and WASM did not. A block that
  `insertBlockAfter` or `insertBlockBefore` adds there gets rich text, `[]`, also for
  `codeBlock`, which got `""` before.

With any preset the built-in types behave as before.
