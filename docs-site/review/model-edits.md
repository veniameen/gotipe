---
title: Model edits
description: Anchored edits from a model or any other source — locate and apply them with @gotipe/suggestions, and review them in PageEditor with lanes, cards, cursors and the review bar.
packages: ["@gotipe/suggestions", "@gotipe/block-editor"]
---

A model, a linter or another service often proposes changes to a text it read a while ago.
Character offsets go stale as soon as someone types. An anchored edit names its place by
the text around it instead, so it still applies after unrelated edits and fails visibly
when its own text changed. `@gotipe/suggestions` (MIT) locates and applies anchored edits in
any string. `PageEditor` from the commercial `@gotipe/block-editor` shows them on the page
for a person to accept or reject.

## Install

```sh
npm install @gotipe/suggestions
```

## Anchored edits

```ts
interface AnchoredEdit {
  before: string; // text right before the change
  quote: string; // the text to replace; "" inserts
  after: string; // text right after the change
  text: string; // the replacement; "" deletes
}
```

`before + quote + after` must occur exactly once in the current text. No occurrence makes
the edit `missing`, two or more make it `ambiguous`, and in both cases nothing is applied.
Text with CRLF line endings accepts anchors written with LF. Offsets are UTF-16 code units.

```ts title="apply-edits.ts"
import { type AnchoredEdit, applyAnchoredEdits } from "@gotipe/suggestions";

const page = "# Plan\n\nThe release is planned for May.\n";
const edits: AnchoredEdit[] = [
  { before: "The release ", quote: "is planned", after: " for May.", text: "ships" },
];

const result = applyAnchoredEdits(page, edits);
if (result.ok) console.log(result.text); // "# Plan\n\nThe release ships for May.\n"
else console.warn(`Edit ${result.index} is ${result.reason}`);
```

The same functions run in the browser, on your server and in a model runtime, so every
side applies an edit by the same rules.

| Function | Description |
| --- | --- |
| `findAnchor(text, anchor)` | `{ ok: true, start, end }` of the quote, or `{ ok: false, reason }` with `"missing"` or `"ambiguous"`. |
| `locateEdits(text, edits)` | Locates every edit and sorts them by position. Fails on the first missing or ambiguous anchor, or with `"overlap"` when two edits touch the same text. |
| `applyAnchoredEdits(text, edits)` | Applies all edits or none: `{ ok: true, text }`, or the failure of `locateEdits` with the edit's `index`. |
| `editsOverlap(a, b)` | Whether two located ranges touch. Two insertions at one point overlap. |
| `anchorWindowsOverlap(text, edit, other)` | Whether applying `edit` changes the text inside the anchor of `other`, which would make `other` stale. |
| `anchorAt(text, start, end, context?)` | Builds an anchor for `[start, end)` with the shortest unique context of 8 up to `context` (default 40) characters per side. |

Ask a model for edits in this shape, or turn offsets into anchors with `anchorAt` while you
still have the text the offsets refer to.

## Review in PageEditor

Pass the edits to `PageEditor` as proposals in its `review` prop. Anchors refer to the
page's Markdown: the text that `onChange` emits and `getMarkdown()` returns.

```tsx title="reviewed-page.tsx"
import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";
import { type ReviewLane, type ReviewProposal, applyAnchoredEdits } from "@gotipe/suggestions";
import { useRef, useState } from "react";

const lanes: ReviewLane[] = [
  { id: "you", name: "You", kind: "user", color: "var(--gt-track-4)" },
  { id: "assistant", name: "Assistant", kind: "agent", color: "var(--gt-track-1)" },
];

export function ReviewedPage() {
  const page = useRef<PageEditorHandle>(null);
  const [markdown, setMarkdown] = useState("# Plan\n\nThe release is planned for May.\n");
  const [proposals, setProposals] = useState<ReviewProposal[]>([
    {
      id: "p-1",
      laneId: "assistant",
      reason: "Shorter wording",
      edits: [{ before: "The release ", quote: "is planned", after: " for May.", text: "ships" }],
    },
  ]);
  const drop = (id: string) => setProposals((list) => list.filter((p) => p.id !== id));

  return (
    <PageEditor
      ref={page}
      markdown={markdown}
      onChange={setMarkdown}
      review={{
        lanes,
        proposals,
        onAccept: (id) => {
          const proposal = proposals.find((p) => p.id === id);
          const current = page.current?.getMarkdown();
          if (!proposal || current === undefined) return false;
          const result = applyAnchoredEdits(current, proposal.edits);
          if (!result.ok) return false;
          setMarkdown(result.text); // save it first in a real app
          drop(id);
          return true;
        },
        onReject: (id) => {
          drop(id);
          return true;
        },
      }}
      reviewBar={proposals.length > 0 ? { title: "Assistant" } : false}
    />
  );
}
```

A new `markdown` value replaces the document as one undoable change and keeps focus, caret
and scroll. Without `onAccept`, `PageEditor` applies an accepted proposal itself with
`applyAnchoredEdits`, emits the result through `onChange` and hides the proposal. Without
`onReject`, it only hides it.

### Review options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `lanes` | `ReviewLane[]` | — | Who proposes: `{ id, name, kind, color? }`. `kind` is `agent`, `skill`, `tool` or `user`; `color` is any CSS color, such as `var(--gt-track-2)`. |
| `proposals` | `ReviewProposal[]` | — | `{ id, laneId, edits, reason?, status?, createdAt? }`. Set `status: "stale"` when you already know it is. |
| `comments` | `ReviewComment[]` | `[]` | Notes or questions on a quote: `{ id, laneId, anchor, text, question?, replies? }`. An empty quote marks a point. |
| `cursors` | `LaneCursor[]` | `[]` | Where a lane works now: `{ laneId, proposalId?, anchor?, label? }`. Drawn at the end of the proposal's new text, else after the anchor's quote, with the lane's name and `label`. |
| `onAccept` | `ReviewAction` | local apply | Accept one proposal. Return `false` when it failed; that stops Accept all. |
| `onReject` | `ReviewAction` | hide | Reject one proposal. |
| `onAcceptAll` | `() => void \| Promise<void>` | in order | Default: `onAccept` one by one in document order, stopping at the first stale or failed proposal. |
| `onRejectAll` | `() => void \| Promise<void>` | each | Default: `onReject` for every proposal. |
| `onReply` | `(commentId, text) => ReviewResult \| Promise<ReviewResult>` | — | A reply to a comment. |
| `onStatesChange` | `(states) => void` | — | `{ proposals, comments }`: where each item is and which are stale. |

`ReviewAction` is `(id: string) => ReviewResult | Promise<ReviewResult>`, and `ReviewResult` is
`boolean | undefined`. Only `false` counts as a failure.

### What the reader sees

- Inline changes stand in the text in the lane's color: new text tinted and underlined,
  removed text struck through. New list items, table cells and blocks appear in place; a
  block that changes type shows the old one struck through with the new one below, and its
  card shows Before and After.
- On a wide page every card sits in a margin column next to its change. On a narrow page
  a card opens next to the text when you click a change. Escape closes it.
- The text of a new proposal appears over up to 1.5 seconds; with
  `prefers-reduced-motion` it appears at once.
- A proposal whose anchor is no longer found exactly once is stale. A dashed hint stays near
  where its text was, and its card offers only Reject. Accepting it reports
  `PROPOSAL_STALE`; without your `onError` the toast says in the interface's language that the
  suggestion is out of date.
- An error thrown by your callbacks reaches `host.onError` / `onError` as
  `PROPOSAL_ACTION_FAILED` or `COMMENT_ACTION_FAILED`.

### Review bar and handle

`reviewBar={{ title, extra }}` shows a bar above the page with the number of pending and
stale proposals, your extra facts and the Reject all and Accept all buttons. Leave it out
to draw your own bar with the exported `ReviewBar` and `LaneAvatars`, a round avatar per
lane that spins while the lane has a cursor. The handle's `review` field runs the same
actions:

| Method | Description |
| --- | --- |
| `accept(id)` / `reject(id)` | Same as the card buttons. Resolve to `true` on success. |
| `acceptAll()` / `rejectAll()` | Resolve to the number handled, or `0` when your `onAcceptAll` / `onRejectAll` ran. |
| `states()` | The current `{ proposals, comments }` states. |
| `focus(id)` | Opens the card of a proposal or comment; `null` closes it. |

For a renderer of your own, `computeReviewDecorations()` returns the same decorations and
states. It needs the serialized text, the Markdown codec's text map and a fragment parser.

## Limitations

- Anchors match text exactly. A change inside `before + quote + after` makes a proposal
  stale, and only Reject remains.
- The review layer exists only in `PageEditor`. `BlockEditor` has none.
- Proposals, comments and cursors come from your app. `PageEditor` does not store or
  synchronize them, and lane cursors are not collaboration awareness.
- Review comments are separate from [`CommentsManager`](/docs/review/comments) threads.

## Related

- [PageEditor](/docs/ui/page-editor): the Markdown page editor.
- [Suggestions](/docs/review/suggestions): track changes inside one editor.
- [Markdown](/docs/conversion/markdown): the text that anchors refer to.
- [AI](/docs/ai/overview): commands that edit the document directly.
