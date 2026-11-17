# @gotipe/comments

Discussion threads for the GoTipe editor. `CommentsManager` attaches a comment to a quoted
range of text, collects replies and resolves threads; the quote follows the text while
people edit. Records live in memory, and your app saves and shares them.

[Docs](https://gotipe.com/docs/review/comments/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/comments @gotipe/core
```

## Usage

```ts
import { CommentsManager, type CommentsSnapshot } from "@gotipe/comments";
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

declare const saved: CommentsSnapshot | undefined; // loaded from your backend
declare function save(snapshot: CommentsSnapshot): void;

const editor = await createEditor({
  extensions: [DefaultPreset],
  content: {
    version: 1,
    blocks: [
      { id: "p1", type: "paragraph", attrs: {}, content: [{ text: "Draft plan", marks: [] }], children: [] },
    ],
  },
});
editor.mount(document.querySelector<HTMLElement>("#editor")!);

// Load saved threads after the document, so anchors resolve against the right text.
const comments = new CommentsManager(editor, { initialState: saved, onChange: save });
comments.subscribe(() => console.log(comments.getUnresolvedComments()));

const me = { authorId: "u-1", authorName: "Alice" };
// Quote "Draft" (characters 0 to 5 of block "p1"); offsets are UTF-16 code units.
const thread = comments.addComment({ blockId: "p1", from: 0, to: 5, ...me, content: "Who owns this?" });
comments.addReply(thread.id, { ...me, content: "Marketing." });
comments.resolveComment(thread.id, me.authorId);
```

- A comment stores its quote with a few characters of unique context on each side. After
  every change, local or remote, the manager finds it again; when the anchor is missing or
  ambiguous the comment becomes `orphaned` instead of attaching to guessed text.
- `exportState()` and `loadState(snapshot)` save and restore every thread.
- `defineComments` creates the manager with the editor; `getCommentsManager(editor)`
  returns it.
- Options: `initialState`, `onChange`, `onAdd`, `onReply`, `onResolve`, `onDelete`.
- The editor emits `commentAdded`, `commentUpdated`, `commentResolved` and `commentDeleted`.

The library does not sync comments between users, and the collaboration provider does not
carry them. The `CommentSidebar` component is part of the commercial `@gotipe/block-editor`.

## License

MIT — see [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/comments/LICENSE).
