---
title: Find and replace
description: FindReplace searches the document, keeps the matches and the current one up to date, replaces as one undo step and highlights matches through a decoration layer.
packages: ["@gotipe/core"]
license: MIT
---

`FindReplace` is search without UI: you set a query, read the matches and the current one, move between them and replace. Matches are highlighted through the `search` decoration layer, which the React and Vue renderers draw. The find bar itself is yours to build.

```ts title="search.ts"
import { createEditor } from "@gotipe/core";
import { FindReplace, getFindReplace } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({ extensions: [DefaultPreset, FindReplace] });
const search = getFindReplace(editor)!;
const counter = document.querySelector<HTMLElement>("#search-count")!;

search.subscribe((state) => {
  counter.textContent = `${state.position} of ${state.total}`;
});
search.setSearch({ query: "colour" });
search.next();
await search.replace("color");
```

`FindReplace` is in no preset. `getFindReplace(editor)` returns the editor's search, or `null` when the extension is not installed or the editor is destroyed.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `includeRaw` | `boolean` | `false` | Also search raw-text blocks: code, formulas, raw Markdown. |
| `maxMatches` | `number` | `1000` | Most matches found and highlighted. Beyond it the state is `truncated`. |
| `timeout` | `number` | `200` | Milliseconds one search may take before it stops with `TIMEOUT`. A regular expression's Worker is terminated then. |
| `matchClass` | `string` | `"gotipe-match"` | Class of every match. |
| `currentClass` | `string` | `"is-current"` | Added to the class of the current match. |

## Search

| Method | Description |
| --- | --- |
| `setSearch({ query, caseSensitive, wholeWord, regex })` | Changes the fields you pass and searches. The current match becomes the first one at or after the caret. Returns the new state. |
| `clear()` | Empties the query, the matches and the highlights. |
| `next()`, `previous()` | Move the current match, wrapping at the ends. Return the match or `null`. |
| `selectCurrent()` | Puts the editor selection on the current match. |
| `replace(text)` | Replaces the current match and moves to the next one. Waits for a running search first. Resolves to `false` when there is no match or the editor is read-only. |
| `replaceAll(text)` | Replaces every match, including those beyond `maxMatches`. Waits for a running search first. Resolves to the number replaced. |
| `getState()` | The current state. The object is replaced, never changed, so it works with `useSyncExternalStore`. |
| `subscribe(listener)` | Calls `listener(state)` after every change. Returns a function that stops it. |

| State field | Type | Description |
| --- | --- | --- |
| `query`, `caseSensitive`, `wholeWord`, `regex` | | The search as set. All flags are `false` at first. |
| `matches` | `{ blockId, from, to }[]` | Matches in document order; offsets are UTF-16 units of the block's text. |
| `index` | `number` | Index of the current match, `-1` without matches. |
| `position` | `number` | The current match counted from 1, `0` without matches. |
| `total` | `number` | Number of matches found. |
| `truncated` | `boolean` | More than `maxMatches` exist. |
| `error` | `{ code, message } \| null` | `INVALID_PATTERN`, `UNSAFE_PATTERN` or `TIMEOUT`; the matches are empty. |
| `pending` | `boolean` | A regular expression is being searched in its Worker. `matches` holds the matches of the blocks searched already; those of changed blocks follow. |

How matching works:

- A match never spans blocks. Rich-text blocks are searched; raw-text blocks only with `includeRaw`.
- Without `caseSensitive` letters match by Unicode case: `журнал` finds `ЖУРНАЛ`, `ё` finds `Ё`.
- `wholeWord` refuses a match that touches a letter, a digit, a combining mark or `_` on either side.
- A match never starts or ends inside a surrogate pair. Empty matches are skipped.
- The matches follow the document: after every change, undo, `setContent` or remote update they are found again, and the current match stays on its text when the text is still there.

## Regular expressions

With `regex: true` the query is a JavaScript regular expression with the `u` flag. An invalid pattern gives `INVALID_PATTERN`.

JavaScript cannot interrupt a running expression, and a pattern such as `(a+){8}x` or `.*.*.*x` can run for minutes on one paragraph. So regular expressions run in a dedicated Worker, never on the page: the state is `pending` until it answers, and when the time budget runs out the Worker is terminated and the state is `TIMEOUT`. The page stays responsive all the while. After a change, only the changed blocks are searched again, and the matches of the others stay. Plain queries cannot backtrack and run on the page.

Where a Worker cannot start (server rendering, a test environment without `Worker`, a Content Security Policy without `worker-src blob:`), regular expressions run on the page after a static check, which refuses with `UNSAFE_PATTERN` what may backtrack badly:

- a quantifier that may repeat (`+`, `*`, `{2}`, `{1,30}`) on a group that can match the same text in more than one way: `(a+)+`, `(a?){25}`, `(a|aa)*`, `(\w+\s?)*`, `(.*a){12}`;
- two repetitions that can trade a character, with only optional atoms or atoms that match that character between them: `a*a*`, `.*.*`, `\w+\s?\w+`, `.*a.*`.

Alternatives that are words of which none starts another, as in `(cat|dog)+`, or that start with different characters are allowed. The check is conservative: it also refuses some harmless patterns, such as `foo.*bar.*baz`.

In regex mode the replacement is a template: `$1`, `$<name>` and `$&` stand for groups and the whole match, `$$` for a dollar sign.

```ts
search.setSearch({ query: "(\\d{4})-(\\d\\d)-(\\d\\d)", regex: true });
await search.replaceAll("$3.$2.$1");
```

## Replacing

A replacement is one transaction and one undo step, for one match or for all of them. The new text takes the marks of the first character it replaces, so replacing a bold word leaves a bold word. A match that covers only a part of an atomic inline element, such as a mention, is left alone.

## Highlights

The matches are `inline` decorations in the layer `search` (`editor.getDecorations("search")`). The renderers wrap each match in a `<span>`:

| Match | Class | Attributes |
| --- | --- | --- |
| Any | `gotipe-match` | `data-gotipe-search-match="<index>"` |
| Current | `gotipe-match is-current` | also `data-gotipe-search-current` |

> [!NOTE]
> The themes do not style these classes yet. Until they do, add your own rules for `.gotipe-match` and `.gotipe-match.is-current`.

To scroll to the current match, find `[data-gotipe-search-current]` in `editor.element` and call `scrollIntoView` on it.

## Limitations

- The search is not normalized: a letter written with a combining mark does not match its single-character form.
- Without a Worker, a pattern that passes the static check can still be slow on a very long block (`.*x` is quadratic); the time budget is checked between matches and blocks, but cannot stop one running match.
- A replacement in regex mode runs the expression once more on the page, at each match the Worker found.
- Replacing inside a mention or another atomic element is not possible; replace the whole element.

## The find bar of BlockEditor

`BlockEditor` and `PageEditor` from `@gotipe/block-editor` draw the find bar of the GoTipe Atlas (frame 25) when the editor has `FindReplace`. `PageEditor` installs the extension itself; for `BlockEditor` add it to the editor's extensions. Turn the bar off with `find={false}`, or put `<FindBar editor root>` into your own layout.

```tsx title="find.tsx"
import { BlockEditor } from "@gotipe/block-editor";
import { FindReplace } from "@gotipe/core/extensions";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";

export function Page() {
  const editor = useEditor({ extensions: [FullPreset, FindReplace] });
  return <BlockEditor editor={editor} />;
}
```

The bar is docked at the top right of the editor and stays there while the page scrolls. It holds the query with “3 of 12” at its end, switches for match case, whole word and regular expression, previous and next, close, and a second row with the replacement, **Replace** and **Replace all**. A query that finds nothing tints the field and disables the arrows; an invalid or unsafe pattern says why in the field's title and to screen readers. In a container narrower than 640 px the bar spans it and its tools step under the field.

| Key | Where | Action |
| --- | --- | --- |
| `Mod+F` | in the editor or the bar | Opens the bar with the selected text (one block) or the last query, and selects the field. |
| `Mod+Alt+F` | in the editor or the bar | Opens the bar with the replace row. |
| `Enter`, `Shift+Enter` | query field | Next and previous match. The current match scrolls into view. |
| `Enter`, `Mod+Enter` | replacement field | Replace the current match; replace all. |
| `Escape` | anywhere in the bar | Closes the bar, clears the highlights, selects the current match and returns the keys to the text. |

`Mod+F` and `Mod+Alt+F` are taken only while the focus is in the editor or the bar, so the browser's own search works everywhere else on the page. `Mod+H` is not used: it hides the window on macOS. The keys are read by their physical position, so they work in any keyboard layout. `FIND_KEYS` exports them.

The theme draws every match with `--gt-find` and the current one with `--gt-find-current` and a `--gt-find-ring` hairline (`packages/theme/src/theme/find.css`); the bar's size and the narrow layout are `--gt-find-*` tokens. `--gt-find-sticky-top` moves the docked bar below a host's own sticky header.

## Related

- [Extensions](/docs/concepts/extensions#plugins-and-decorations): decoration layers.
- [Transactions](/docs/concepts/transactions): steps and history.
