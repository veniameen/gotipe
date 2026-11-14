---
title: Inline atoms and suggestions
description: Mentions, inline formulas, custom emoji and inline images as atomic marks, their commands, Markdown and HTML, and the headless suggestion utility for @ and : menus.
packages: ["@gotipe/core"]
license: MIT
---

GoTipe has no inline nodes. A mention, an inline formula, a custom emoji or an image inside a line is **text with an atomic mark**: a mark whose spec has `atomic: true`. The text is the atom's fallback — `@Anna`, the TeX source, `:party:`, the alt text — and it is what search, copy, export and screen readers see. Unicode emoji are plain text and need no mark.

```ts title="atoms.ts"
import { createEditor } from "@gotipe/core";
import {
  CustomEmoji,
  InlineImage,
  InlineMath,
  Mention,
  insertInlineMath,
  insertMention,
} from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset, Mention, InlineMath, CustomEmoji, InlineImage],
});

insertMention(editor, { id: "user-42", label: "Anna" }); // "@Anna"
insertInlineMath(editor, "x^2");
```

None of the four is in a preset. Each declares one mark; a document that uses the mark needs the extension, as with any mark.

## Atomic marks

Any extension can declare one: `marks: [{ name: "tag", attrs: { … }, rank: 300, atomic: true }]`. Both engines (JavaScript and Rust/WASM) guarantee the same behaviour:

| Rule | What happens |
| --- | --- |
| One element | An atom is the longest run of text with the same atomic mark and equal attributes, `key` included. Every new atom gets a unique `key` — from the insert commands, HTML import and the Markdown readers — and a pasted copy of an atom gets a new one, so two equal atoms never join, even side by side. |
| Caret | A selection never ends inside an atom. The keyboard, the pointer and `setSelection` move it to the atom's edge in the direction of movement (from before the atom to its end, from after it to its start), otherwise to the nearer edge. A range within one atom — a double click, a drag — selects the whole atom. |
| Typing | Text typed at an edge does not get the atomic mark: atoms are never inclusive, and an atomic mark is never kept as a stored mark. An IME composition the browser starts inside an atom is committed at the edge the caret moved to. |
| Deleting | A deletion that touches part of an atom removes all of it. Backspace after an atom removes the atom. |
| Formatting | `addMark` and `removeMark` over part of an atom apply to the whole atom. Removing the atomic mark itself leaves the fallback text as plain text. |
| Inserting and splitting | `insertText` and `splitBlock` at an offset inside an atom move to its nearer edge (a tie goes to the end). |
| Undo | The atom comes back as one unit. |

Offsets stay UTF-16 offsets of the text; an atom's length is the length of its fallback text. An offset inside a surrogate pair that lies inside an atom is moved to the edge like any other.

In the view state an atomic mark has `atomic: true` (`MarkView.atomic`), so a renderer can draw the atom as one non-editable element with its text as the accessible name. The React and Vue renderers draw the fallback text for now.

## Built-in atoms

| Extension | Mark | Attributes | Text |
| --- | --- | --- | --- |
| `Mention` | `mention` | `id` (required), `label` (required), `kind`: `"user"` (default) or `"page"` | `@label` for a user, `label` for a page |
| `InlineMath` | `inlineMath` | — | The TeX source |
| `CustomEmoji` | `customEmoji` | `name` (`[A-Za-z0-9_+-]+`), `src` | `:name:` |
| `InlineImage` | `inlineImage` | `src` (required), `alt` (default `""`), `width`, `height` | The alt text, else the file name, else `image` |

Every mark also takes the optional `key`.

## Commands

| Command | Description |
| --- | --- |
| `insertMention(editor, { id, label, kind? }, range?)` | Inserts a mention at the selection, or over `range` (`{ blockId, from, to }`, for example a suggestion's trigger and query). |
| `insertInlineMath(editor, tex, range?)` | Inserts a formula. Empty TeX is refused. |
| `insertCustomEmoji(editor, { name, src }, range?)` | Inserts `:name:`. A bad name or an unsafe address is refused. |
| `insertInlineImage(editor, { src, alt?, width?, height? }, range?)` | Inserts an image. The address is checked like an image block's. |
| `getMention(editor, at?)`, `getInlineMath(editor, at?)`, `findAtom(editor, markType, at?)` | The atom at the caret (or at `{ blockId, offset }`): `{ blockId, from, to, text, mark }`, or `null`. |
| `updateMention(editor, mention, attrs)` | Changes `id`, `label` or `kind`; a new label rewrites the text. |
| `updateInlineMath(editor, formula, tex)` | Replaces the TeX. |
| `updateAtom(editor, atom, attrs, text?)` | Any atom: attributes left out keep their value, `null` removes one. New attributes keep the atom's `key`; new text makes a new atom with a new `key`. |

Each command is one transaction and one undo step, keeps the formatting of the text before the atom, and leaves the caret after it. They return `false` and change nothing when the editor is read-only or the input is refused.

## Markdown and HTML

| Atom | Markdown | HTML |
| --- | --- | --- |
| Mention | `[@Anna](mention:user-42)` | `<span data-type="mention" data-kind="user" data-id="42" data-label="Anna">@Anna</span>` |
| Inline formula | `$x^2$` | `<span data-type="math">x^2</span>` |
| Custom emoji | `:party:` | `<img data-type="emoji" alt=":party:" src="…">` |
| Inline image | `![alt](src)` inside a paragraph | `<img src="…" alt="…" width="…" height="…">` |

`editor.getMarkdown()` and `editor.getHTML()` write them on both engines, and the Rust exporter writes the same bytes. An atom whose text has several formats is still one element, with the formats inside it. An attribute that cannot be written safely (no mention id, an unsafe address) leaves the fallback text. `setContent(html)` and pasted HTML read these elements back into atoms when the editor declares their marks; otherwise they become their fallback text, and an inline `<img>` stays in its paragraph when there is no image block. Reading Markdown back is opt-in through `parseMarkdown(text, { atoms })`; the formula rule, escaping of typed dollars and the emoji registry are described in [Markdown](/docs/conversion/markdown#inline-atoms).

## Suggestions

`defineSuggestion` is a headless controller for menus opened by a character — `@` for mentions, `:` for emoji. The core sends events; your UI draws the list.

```ts title="mentions.ts"
import { defineSuggestion, insertMention } from "@gotipe/core/extensions";

const mentions = defineSuggestion<{ id: string; label: string }>({
  char: "@",
  items: async (query, { signal }) =>
    (await fetch(`/api/people?q=${encodeURIComponent(query)}`, { signal })).json(),
  onSelect: (person, { editor, range }) => insertMention(editor, person, range),
});

const editor = await createEditor({ extensions: [DefaultPreset, Mention, mentions] });
const stop = mentions.on((event) => {
  if (event.type === "open" || event.type === "update") menu.show(event.state);
  if (event.type === "close") menu.hide();
});
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `char` | `string` | — | The trigger. |
| `items` | `(query, { signal, editor }) => Item[] \| Promise<Item[]>` | — | Items for a query. Give `items` or `source`. |
| `source` | `{ search(query, { signal }) }` | — | A reusable item source, such as `emojiSource`. |
| `onSelect` | `(item, { editor, range, query }) => void` | — | Called on Enter or `select()`. `range` covers the trigger and the query. |
| `allowSpaces` | `boolean` | `false` | Let the query hold single spaces (never a leading one or a line break). |
| `startOfWord` | `boolean` | `true` | The trigger must start the block or follow whitespace. |
| `maxQueryLength` | `number` | `50` | Longer queries close the menu. |
| `name` | `string` | `suggestion:<char>` | Extension name; two suggestions with different characters coexist. |

Events are `open` and `update` with `state` (`query`, `range`, `items`, `selectedIndex`, `loading`, `rect` — the caret rectangle, `null` when the editor is not mounted), `select` with the item, and `close` with a reason: `escape`, `select`, `caret` (the caret left the trigger), `blur` (the editor lost focus) or `destroy`. A trigger typed inside an atom or inline code does not open a menu.

While a menu is open, ArrowDown and ArrowUp move the selection, Enter selects and Escape closes; while the items of a new query load, Enter chooses nothing, so a stale item is never inserted; otherwise the keys keep their usual meaning, and the slash menu (`/`) works as before. Each query aborts the previous request through its `signal`; a late answer never replaces a newer one. A failing request shows no items and is reported as `EXTENSION_ERROR`. `state(editor)`, `move(editor, ±1)`, `select(editor, index?)` and `close(editor)` drive the same controller from your UI.

### Emoji shortcodes

The Unicode shortcode table is a separate entry, so it is not part of the core bundle:

```ts title="emoji.ts"
import { emojiSource, searchEmoji } from "@gotipe/core/emoji";

const emoji = defineSuggestion({
  char: ":",
  source: emojiSource, // { name, emoji } items, prefix matches first
  onSelect: ({ emoji }, { editor, range }) =>
    editor.dispatch({
      steps: [
        { type: "deleteText", blockId: range.blockId, from: range.from, to: range.to },
        { type: "insertText", blockId: range.blockId, offset: range.from, text: emoji, marks: [] },
      ],
      selection: { type: "cursor", blockId: range.blockId, offset: range.from + emoji.length },
    }),
});
```

For your own emoji, return `{ name, src }` items and select them with `insertCustomEmoji(editor, item, range)`.

## Collaboration

A client without these rules can type into an atom. After every `receiveCollaborationUpdate` the editor repairs that: text inserted between the old edges of an atom — the same type and `key` — loses the atomic mark, and so does the text left of an atom that was deleted here while a peer typed into it. New atoms, atoms rewritten as a whole and untouched atoms are kept. The repair is a local transaction with `metadata: { addToHistory: false, origin: "repair" }`, so every replica receives it and it is not undone. The pure function behind it, `normalizeRemoteAtoms(before, after, isAtomic, known?)`, is exported from `@gotipe/core/extensions`.

The repair and the HTML read-back come with the extensions: `Mention`, `InlineMath`, `CustomEmoji` and `InlineImage` carry `atomSupport`, so an editor without atoms does not load that code. An extension with its own atomic mark gets the repair by reusing theirs: `defineExtension({ name: "tag", marks: [...], atomSupport: Mention.atomSupport })`. The rules in the table above apply to every atomic mark either way.

## Limitations

- Atoms render as text until the atom views are designed; a host can render `MarkView.atomic` marks itself.
- Atoms without a `key` (documents written before keys) that meet can still join.
- An atom deleted here is recognised as an orphan only when this editor saw it while collaborating.
- An atom shortened by a remote deletion keeps its mark with the shorter text.
