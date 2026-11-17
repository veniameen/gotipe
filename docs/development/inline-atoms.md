# Inline elements: atomic marks

Accepted 2026-11-13 (proposed 2026-11-12). Mentions, formulas, and images in a line, and custom emoji are needed:
what ProseMirror and Tiptap do with inline nodes. In GoTipe a block stores
`TextSpan[]`, a string, or nothing (`packages/core/src/types/block.ts`); there are no inline nodes.

## Decision

An inline element is an **atomic mark**: a run of text with a mark whose
`MarkSpec` has `atomic: true`. The run's text is the element's fallback representation:
`@Anna` for a mention, the TeX source for a formula, `:party:` for a custom emoji, the alt for an
image. Ordinary Unicode emoji stay as plain text without a mark.

Both engines guarantee the same things:

1. A selection never lands inside an atom: the position snaps to the nearest edge in the
   direction of movement.
2. An atomic mark is not inherited: text typed at the edge does not get it.
3. A deletion that touches an atom deletes it whole; a mark or replacement that touches an
   atom partially expands to cover the whole atom.
4. `splitBlock` inside an atom moves to the edge.
5. An atom is the largest run with the same atomic mark and the same attributes.
   Adjacent identical atoms are told apart by the `key` attribute.

Rendering draws an atom as a single non-editable element (mark view) with the text as its
accessible name. Each mark defines its Markdown: a mention is
`[@Anna](mention:user-42)`, a formula is `$x^2$`, a custom emoji is `:party:`, an image is
`![alt](src)`.

Suggestions by trigger character (`@`, `:`, `/`) are a shared utility: an extension declares the character
and the source of options, the core sends open, query, and select events; the interface
draws the list.

## Why not inline nodes

Mixed block content changes the JS engine, the Rust transforms, CRDT, the Markdown codec,
the clipboard, and all renderers at once. An atomic mark builds on what
both engines, CRDT, and Markdown already handle: characters with marks. Offsets count
the atom's fallback text; that is its length in the document.

## Consequences

- The document model, history, and the CRDT and clipboard update formats do not change.
- Another user's insertion inside an atom during collaboration is possible only from a
  client without rule 1; the transaction filter strips the atomic mark from foreign text
  inside an atom.
- Search, export, and accessibility see the fallback text: a mention is found by name.
- Rejected: a zero-width placeholder character with attributes. Invisible text
  breaks search, export, and screen reading.

## Implementation

- `MarkSpec.atomic` in TypeScript and Rust (`#[serde(default)]`); the flag goes into the WASM schema;
  in view state an atomic mark carries `atomic: true` (`MarkView`).
- Rules 1–5 exist in two copies with the same tests for both engines:
  `packages/core/src/engine/atoms.ts` and `crates/gotipe-core/src/atoms.rs`. Each step
  is normalized before it is applied: an insertion and `splitBlock` inside an atom move to the nearest
  edge (to the end on a tie), and deletion and marking expand to the whole atom. Rust
  records the normalized steps in `last_steps`, so CRDT and input groups see the
  real effect. Undo restores the atom with a single snapshot.
- Selection: `editor/atom-selection.ts` brings every editor selection (DOM,
  keyboard, transaction, `setSelection`, IME start) to an atom's edge in the direction from the
  previous point (the caret, from the previous head); a range inside a single atom selects
  the whole atom in its own direction. Rust does the same in `with_valid_selection` and for
  a transaction's selection. The check reads the already built view, and costs nothing when the schema
  has no atomic marks. Composition started by the browser inside an atom is inserted
  at the edge to which the model's caret was moved.
- Inheritance: `getMarksAt` does not return an atomic mark, and stored marks
  (`storedMarks`) do not hold it, so typed and composed text does not get it.
- Built-in extensions (not in presets): `Mention`, `InlineMath`, `CustomEmoji`,
  `InlineImage`, with insert commands and `updateAtom` as a single step. Rust schema:
  `gotipe_schema::atoms::with_inline_atoms`.
- Identity: every new atom gets a unique `key`: random for commands and
  HTML import, and by order in the document (`"1"`, `"2"`, …) for the Markdown readers of both
  engines. A paste from the clipboard gives a new key to an atom whose key is already in the document.
  New atom text (`updateAtom` with text) is a new atom with a new key; new
  attributes keep the key. So equal atoms do not merge, even when they become neighbors.
- Markdown (TS and Rust, the shared `markdown-atoms.json`) reads atoms only with the
  `atoms` option; the HTML of both serializers matches per `html-parity.json`, and an atom made of
  several runs is one element. HTML import (`setContent`, paste) reads its own
  HTML back into atoms if the schema declares their mark and an extension provides atom
  support (below), and otherwise falls back to the fallback text.
- Atom support: repair after a collaborative edit and HTML reading are needed only by a
  schema with atoms, so the core does not import them. They come from the extension field
  `atomSupport` (`InlineAtomSupport`, `types/atoms.ts`): the object
  `extensions/atoms/support.ts` belongs to `Mention`, `InlineMath`, `CustomEmoji`, and
  `InlineImage`, and a custom atomic mark takes it from them
  (`atomSupport: Mention.atomSupport`). The core calls the support of the first extension that
  has it. Rules 1–5, selection, and new paste keys apply to any
  atomic mark, with or without it.
- Suggestions: `defineSuggestion` in `@gotipe/core/extensions`; the table of short emoji
  names is a separate entry point, `@gotipe/core/emoji`, outside the core graph.
- Collaboration: the pure function `normalizeRemoteAtoms(before, after, isAtomic,
  known?)` matches atoms by identity (type and `key`) and strips the atomic mark
  only from characters inserted between an atom's former edges, and from an orphaned atom,
  i.e. foreign text left over from an atom deleted here (`known` is the last seen
  text of the atom). New, untouched, shortened, and fully rewritten atoms are left
  alone; so are atoms with an ambiguous identity. Wiring:
  `editor/collaboration.ts` calls the atom support's `repairRemote` after `bridge.receiveUpdate`
  (`editor/remote-atom-repair.ts`), and the editor sends its steps as a
  local transaction with
  `metadata: { addToHistory: false, origin: "repair" }`, so that all replicas receive the
  fix. The `known` memory is updated on every receive and before a local transaction
  for the affected blocks.
- Display (Atlas frames 22–24): React and Vue draw an atom as a single
  `contenteditable="false"` element with `data-gotipe-atom` and `data-type`; the fallback text stays in it,
  hidden, and counts in offsets, while the drawing is a widget. `dom/selection.ts` places the caret at the atom's edge
  next to the element, not in its text. Formulas are rendered by the built-in TeX → MathML converter
  (`@gotipe/core/math`, outside the core graph, allowed elements only). The "@" and ":" lists, the emoji
  picker, and the formula field are in `@gotipe/block-editor/src/atoms` (`atomExtensions()`).
