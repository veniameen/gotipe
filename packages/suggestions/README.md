# @gotipe/suggestions

Track changes for the GoTipe editor, plus anchored edits for changes proposed by a model or
another service. While tracking is on, `SuggestionsManager` records every local edit as a
pending suggestion that can be accepted or rejected; `applyAnchoredEdits` applies edits that
name their place by the surrounding text instead of by offsets.

[Docs](https://gotipe.com/docs/review/suggestions/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/suggestions @gotipe/core
```

## Usage

```ts
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { SuggestionsManager } from "@gotipe/suggestions";

const editor = await createEditor({ extensions: [DefaultPreset] });
editor.mount(document.querySelector<HTMLElement>("#editor")!);

const review = new SuggestionsManager(editor, {
  enabled: true, // record local edits from the start
  authorId: "u-1",
  authorName: "Alice",
});
review.subscribe(() => console.log(review.getPendingSuggestions()));

// Later, for example from your own review UI. Both throw PROPOSAL_STALE when the
// recorded text was edited again.
review.acceptAll(); // or review.rejectAll(), acceptSuggestion(id), rejectSuggestion(id)
```

Anchored edits work on any string, in the browser, on a server or in a model runtime:

```ts
import { type AnchoredEdit, applyAnchoredEdits } from "@gotipe/suggestions";

const page = "# Plan\n\nThe release is planned for May.\n";
const edits: AnchoredEdit[] = [
  { before: "The release ", quote: "is planned", after: " for May.", text: "ships" },
];

const result = applyAnchoredEdits(page, edits);
if (result.ok) console.log(result.text); // "# Plan\n\nThe release ships for May.\n"
else console.warn(`Edit ${result.index} is ${result.reason}`);
```

- `SuggestionsManager`: `enable()`/`disable()`, `addSuggestion()` (a proposal that stays out of
  the document until accepted), `acceptSuggestion`, `rejectSuggestion`, `acceptAll`,
  `rejectAll`, `exportState()`/`loadState()`.
- `defineSuggestions` creates the manager with the editor; `getSuggestionsManager(editor)`
  returns it.
- `findAnchor`, `locateEdits`, `applyAnchoredEdits`, `anchorAt` and the overlap helpers
  locate and apply anchored edits; see [Model edits](https://gotipe.com/docs/review/model-edits/).

Records live in memory and are not synchronized between users. `SuggestionToolbar` and the
`PageEditor` review layer are part of the commercial `@gotipe/block-editor`.

## License

MIT — see [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/suggestions/LICENSE).
