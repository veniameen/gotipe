---
title: Versions
description: Save named and automatic snapshots with VersionsManager, compare them block by block, restore one as an undoable change, show them in the VersionHistory panel, and decide where versions are stored.
packages: ["@gotipe/versions", "@gotipe/block-editor"]
---

`VersionsManager` saves snapshots of the document while it is open, by name or on a timer.
You can compare two snapshots block by block and restore one; a restore is an ordinary edit
that undo reverts. Snapshots live in memory, so your app or GoTipe Cloud stores them.
`@gotipe/versions` is MIT and has no UI; the history panel, `VersionHistory`, is part of the
commercial `@gotipe/block-editor`.

```demo
versions
```

## Install

```sh
npm install @gotipe/versions
```

## Example

```ts title="history.ts"
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { VersionsManager, compareDocuments } from "@gotipe/versions";

const editor = await createEditor({ extensions: [DefaultPreset] });
editor.mount(document.querySelector<HTMLElement>("#editor")!);

const versions = new VersionsManager(editor, {
  autoSave: true,
  autoSaveInterval: 60_000,
  maxVersions: 50,
  onVersionCreated: (version) => console.log(`Saved ${version.name}`),
});

const draft = versions.createVersion("First draft", "Alice");

// Later: what changed since the draft?
const diff = compareDocuments(draft.snapshot, editor.getJSON());
console.log(diff.added, diff.removed, diff.modified, diff.moved);

// Put the draft back. Undo returns to the text before the restore.
versions.restoreVersion(draft.id);
```

With the `defineVersions` extension the editor creates the manager itself, with the same
options; `getVersionsManager(editor)` returns it.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `autoSave` | `boolean` | `false` | Save a version on a timer. |
| `autoSaveInterval` | `number` | `300000` | Timer period in ms. Must be positive. |
| `maxVersions` | `number` | `100` | Versions kept. When a new one exceeds the limit, the oldest are dropped. Must be a positive integer. |
| `onVersionCreated` | `(version: Version) => void` | — | A version was saved, by name or automatically. |
| `onVersionRestored` | `(version: Version) => void` | — | A version was restored. |

An invalid `autoSaveInterval` or `maxVersions` throws a `RangeError`. An auto-save happens
only when the document differs from the last saved version; it is named
`Auto-save <local date and time>` and created by `system`.

## Methods

| Method | Description |
| --- | --- |
| `createVersion(name, createdBy, description?)` | Saves the current document and returns a copy. Throws for an empty name. |
| `restoreVersion(id)` | Replaces the document with the snapshot. Returns `false` for an unknown ID. |
| `getVersions()` / `getVersion(id)` | Detached copies, oldest first. |
| `deleteVersion(id)` | Removes a version. Returns `false` for an unknown ID. |
| `compareVersions(a, b)` | `compareDocuments` of two saved versions, or `null` when one is missing. |
| `subscribe(listener)` | Called after every create, restore and delete. Returns an unsubscribe function. |
| `getRevision()` | A counter that grows with every change, for UI memoization. |
| `destroy()` | Stops the timer and drops every version. Destroying the editor destroys the manager. |

A `Version` has `id`, `name`, `description`, `createdAt`, `createdBy` and `snapshot`, the
whole document as public JSON.

## Compare

`compareDocuments(a, b)` compares two documents by block ID and returns:

| Field | Blocks |
| --- | --- |
| `added` | Only in `b`. |
| `removed` | Only in `a`. |
| `modified` | In both, with a different type, attributes or content. A change inside a child is reported on the child only. |
| `moved` | In both, with a different parent, or out of order among the siblings both documents share. Inserting or removing a sibling moves nothing. |

The result holds block IDs. For the text, `diffText(before, after)` compares two texts word by
word and returns runs of `equal`, `delete` and `insert`; a no-break space keeps «10 %» one
unit. `countWordChanges(a, b)` counts the words added and removed between two documents, and
`blockText(block)` is a block's own text.

## Restore

`restoreVersion(id)` sets the snapshot as the document in one undoable step and keeps the
caret where its block still exists. The version list stays as it was, and later versions
are kept.

## History panel

`VersionHistory` (GoTipe Atlas, frame 30) stands beside the page. It lists versions by day —
name, words added and removed, the author's initials and the time — and leads with the page
as it is now. Choosing a version shows the page compared with it: a rule in the margin marks a
block added (green), removed (red, struck through) or changed (blue), and a changed text shows
the words that went and came. **Restore** puts the version back as one undo step and answers
with a toast whose **Undo** takes it back. In a container narrower than 640 px the list and the
comparison are two screens, the comparison with a back arrow.

```tsx title="history.tsx"
import { PageEditor, VersionHistory } from "@gotipe/block-editor";
import { VersionsManager } from "@gotipe/versions";

function Page() {
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  const [open, setOpen] = useState(false);
  const manager = useMemo(() => (editor ? new VersionsManager(editor) : null), [editor]);
  return (
    <VersionHistory
      editor={editor}
      source={manager ?? undefined}
      user={{ name: "Мария Лебедева" }}
      open={open}
      onClose={() => setOpen(false)}
    >
      <PageEditor markdown={markdown} onReady={setEditor} />
    </VersionHistory>
  );
}
```

| Prop | Type | Description |
| --- | --- | --- |
| `editor` | `GoTipeEditor \| null` | The live page. While it is `null` only the page is shown. |
| `source` | `VersionHistorySource` | A `VersionsManager` or the same shape: `getVersions`, `subscribe`, optional `createVersion` and `restoreVersion`. |
| `versions` | `HistoryVersion[]` | Versions your app owns, in any order; used instead of `source`. |
| `user` | `{ name, person? }` | Who works on the page: the row of the unsaved page and the entries of a restore are theirs. `person` (1–3) picks the avatar colour. |
| `onRestore` | `(version, { unsaved, names }) => void \| Promise` | Called after the version is on the page. `unsaved` is the page before the restore when no saved version held it. A rejection undoes the restore and shows an error. |
| `open` | `boolean` | Default `true`. Closed, only the page stays, mounted as it was. |
| `onClose` | `() => void` | The close button and Escape. Focus returns to the control that opened the panel. |
| `loading`, `error`, `onRetry` | | The panel's loading and error states; `onRetry` adds a **Try again** button. |
| `children` | `ReactNode` | The live page. It stays mounted while a version is compared. |

A `HistoryVersion` is a `Version` with optional `auto` (listed as **Auto-save** with its author)
and `person`. A `VersionsManager` auto-save, created by `system`, is listed as **Auto-save**
without an author.

When a version is restored from a `source`, the panel first saves the unsaved page as
**Before restore**, then the result as **Back to “…”**, which leads the list. With `versions`,
your app saves them in `onRestore`; `names` holds both names in the panel's language.

The list is a listbox: the arrows, Home and End move along it, Enter chooses. Strings come
from `@gotipe/i18n` (`history.*`). Styles are in `@gotipe/theme` (`theme/history.css`).

## Store versions

- **Your storage.** Save each version from `onVersionCreated`. The manager has no method that
  loads versions back, so after a reload keep the list in your app: compare with
  `compareDocuments()`, and restore with
  `editor.setContent(snapshot, { addToHistory: true, preserveSelection: true })`, which is
  what `restoreVersion()` does.
- **GoTipe Cloud.** `POST /v1/documents/{docId}/versions` with `{ name, description?,
  version_type? }` (`named` or `milestone`) saves the document as Cloud stores it, not the
  editor's local state. `GET` lists versions, and
  `POST /v1/documents/{docId}/versions/{versionId}/restore` replaces the document. Before
  it does, Cloud saves the previous content as a `restore_point` version. A restore starts a
  new collaboration log, so open editors must load the document again. Cloud has no endpoint
  that returns a version's content. See [REST API](/docs/cloud/rest-api).

## Limitations

- Versions live in memory and disappear with the manager.
- Every version holds a full copy of the document.
- The comparison shows a changed block's text without its marks; a change of marks alone
  marks the block as changed.

## Related

- [Suggestions](/docs/review/suggestions): review single edits before they stay.
- [Transactions](/docs/concepts/transactions): `setContent` and the undo history.
- [REST API](/docs/cloud/rest-api): versions in GoTipe Cloud.
