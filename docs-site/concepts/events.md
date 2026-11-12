---
title: Events
description: Every GoTipe editor event with its payload, when it fires, and how to subscribe and unsubscribe.
packages: ["@gotipe/core"]
license: MIT
---

The editor emits events when its document, selection, decorations or mode change, and
when features ask the interface to do something, such as opening the slash menu. Use them
to save documents, update toolbars and connect your own UI.

## Subscribe and unsubscribe

`editor.on(event, handler)` returns a function that removes the handler.
`editor.off(event, handler)` does the same with the original function.

```ts title="autosave.ts"
import type { GoTipeEditor } from "@gotipe/core";

export function autosave(editor: GoTipeEditor, save: (json: string) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = editor.on("update", ({ editor }) => {
    clearTimeout(timer);
    timer = setTimeout(() => save(JSON.stringify(editor.getJSON())), 1000);
  });
  return () => {
    clearTimeout(timer);
    stop();
  };
}
```

`createEditor` also takes `onCreate`, `onUpdate`, `onSelectionChange`, `onFocus`, `onBlur`
and `onDestroy`; each registers a listener for the matching event. `create` fires before
`createEditor` resolves, so `onCreate` is the only way to observe it.

In React, subscribe in an effect and return the unsubscribe function:

```tsx title="WordCount.tsx"
import type { GoTipeEditor } from "@gotipe/core";
import { useEffect, useState } from "react";

export function WordCount({ editor }: { editor: GoTipeEditor }) {
  const [words, setWords] = useState(0);
  useEffect(() => {
    const count = () => setWords(editor.getText().split(/\s+/).filter(Boolean).length);
    count();
    return editor.on("update", count);
  }, [editor]);
  return <span>{words} words</span>;
}
```

For values derived from the view state, `useEditorState` from `@gotipe/react` or
`@gotipe/vue` subscribes to `viewStateChange` for you.

## Editor events

| Event | Payload | When |
|---|---|---|
| `create` | `{ editor }` | Once, after extensions are set up, before `createEditor` resolves. |
| `update` | `{ editor }` | After the document changes: a dispatch, Undo or Redo, `setContent`, a remote collaboration update. Also after toggling a mark at a caret. |
| `transaction` | `{ editor, transaction, before, after }` | After a local `dispatch` commits, before `update`. Not for Undo, Redo, `setContent` or remote updates. |
| `selectionChange` | `{ editor }` | The selection changed: by the user, `setSelection`, a transaction, Undo or `setContent`. |
| `viewStateChange` | `ViewState` | Anything `getViewState()` returns changed: document, selection, decorations, editability. |
| `focus`, `blur` | `{ editor }` | The mounted surface gained or lost focus. |
| `editableChange` | `boolean` | `setEditable` switched the mode. |
| `decorationsChange` | `{ layer }` | A decoration layer changed. |
| `error` | `GoTipeError` | Any reported error; see [host](/docs/concepts/host#errors). |
| `compositionInterrupted` | — | An external change ended an IME composition; a `COMPOSITION_CONFLICT` error follows. |
| `destroy` | `{ editor }` | During `destroy()`, after extensions have cleaned up. |

`before` and `after` in `transaction` are detached copies of the document; changing them
has no effect.

## Requests to the interface

These events carry requests between packages. `BlockEditor` listens to `openSlashMenu`,
`executeAiCommand`, `aiStatusChange` and `aiGhostTextChange`. Nothing built in listens to
`openLinkDialog` or `scrollToBlock`, so handle those, and any others your own interface
needs, in your code.

| Event | Payload | Emitted by |
|---|---|---|
| `openSlashMenu` | — | Typing `/` at the start of a block or after a space. |
| `openLinkDialog` | — | `Mod-K` from the `Link` extension. |
| `scrollToBlock` | `{ blockId }` | `CommentSidebar` in `@gotipe/block-editor` when a comment is chosen. |
| `commentAdded`, `commentUpdated`, `commentResolved`, `commentDeleted` | `commentId: string` | The comments manager in `@gotipe/comments`, and AI review. |
| `executeAiCommand` | `{ commandId, prompt? }` | AI menus and commands; handled by `@gotipe/ai`. |
| `aiStatusChange` | `{ active, label? }` | `@gotipe/ai` when a request starts, ends or fails. |
| `aiGhostTextChange` | `{ text, blockId, offset } \| null` | `@gotipe/ai` autocomplete. |
| `aiProofreadChange` | `{ suggestions, currentIndex }` | `@gotipe/ai` proofreading. |

`editor.emit(event, payload)` sends any of these events to all listeners, for example
`editor.emit("openSlashMenu")` from a toolbar button.

## Order

For one dispatch the editor emits `transaction`, then `selectionChange` if the selection
moved, then `update` and `viewStateChange`. Undo, Redo and `setContent` emit `update`,
`selectionChange` and `viewStateChange`. Plugin decorations refresh after `update` and
`selectionChange`, so `decorationsChange` and another `viewStateChange` can follow.

Listeners run synchronously, in the order they were added.

## Errors in listeners

If a listener throws, the editor catches the exception, reports it as an `EXTENSION_ERROR`
through `error` and `host.onError`, and calls the remaining listeners. An exception in an
`error` listener is logged to the console. `destroy()` removes all listeners after
emitting `destroy`.

## Related

- [Transactions](/docs/concepts/transactions)
- [Host](/docs/concepts/host): `onError` and error codes.
- [React](/docs/frameworks/react) and [Vue](/docs/frameworks/vue) state hooks.
