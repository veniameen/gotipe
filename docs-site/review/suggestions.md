---
title: Suggestions
description: Track changes with SuggestionsManager — record edits as suggestions, accept or reject them one at a time or all at once — and review them with SuggestionToolbar.
packages: ["@gotipe/suggestions", "@gotipe/block-editor"]
---

`SuggestionsManager` adds track changes to an editor. While tracking is on, every local edit
becomes a pending suggestion. The edit is visible in the draft at once and marked; Accept
keeps it, Reject restores the original. You can also propose an edit without applying it.
`@gotipe/suggestions` is MIT. `SuggestionToolbar` and the `BlockEditor` props come from the
commercial `@gotipe/block-editor`.

```demo
suggestions
```

## Install

```sh
npm install @gotipe/suggestions
```

## Example

```tsx title="track-changes.tsx"
import { BlockEditor, type ToolbarSuggestion } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { type Suggestion, SuggestionsManager } from "@gotipe/suggestions";
import { useEffect, useState } from "react";

// The toolbar steps through text changes; Accept All and Reject All cover every kind.
const toToolbar = (records: Suggestion[]): ToolbarSuggestion[] =>
  records.flatMap((s) =>
    s.type === "insert" || s.type === "delete" || s.type === "replace"
      ? [
          {
            id: s.id,
            type: s.type,
            blockId: s.blockId,
            from: s.from,
            to: s.to,
            originalText: s.originalContent ?? "",
            suggestedText: s.newContent ?? "",
          },
        ]
      : [],
  );

export function TrackChanges() {
  const editor = useEditor({ extensions: [DefaultPreset] });
  const [manager, setManager] = useState<SuggestionsManager | null>(null);
  const [pending, setPending] = useState<Suggestion[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editor) return;
    const next = new SuggestionsManager(editor, {
      enabled: true,
      authorId: "u-1",
      authorName: "Alice",
    });
    const stop = next.subscribe(() => setPending(next.getPendingSuggestions()));
    setManager(next);
    return () => {
      stop();
      next.destroy();
    };
  }, [editor]);

  // Accept and Reject throw when a change can no longer be applied.
  const run = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <BlockEditor
        editor={editor}
        suggestions={toToolbar(pending)}
        onSuggestionAccept={(s) => run(() => manager?.acceptSuggestion(s.id))}
        onSuggestionReject={(s) => run(() => manager?.rejectSuggestion(s.id))}
        onSuggestionAcceptAll={() => run(() => manager?.acceptAll())}
        onSuggestionRejectAll={() => run(() => manager?.rejectAll())}
      />
    </>
  );
}
```

Switch tracking with `manager.enable()` and `manager.disable()`.

## Tracked changes

- Inserted text is underlined and tinted. Removed text stays visible at its old place,
  struck through; it is a decoration, not part of the document. A changed block structure
  gets a bar at the block's left edge.
- Adjacent edits in one block, less than a second apart, merge into one suggestion.
- `type` tells what changed: `insert`, `delete`, `replace`, `format` (marks only, the text
  is the same) or `structure` (blocks added, removed, moved, or their type or attributes
  changed).
- Accept keeps a change; the document does not change. Reject applies the inverse of the
  recorded change. `acceptAll()` and `rejectAll()` check every change first, then apply
  what they change as one transaction and one undo step.
- Undoing a recorded edit marks its suggestion `rejected`; redo makes it `pending` again.
  Undoing a rejection brings back the text and its pending status.
- Only local edits are recorded. Updates from collaborators and the manager's own review
  actions are not.

A recorded change is found again by its text and the few characters around it. When that
text was edited again, or its block was removed, Accept and Reject throw
`PROPOSAL_STALE`. A transaction filter that blocks the change makes them throw
`PROPOSAL_ACTION_FAILED`. In both cases the document stays as it was.

## Propose without applying

`addSuggestion` records an edit that stays out of the document until someone accepts it:

```ts title="propose.ts"
import type { SuggestionsManager } from "@gotipe/suggestions";

export function proposeWording(manager: SuggestionsManager) {
  // Replace characters 4 to 9 of block "p1" with "quick".
  return manager.addSuggestion({
    type: "replace",
    blockId: "p1",
    from: 4,
    to: 9,
    newContent: "quick",
    authorId: "reviewer",
    authorName: "Reviewer",
  });
}
```

- `type` is `insert` (with `from === to`), `delete`, `replace` or `format` with
  `format: { add?: Mark[], remove?: string[] }` on a rich-text block. The block must hold
  text, and `from`/`to` are UTF-16 offsets that do not split a character.
- The manager anchors the range to the text around it in its block. Accept finds it again
  and applies it, or throws `PROPOSAL_STALE` when the text around it changed.
- The inserted text takes the marks at `from`, unless you pass `marks`.
- Accepting several proposals that overlap in one block throws `PROPOSAL_ACTION_FAILED`;
  accept them one by one.
- Proposals are not drawn in the document. List them in your own UI.

## Reference

Options of `new SuggestionsManager(editor, options)` and of
`defineSuggestions.configure(options)`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `false` | Start in tracking mode. |
| `authorId` | `string` | `"local"` | Author of recorded edits. |
| `authorName` | `string` | `"You"` | Author name of recorded edits. |
| `onChange` | `(suggestions: Suggestion[]) => void` | — | Every change, with all records. |
| `onAccept` | `(suggestion: Suggestion) => void` | — | A suggestion was accepted. |
| `onReject` | `(suggestion: Suggestion) => void` | — | A suggestion was rejected. |

With the extension, `getSuggestionsManager(editor)` returns the editor's manager. An error
thrown by a callback is reported as `PROPOSAL_ACTION_FAILED`.

| Method | Description |
| --- | --- |
| `enable()` / `disable()` | Starts or stops recording. `getState()` returns `"tracking"` or `"off"`. |
| `addSuggestion(options)` | Records an unapplied proposal and returns a copy. |
| `acceptSuggestion(id)` / `rejectSuggestion(id)` | Decides one pending suggestion. |
| `acceptAll()` / `rejectAll()` | Decides every pending suggestion in one transaction. |
| `getSuggestions()` / `getPendingSuggestions()` | Detached copies of all records or the pending ones. |
| `exportState()` / `loadState(snapshot)` | Versioned snapshot; see below. |
| `subscribe(listener)` | Called after every change. Returns an unsubscribe function. |
| `destroy()` | Removes listeners and decorations. Destroying the editor destroys the manager. |

A record has `id`, `type`, `blockId`, `from`, `to`, `originalContent`, `newContent`,
`applied` (`true` for recorded edits), `marks`, `format`, `authorId`, `authorName`,
`createdAt` and `status`: `pending`, `accepted` or `rejected`.

## Save the review

Save `exportState()` with the document, not just `getSuggestions()`. The snapshot,
`{ version: 1, records }`, keeps each record's anchor and the content before and after the
change, which Reject needs after a reload. A structure change keeps the whole document
before and after it. `loadState()` validates every record before it replaces the current
ones. Load it after the document.

## SuggestionToolbar

`BlockEditor` shows the toolbar when you pass `suggestions`, `onSuggestionAccept` and
`onSuggestionReject`, and keeps the current position itself. To place it yourself, render
`SuggestionToolbar`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `editor` | `GoTipeEditor` | — | The editor. |
| `suggestions` | `ToolbarSuggestion[]` | — | `{ id, type, blockId, from, to, originalText, suggestedText }` with `type` `insert`, `delete` or `replace`. |
| `currentIndex` | `number` | — | Position shown as `n/total`. |
| `onNavigate` | `(index: number) => void` | — | Previous and Next. |
| `onAccept`, `onReject` | `(suggestion) => void` | — | The current suggestion. |
| `onAcceptAll`, `onRejectAll` | `() => void` | — | Accept All and Reject All. |

The toolbar renders nothing for an empty list, and its accept buttons are disabled while
the editor is read-only. The same shape serves [AI proofreading](/docs/ai/ui#proofreading).

## Limitations

- Records live in memory and are not synchronized between users. Send changes to your
  backend if others must see them.
- `SuggestionToolbar` shows a counter and buttons. It does not show the suggested text or
  move the caret to it.

## Related

- [Comments](/docs/review/comments): threads on quoted text.
- [Model edits](/docs/review/model-edits): anchored edits from a model in `PageEditor`.
- [Transactions](/docs/concepts/transactions): undo steps and transaction filters.
