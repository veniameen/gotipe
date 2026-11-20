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
| `proposals` | `ReviewProposal[]` | — | `{ id, laneId, edits, reason?, status?, createdAt?, live?, order? }`. Set `status: "stale"` when you already know it is. `live` marks a proposal that is [still being written](#proposals-still-being-written); `order` places proposals that insert at the same point. |
| `comments` | `ReviewComment[]` | `[]` | Notes or questions on a quote: `{ id, laneId, anchor, text, question?, replies? }`. An empty quote marks a point. |
| `cursors` | `LaneCursor[]` | `[]` | Where a lane works now: `{ laneId, id?, name?, compact?, proposalId?, anchor?, label? }`. Drawn at the end of the proposal's new text, else after the anchor's quote, with the lane's name (or `name`) and `label`. A lane can have several: give each its own `id`. `compact` puts the name and the label in one line, and lets the flag go before its cursor at the page's edge. |
| `onAccept` | `ReviewAction` | local apply | Accept one proposal. Return `false` when it failed; that stops Accept all. |
| `onReject` | `ReviewAction` | hide | Reject one proposal. |
| `onAcceptAll` | `() => void \| Promise<void>` | in order | Default: `onAccept` one by one in document order, stopping at the first stale or failed proposal; a `live` proposal is passed over. |
| `onRejectAll` | `() => void \| Promise<void>` | each | Default: `onReject` for every proposal that is not `live`. |
| `onReply` | `(commentId, text) => ReviewResult \| Promise<ReviewResult>` | — | A reply to a comment. |
| `onStatesChange` | `(states) => void` | — | `{ proposals, comments }`: where each item is and which are stale. A proposal's `status` is `"pending"` or `"stale"`; one that is still being written also has `live: true`. Called when a state changes, not for every growth of a live proposal's text. |

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
  `prefers-reduced-motion` it appears at once. A `live` proposal is never revealed.
- A proposal whose anchor is no longer found exactly once is stale. A dashed hint stays near
  where its text was, and its card offers only Reject. Accepting it reports
  `PROPOSAL_STALE`; without your `onError` the toast says in the interface's language that the
  suggestion is out of date.
- An error thrown by your callbacks reaches `host.onError` / `onError` as
  `PROPOSAL_ACTION_FAILED` or `COMMENT_ACTION_FAILED`.

### Proposals still being written

A model's answer arrives in pieces. To show it on the page as it arrives, give the proposal
`live: true` and replace it with a new object under the same `id` whenever its text grows.
When the text is whole, give the same `id` without `live`: it becomes an ordinary proposal,
in the same place and without its text being revealed again.

```tsx title="written-section.tsx"
import { PageEditor } from "@gotipe/block-editor";
import type { LaneCursor, ReviewLane, ReviewProposal } from "@gotipe/suggestions";

const lanes: ReviewLane[] = [{ id: "assistant", name: "Assistant", kind: "agent" }];
// The section goes after the paragraph the anchor ends with. Its text starts with an empty
// line, so it is a block of its own from its first character.
const place = { before: "The release is planned for May.", quote: "", after: "" };

export function WrittenSection({ file, text, done }: { file: string; text: string; done: boolean }) {
  const proposals: ReviewProposal[] = [
    { id: "section-1", laneId: "assistant", live: !done, edits: [{ ...place, text: `\n\n${text}` }] },
  ];
  const cursors: LaneCursor[] = done
    ? []
    : [{ laneId: "assistant", id: "section-1", proposalId: "section-1", label: "Writing" }];
  return <PageEditor markdown={file} review={{ lanes, proposals, cursors }} />;
}
```

While a proposal is `live`:

- Its whole text is on the page at once: nothing is revealed letter by letter. Blocks already
  written keep their elements as the text grows; only what changed is bound to the document
  and drawn again.
- It takes no decision. Its card has no Accept or Reject, the handle's `accept(id)` and
  `reject(id)` resolve to `false` without calling you, and Accept all and Reject all pass it
  over. Its state has `live: true` beside its `status`, and the review bar does not count it.
- Markdown its end leaves unfinished is shown as text and changes nothing around it: a mark
  without its pair (`**`, `` ` ``, `~~`, a link). A table comes with all its columns once its
  head row and its delimiter row are whole, and grows by whole rows: a row being written is a
  line of text under it until its line ends. A code block still open holds the code written
  so far and takes nothing that follows it.
- The last piece of its text carries the class `gotipe-sug-live`. Set
  `--gt-sug-live-caret-width` to draw a typing caret there
  (see [theming](/docs/ui/theming#parts)).
- A cursor with its `proposalId` stands where the text will start while there is none, then
  follows its end. When the text moves it, it goes there over `--gt-lane-cursor-move`
  (`data-glide`); a scroll of the page or a change of the page's width takes it along at once.
- Every cursor says on which side its flag has room: `data-chip-side="right"`, or `"left"` when
  the flag would cross the page's right edge. A `compact` flag then stands left of its cursor,
  above the row. The side is found again when the cursor moves and when the page's edge does,
  and is kept at the edge: the flag comes back only once it fits right of the cursor with room
  to spare. The sides are physical: on a right-to-left page they are not mirrored.
- When its anchor is no longer found, it is stale as any proposal is (`status: "stale"`, and
  `reason` says why) and still `live`: a dashed hint keeps its place, and it takes no decision.

Several proposals can insert at the same point, for instance the sections of a new page.
They stand in ascending `order` (0 when not given or not a finite number), equal ones in the
order of `proposals`, and keep their places while they grow; so do insertions of several
proposals at one place inside a line (before 0.1.5 those stood in the order of their ids). Accepting one changes the text the others are
anchored to: anchor them again, or apply them together as one edit.

### Review bar and handle

`reviewBar={{ title, extra }}` shows a bar above the page with the number of pending and
stale proposals, your extra facts and the Reject all and Accept all buttons. Leave it out
to draw your own bar with the exported `ReviewBar` and `LaneAvatars`, a round avatar per
lane that spins while the lane has a cursor. The handle's `review` field runs the same
actions:

| Method | Description |
| --- | --- |
| `accept(id)` / `reject(id)` | Same as the card buttons. Resolve to `true` on success, and to `false` for a `live` proposal. |
| `acceptAll()` / `rejectAll()` | Resolve to the number handled, or `0` when your `onAcceptAll` / `onRejectAll` ran. `live` proposals are passed over. |
| `states()` | The current `{ proposals, comments }` states. |
| `focus(id)` | Opens the card of a proposal or comment; `null` closes it. |

For a renderer of your own, `computeReviewDecorations()` returns the same decorations and
states. It needs the serialized text, the Markdown codec's text map and a fragment parser.
Pass it a `cache` from `createReviewCache()`, one per editor (an opaque object: nothing in it
to read or set), and it binds again only the proposals and comments that changed; the rest
keep their decoration objects.

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
