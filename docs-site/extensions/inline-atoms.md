---
title: Inline atoms and suggestions
description: Work with mentions, formulas, emoji and images as inline atoms, learn their Markdown and HTML forms, and build suggestion menus for @ and : triggers.
packages: ["@gotipe/core", "@gotipe/react", "@gotipe/vue", "@gotipe/block-editor"]
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

The table is grouped by the picker's categories: `EMOJI_CATEGORIES` (`people`, `nature`, `food`, `activities`, `travel`, `objects`, `symbols`, `flags`) and `EMOJI_TABLE[category]`. `emojiItems(category)` lists one category, `findEmoji("🎉")` finds an entry by its character (a missing or extra U+FE0F still matches) and every item carries its `category`. `searchEmoji(query, limit, names)` also matches localized names: `@gotipe/core/emoji/ru` exports `EMOJI_NAMES_RU` (shortcode → Russian name), so `searchEmoji("пра", 8, EMOJI_NAMES_RU)` finds 🎉 “праздник” (“celebration”) and ✅ “правильно” (“correct”). A name's start or the start of one of its words ranks first; `ё` and `е` are the same letter.

## How atoms look

`EditorContent` of `@gotipe/react` and `@gotipe/vue` draws each atom as one element with `contenteditable="false"`, `data-gotipe-atom` and `data-type` (GoTipe Atlas, frames 22–24). The fallback text stays inside it, visually hidden, so offsets, search and screen readers keep working; the drawing beside it is a widget (`data-gotipe-widget`) whose text does not count.

| Atom | Element | Drawing |
| --- | --- | --- |
| `mention`, `kind: "user"` | `span.gotipe-mention[data-kind="person"]` | initials on one of the person colours, then the name |
| `mention`, `kind: "page"` | `span.gotipe-mention[data-kind="page"]` | the page glyph, then the underlined title |
| `inlineMath` | `span.gotipe-math-inline[role="math"]`, `aria-label` = the TeX | MathML in the document font (below) |
| `inlineMath` that cannot be read | `.gotipe-math-inline.is-invalid[aria-invalid="true"]` | the TeX on a red tint; the reason in a tooltip under the pointer |
| `customEmoji` | `span.gotipe-emoji-custom[role="img"]`, `aria-label` = `:name:` | the image at the size of a letter; `:name:` in a tooltip |
| `inlineImage` | `span.gotipe-inline-image[role="img"]`, `aria-label` = the alt | the image |

Formulas are drawn only when the view has a TeX reader, so a host without formulas never loads the converter. `BlockEditor` and `PageEditor` give it; with `EditorContent` of React pass `parseTex` through `MathRendererContext`, with Vue through the `math` prop (`errorText` words the reason in your language; the English message otherwise):

```tsx title="content.tsx"
import { parseTex } from "@gotipe/core/math";
import { EditorContent, MathRendererContext } from "@gotipe/react";

<MathRendererContext.Provider value={parseTex}>
  <EditorContent editor={editor} />
</MathRendererContext.Provider>;
```

```ts title="content.vue.ts"
h(EditorContent, { editor, math: { parse: parseTex, errorText: (error) => t(error.code) } });
```

Without it a formula is its TeX in `span.gotipe-math-inline`, and a math block shows its source.

Image addresses go through the same check as image blocks (`toSafeImageSrc`, exported from `@gotipe/core/extensions`); an unsafe one shows the fallback text. An unknown atomic mark is drawn as its text in `span.gotipe-atom`. The look comes from `@gotipe/theme` (`theme/atoms.css`); the Vue adapter uses the same classes.

The caret steps over an atom with the arrow keys, Backspace and Delete take it whole, and a click before or after a chip puts the caret there: the DOM selection maps the edge of an atom element to the position before or after it, never into its text.

### Formulas

`@gotipe/core/math` is GoTipe's own TeX → MathML converter, outside the core bundle. `parseTex(tex, { display? })` returns `{ ok: true, math }` with a tree of allowed MathML elements, or `{ ok: false, error }` with `code`, `detail`, `from`, `to` and an English `message`. `mathToDOM(math, document)` and `mathToString(math)` build DOM elements or escaped markup from that tree only; `isMathElement` validates a tree you got elsewhere. See [Math](/docs/extensions/math#rendering-formulas) for the supported TeX.

## The block editor's interface

`@gotipe/block-editor` adds the lists and popovers of frames 22–24. Create the editor with `atomExtensions()` and give `BlockEditor` the data:

```tsx title="editor.tsx"
import { BlockEditor, atomExtensions } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";

const mentions = {
  // people first, then pages; a newer query aborts `signal`
  items: (query: string, { signal }: { signal: AbortSignal }) => directory.search(query, { signal }),
};

export function DocumentEditor() {
  const editor = useEditor({ extensions: [FullPreset, ...atomExtensions()] });
  return (
    <BlockEditor
      editor={editor}
      mentions={mentions}
      emoji={{ custom: [{ name: "gotipe", src: "/emoji/gotipe.png" }], onRecentChange: saveRecent }}
    />
  );
}
```

`atomExtensions()` is the four atom marks plus `MentionSuggestion` (`@`), `EmojiSuggestion` (`:`), `EmojiCommand` (`/` → Emoji) and `InlineMathCommands` (`/` → Inline formula and `$…$`). Russian emoji names (`@gotipe/core/emoji/ru`) load on first use, only with a Russian interface. `PageEditor` takes the same `mentions` and `emoji` props: the `:` list and the picker are always on there, mentions only with `mentions` (written as `[@name](mention:user-id)` or `[title](mention:page-id)` and read back); inline formulas are not part of a Markdown page.

| Prop | Type | Description |
| --- | --- | --- |
| `mentions` | `{ items(query, { signal }): MentionItem[] \| Promise<MentionItem[]> }` | People and pages. `MentionItem` is `{ id, label, kind?: "user" \| "page" }`. Without it the list answers “No one found”. |
| `emoji.custom` | `{ name, src }[]` | The team's emoji: in the `:` list after the Unicode ones and in the picker's last tab. |
| `emoji.recent` | `string[]` | Recent emoji to start with: characters, or `:name:` for custom ones. |
| `emoji.onRecentChange` | `(recent: string[]) => void` | Called after each insert with the new list, newest first (at most 18). The list itself lives in memory. |

The lists, the picker and the formula popover are described in [Menus and controls](/docs/ui/menus#mentions-emoji-and-formulas). `AtomProvider` (the TeX reader and the host data), `AtomUI`, `MentionMenu`, `EmojiMenu`, `EmojiPicker` and `MathPopover` are exported for an editor of your own, and `requestAtomUI(editor, request)` opens the picker or the popover from your code.

## Collaboration

A client without these rules can type into an atom. After every `receiveCollaborationUpdate` the editor repairs that: text inserted between the old edges of an atom — the same type and `key` — loses the atomic mark, and so does the text left of an atom that was deleted here while a peer typed into it. New atoms, atoms rewritten as a whole and untouched atoms are kept. The repair is a local transaction with `metadata: { addToHistory: false, origin: "repair" }`, so every replica receives it and it is not undone. The pure function behind it, `normalizeRemoteAtoms(before, after, isAtomic, known?)`, is exported from `@gotipe/core/extensions`.

The repair and the HTML read-back come with the extensions: `Mention`, `InlineMath`, `CustomEmoji` and `InlineImage` carry `atomSupport`, so an editor without atoms does not load that code. An extension with its own atomic mark gets the repair by reusing theirs: `defineExtension({ name: "tag", marks: [...], atomSupport: Mention.atomSupport })`. The rules in the table above apply to every atomic mark either way.

## Limitations

- Svelte and Solid adapters still draw atoms as their text.
- The Vue adapter draws the same elements but has no lists, picker or formula popover.
- Atoms without a `key` (documents written before keys) that meet can still join.
- An atom deleted here is recognised as an orphan only when this editor saw it while collaborating.
- An atom shortened by a remote deletion keeps its mark with the shorter text.
