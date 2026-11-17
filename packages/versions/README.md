# @gotipe/versions

Version history for the GoTipe editor. `VersionsManager` saves snapshots of the document by
name or on a timer, compares two snapshots block by block and restores one as an ordinary,
undoable edit. Snapshots live in memory; `exportState()` hands them to your storage.

[Docs](https://gotipe.com/docs/review/versions/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/versions @gotipe/core
```

## Usage

```ts
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

- Options: `initialState`, `autoSave`, `autoSaveInterval`, `maxVersions`,
  `onVersionCreated`, `onVersionRestored`.
- `createVersion`, `restoreVersion`, `getVersions`, `getVersion`, `deleteVersion`,
  `compareVersions`, `subscribe`.
- `exportState()` and `loadState(snapshot)` (or `initialState`) store and restore the list;
  `loadState` validates the whole snapshot before it changes anything.
- `compareDocuments(a, b)` returns the IDs of added, removed, modified and moved blocks;
  `diffText`, `countWordChanges` and `blockText` compare text word by word.
- `defineVersions` creates the manager with the editor; `getVersionsManager(editor)`
  returns it.

The package has no UI; the `VersionHistory` panel is part of the commercial
`@gotipe/block-editor`.

## License

MIT — see [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/versions/LICENSE).
