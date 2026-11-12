---
title: Comments
description: Discussion threads on quoted text with CommentsManager — anchors that follow edits, replies, resolving, saved state — and the CommentSidebar component.
packages: ["@gotipe/comments", "@gotipe/block-editor"]
---

`CommentsManager` keeps discussion threads next to a document. A comment quotes a range of
text, collects replies and can be resolved. The quote follows the text while people edit.
The manager keeps its records in memory; your app saves them and shares them between users.
`@gotipe/comments` is MIT. The `CommentSidebar` component comes from the commercial
`@gotipe/block-editor`.

```demo
comments
```

## Install

```sh
npm install @gotipe/comments
```

## Example

A button comments on the selected text; the sidebar lists the threads with their replies.

```tsx title="discussion.tsx"
import { BlockEditor, type CommentData, CommentSidebar } from "@gotipe/block-editor";
import { type Comment, CommentsManager } from "@gotipe/comments";
import type { GoTipeEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useState } from "react";

const me = { authorId: "u-1", authorName: "Alice" };

const toSidebar = (c: Comment): CommentData => ({
  id: c.id,
  author: c.authorName,
  timestamp: Date.parse(c.createdAt),
  body: c.content,
  quotedText: c.quotedText,
  anchorBlockId: c.blockId,
  anchorFrom: c.from,
  anchorTo: c.to,
  endBlockId: c.endBlockId,
  orphaned: c.orphaned,
  resolved: c.resolved,
  replies: c.replies.map((r) => ({
    id: r.id,
    author: r.authorName,
    timestamp: Date.parse(r.createdAt),
    body: r.content,
  })),
});

function selectedRange(editor: GoTipeEditor) {
  editor.syncSelectionFromDOM();
  const { type, anchor, head } = editor.getViewState().selection;
  if (type !== "text" || anchor.blockId !== head.blockId || anchor.offset === head.offset)
    return null;
  const from = Math.min(anchor.offset, head.offset);
  return { blockId: anchor.blockId, from, to: Math.max(anchor.offset, head.offset) };
}

export function Discussion() {
  const editor = useEditor({ extensions: [DefaultPreset] });
  const [manager, setManager] = useState<CommentsManager | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    if (!editor) return;
    const next = new CommentsManager(editor);
    const stop = next.subscribe(() => setComments(next.getComments()));
    setManager(next);
    return () => {
      stop();
      next.destroy();
    };
  }, [editor]);

  const comment = () => {
    const range = editor && selectedRange(editor);
    const text = range && window.prompt("Comment");
    if (manager && range && text) manager.addComment({ ...range, ...me, content: text });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
      <div>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={comment}>
          Comment
        </button>
        <BlockEditor editor={editor} />
      </div>
      {editor && manager && (
        <CommentSidebar
          editor={editor}
          comments={comments.map(toSidebar)}
          currentUser={me.authorName}
          onAddReply={(id, body) => {
            manager.addReply(id, { ...me, content: body });
          }}
          onResolve={(id) => manager.resolveComment(id, me.authorId)}
          onUnresolve={(id) => manager.unresolveComment(id)}
          onDelete={(id) => manager.deleteComment(id)}
        />
      )}
    </div>
  );
}
```

For a selection across blocks, pass the first block as `blockId`, the last as `endBlockId`,
and `to` relative to the last block. All offsets are UTF-16 code units.

## How anchors follow the text

A new comment stores its quote and an anchor: the quote plus 8 to 40 characters of context
on each side, the shortest context that occurs once in the document. Blocks are read as
plain text joined with line breaks.

After every document change, local or remote, the manager looks for the anchor again:

- Found exactly once: the comment moves there. Its `blockId`, `endBlockId`, `from` and `to`
  follow, also across split and merged blocks.
- Missing or found more than once: the comment becomes `orphaned`. It keeps its thread and
  quote, loses its highlight and is never attached to guessed text. The sidebar marks it.
  When the text comes back, for example after undo, the comment attaches again.
- `reanchorComment(id, range)` attaches a thread to a new range that you choose.

## Highlight commented text

The manager publishes `comment-highlight` decorations. `BlockEditor` and `PageEditor` do not
draw that decoration type; they draw `inline` decorations. This helper mirrors the
highlights into an `inline` layer that uses the theme's `gotipe-comment-highlight` class:

```ts title="comment-highlights.ts"
import type { Decoration, GoTipeEditor } from "@gotipe/core";

const LAYER = "comment-highlights";

export function showCommentHighlights(editor: GoTipeEditor): () => void {
  const draw = () => {
    const marks: Decoration[] = [];
    for (const d of editor.getDecorations()) {
      if (d.type !== "comment-highlight") continue;
      marks.push({
        type: "inline",
        key: `${d.commentId}:${d.blockId}`,
        blockId: d.blockId,
        from: d.from,
        to: d.to,
        className: d.resolved ? "gotipe-comment-highlight resolved" : "gotipe-comment-highlight",
        attrs: { "data-comment-id": d.commentId },
      });
    }
    editor.setDecorations(LAYER, marks);
  };
  draw();
  const stop = editor.on("decorationsChange", ({ layer }) => {
    if (layer !== LAYER) draw();
  });
  return () => {
    stop();
    editor.setDecorations(LAYER, []);
  };
}
```

Call `showCommentHighlights(editor)` where you create the manager, and call the function it
returns on cleanup.

## Reference

Options of `new CommentsManager(editor, options)` and of `defineComments.configure(options)`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `initialState` | `unknown` | — | A snapshot from `exportState()`, loaded on creation. An invalid one throws. |
| `onChange` | `(snapshot: CommentsSnapshot) => void` | — | Every change, with the whole snapshot. Save it here. |
| `onAdd` | `(comment: Comment) => void` | — | A thread was created. |
| `onReply` | `(commentId: string, reply: CommentReply) => void` | — | A reply was added. |
| `onResolve` | `(commentId: string) => void` | — | A thread was resolved. |
| `onDelete` | `(commentId: string) => void` | — | A thread was deleted. |

With the extension, `getCommentsManager(editor)` returns the editor's manager. An error
thrown by a callback is reported as `COMMENT_ACTION_FAILED` and does not undo the change.

| Method | Description |
| --- | --- |
| `addComment({ blockId, from, to, endBlockId?, authorId, authorName, content })` | Creates a thread and returns a copy. Throws `COMMENT_ACTION_FAILED` for an invalid range or empty text. |
| `updateComment(id, content)` | Changes the text. Returns `false` for an unknown ID. |
| `reanchorComment(id, range)` | Attaches the thread to a new range. Returns `false` for an unknown ID. |
| `resolveComment(id, resolvedBy)` / `unresolveComment(id)` | Resolves or reopens a thread. |
| `deleteComment(id)` | Deletes a thread with its replies. |
| `addReply(id, { authorId, authorName, content })` | Adds a reply and returns a copy, or `null` for an unknown thread. |
| `updateReply(id, replyId, content)` / `deleteReply(id, replyId)` | Changes or deletes a reply. Return `false` when not found. |
| `getComment(id)`, `getComments()`, `getCommentsForBlock(blockId)`, `getUnresolvedComments()` | Detached copies. |
| `exportState()` | `{ version: 1, comments }` with quotes, anchors, authors, dates and replies. |
| `loadState(snapshot)` | Validates the whole snapshot, then replaces every thread and anchors it to the current document. |
| `subscribe(listener)` | Called after every change. Returns an unsubscribe function. |
| `destroy()` | Removes listeners and decorations. Destroying the editor destroys the manager. |

The editor emits `commentAdded`, `commentUpdated` (text, replies, re-anchoring, reopening),
`commentResolved` and `commentDeleted`, each with the comment ID. The AI `review` command
emits `commentAdded` and `commentDeleted` for its own short-lived comments as well.

A comment has `id`, `blockId`, `from`, `to`, `endBlockId`, `quotedText`, `anchor`
(`{ before, quote, after }`), `orphaned`, `authorId`, `authorName`, `content`,
`createdAt`, `updatedAt`, `resolved`, `resolvedBy`, `resolvedAt` and `replies`. Texts are
trimmed and limited to 100 000 characters; a snapshot holds up to 10 000 threads with up to
10 000 replies each.

## CommentSidebar

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `editor` | `GoTipeEditor` | — | The editor the threads belong to. |
| `comments` | `CommentData[]` | — | Threads to show, mapped from `Comment` as in the example. |
| `currentUser` | `string` | — | Name in the reply button. |
| `collapsed` | `boolean` | `false` | Collapses the panel to an expand button with the number of open threads. |
| `onAddReply` | `(id, body) => void \| Promise<void>` | — | Sends a reply. Without it, the reply form is hidden. |
| `onResolve`, `onUnresolve`, `onDelete` | `(id) => void \| Promise<void>` | — | Thread actions. A missing callback hides its button. |
| `onToggleCollapse` | `() => void` | — | Shows the collapse and expand buttons. |

The sidebar filters open and resolved threads and steps through them. Locating a thread
scrolls to its quote and selects it in the editor. The sidebar fills the width of its
container.

## Save and share

- Save `exportState()`, or the snapshot that `onChange` receives, next to the document.
  Load it with `initialState` or `loadState()` after the document is loaded, so anchors
  resolve against the right text.
- The library does not sync comments between users, and the collaboration provider does
  not carry them. Send changes to your backend from the callbacks, and call `loadState()`
  with the current snapshot when someone else changes a thread. `loadState()` replaces all
  threads.
- GoTipe Cloud stores threads with replies: create, list, reply, resolve and delete under
  `/v1/documents/{docId}/comments`, with a block ID, offsets and optional metadata. It does
  not push changes to other clients. See [REST API](/docs/cloud/rest-api).

## Limitations

- Threads live in memory until your app saves them, and they are not synchronized.
- An edit inside the quote, or in the few characters of context around it, orphans the
  comment.
- `BlockEditor` and `PageEditor` do not draw `comment-highlight` decorations; use the
  helper above.
- The labels of `CommentSidebar` are in English and do not follow the editor's locale.

## Related

- [Suggestions](/docs/review/suggestions): track changes.
- [Model edits](/docs/review/model-edits): notes and questions from a model in `PageEditor`.
- [Events](/docs/concepts/events) and [REST API](/docs/cloud/rest-api).
