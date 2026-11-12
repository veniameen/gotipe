---
title: Versions
description: Save named and automatic snapshots with VersionsManager, compare them block by block, restore one as an undoable change, and decide where versions are stored.
packages: ["@gotipe/versions"]
license: MIT
---

`VersionsManager` saves snapshots of the document while it is open, by name or on a timer.
You can compare two snapshots block by block and restore one; a restore is an ordinary edit
that undo reverts. Snapshots live in memory, so your app or GoTipe Cloud stores them. The
package has no history UI; the demo builds one from the public API.

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
| `moved` | In both, with a different parent or a different index under the same parent. |

The result holds block IDs. Showing the text before and after is up to you; the demo prints
the old and new text of each changed block.

## Restore

`restoreVersion(id)` sets the snapshot as the document in one undoable step and keeps the
caret where its block still exists. The version list stays as it was, and later versions
are kept.

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
- `moved` compares indexes, so the siblings after an inserted or removed block are
  reported as moved too.
- There is no packaged version history UI.

## Related

- [Suggestions](/docs/review/suggestions): review single edits before they stay.
- [Transactions](/docs/concepts/transactions): `setContent` and the undo history.
- [REST API](/docs/cloud/rest-api): versions in GoTipe Cloud.
