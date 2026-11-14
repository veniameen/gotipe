---
title: Character count
description: CharacterCount counts words and characters as readers see them and can enforce a character limit on typing and paste.
packages: ["@gotipe/core"]
license: MIT
---

`CharacterCount` keeps the number of words and characters of the document and, with a `limit`, refuses changes that would exceed it. It has no UI: read the counts and subscribe to changes.

```ts title="counter.ts"
import { createEditor } from "@gotipe/core";
import { CharacterCount, getCharacterCount } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset, CharacterCount.configure({ limit: 280 })],
});
const count = getCharacterCount(editor)!;
const status = document.querySelector<HTMLElement>("#status")!;

const show = () => {
  const { words, characters, limit } = count.getState();
  status.textContent = `${words} words · ${characters} / ${limit}`;
};
count.subscribe(show);
show();
```

`CharacterCount` is in no preset. `getCharacterCount(editor)` returns `null` when the extension is not installed or the editor is destroyed.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `limit` | `number \| null` | `null` | Most characters the document may hold. `null` counts without a limit. |
| `locale` | `string` | Platform default | Locale for word boundaries. |

## Counts

| Method | Description |
| --- | --- |
| `getState()` | `{ characters, words, limit, remaining }`. `remaining` is `limit - characters`, negative above the limit and `null` without one. |
| `characters()`, `words()` | The two numbers alone. |
| `subscribe(listener)` | Calls `listener(state)` when a count changes. Returns a function that stops it. |
| `fit(text)` | `text` cut to the characters that still fit, counting the selection a paste would replace. |

What is counted:

- **Characters** are grapheme clusters: `👍🏽`, a flag or a letter with a combining accent count once. All text counts, including code; the boundaries between blocks do not, a line break inside a block does.
- **Words** come from `Intl.Segmenter` with the `locale`. On a platform without it, a word is a run of letters and digits, with an inner apostrophe, hyphen or dot.

The same counters are exported for plain text: `countCharacters(text)`, `countWords(text, locale?)`, `countText(text, locale?)` and `fitCharacters(text, max)`.

## Limit

With a `limit` the extension registers a transaction filter (see [filters](/docs/concepts/transactions#filters)):

- A change that leaves the document within the limit is accepted.
- A change that adds characters beyond it is cancelled as a whole: `dispatch` returns `false`, and typing does nothing. Text is never cut inside a cluster or a surrogate pair.
- A change that does not add characters is accepted even above the limit, so a document loaded too long can still be shortened.
- Plain text pasted from the clipboard is cut to what fits, at a cluster boundary, and then inserted. Pasted HTML, content copied from a GoTipe editor and the results of [paste rules](/docs/concepts/extensions#paste-rules) are not cut: over the limit they are cancelled.

`setContent`, Undo, Redo and remote updates are not filtered. After them `remaining` may be negative.

## Limitations

- A filter makes every local `dispatch` build detached copies of the document before and after the change. On very large documents set a `limit` only where you need it.
- A cancelled change gives no signal of its own. To tell the user, compare `remaining` with `0`.

## Related

- [Transactions](/docs/concepts/transactions#filters): transaction filters.
- [Extensions](/docs/concepts/extensions#pasted-text): the `transformPastedText` hook this extension uses.
