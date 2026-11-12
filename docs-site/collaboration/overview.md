---
title: Collaboration
description: How GoTipe keeps one document in sync between editors with its own CRDT, what is shared and what each client keeps.
packages: ["@gotipe/collaboration", "@gotipe/core", "@gotipe/wasm"]
license: MIT
---

Several people can edit one document at the same time. Each editor holds a replica of
GoTipe's own CRDT, `gotipe-crdt`, which is written in Rust and runs in the browser as
WebAssembly. Replicas exchange operations instead of document copies and reach the same
content whatever order the operations arrive in. `@gotipe/collaboration` carries the
operations to GoTipe Cloud over a WebSocket and shows who else is in the document.

```demo
collaboration
```

## How it works

- Every character and every block has a stable identity. An operation names the
  identities it changes, never a numeric offset, so a concurrent edit elsewhere does not
  move it.
- A deleted character stays behind as a tombstone, so an insertion next to it still finds
  its place when the deletion arrives first.
- An operation ID is a Lamport counter plus the `peerId` of the replica that made it. A
  repeated operation changes nothing. A different operation under an existing ID fails the
  whole update, and nothing from that update is applied.
- An update is the replica's complete operation log on top of a baseline document. Updates
  are replay-safe: you can apply one more than once and in any order.
- All replicas start from the same baseline. A replica that already has operations rejects
  an update built on a different baseline.
- Undo and redo stay per replica: undo reverts your own operations and keeps everyone
  else's. Turning collaboration on clears the undo history.

## What is shared

Shared through updates:

- Blocks, text, marks and attributes, including nesting, moves, splits and merges.
- Images and files as references in their attributes (`src` of an image, `url` of a file).
  The file itself stays where your [host](/docs/concepts/host) saved it, so every client
  must be able to load it.

Shared through awareness, relayed by the server and never stored:

- Each peer's name, color, avatar, caret, and a selection inside one block.

Not shared, each client keeps its own:

- Undo history, focus, scroll position and read-only state.
- Comments, suggestions and versions. Their managers keep records in memory; your app
  stores and shares them (see [Comments](/docs/review/comments)).
- AI results: proofreading suggestions, review comments and ghost text.
- Decorations, including the review layer of `PageEditor`.

## Requirements

- **The WASM engine.** Create the editor with `engine: "wasm"`. The JS engine has no CRDT,
  and `enableCollaboration()` throws a `GoTipeError` with the code
  `COLLABORATION_UNAVAILABLE`. The default `engine: "auto"` falls back to JS when WASM
  fails to load; `"wasm"` fails with `WASM_INIT_FAILED` instead. See
  [Engines](/docs/getting-started/engines).
- **`@gotipe/wasm`**, an optional peer of `@gotipe/core`, and a CSP that allows WebAssembly.
- **One baseline.** Every replica starts from the same document with the same block IDs.

`PageEditor` always runs on the JS engine, so it cannot join a CRDT session. Use
`BlockEditor` or a headless editor. `PageEditor` can show cursors that your app supplies in
its [review layer](/docs/review/model-edits).

## Install

```sh
npm install @gotipe/core @gotipe/wasm @gotipe/collaboration
```

## Connect to GoTipe Cloud

Load the document over REST, create the editor from its baseline, then connect a provider.
`connect()` replays the stored updates, so connect before you mount the editor and nobody
types into an outdated replica.

```ts title="open-document.ts"
import { CollaborationProvider, type CollaborationState } from "@gotipe/collaboration";
import { createEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";

export async function openDocument(options: {
  apiUrl: string; // https://api.example.com
  wsUrl: string; // wss://sync.example.com/sync
  documentId: string;
  getToken: () => Promise<string>;
  element: HTMLElement;
}) {
  const response = await fetch(
    `${options.apiUrl}/v1/documents/${encodeURIComponent(options.documentId)}`,
    { headers: { Authorization: `Bearer ${await options.getToken()}` } },
  );
  if (!response.ok) throw new Error(`Document load failed: ${response.status}`);
  const initialState: CollaborationState = (await response.json()).collaboration_state;

  const editor = await createEditor({
    engine: "wasm",
    content: initialState.baseline,
    extensions: [FullPreset],
  });
  const provider = new CollaborationProvider({
    documentId: options.documentId,
    wsUrl: options.wsUrl,
    initialState,
    token: options.getToken,
    user: { name: "Alice", color: "#3264ab" },
    onError: (error) => console.warn(error.message),
  });
  provider.connect(editor);
  editor.mount(options.element);
  return { editor, provider };
}
```

Call `provider.destroy()` and `editor.destroy()` when the view closes.
[Provider](/docs/collaboration/provider) lists every option and event.

## Architecture with GoTipe Cloud

1. **Load.** `GET /v1/documents/{id}` returns the rendered `content` and
   `collaboration_state: { baseline, updates }`. Rendered content has no CRDT identities,
   so it cannot serve as a baseline.
2. **Replay.** You create the editor from `baseline`; the provider applies every stored
   update before input.
3. **Connect.** The provider opens a WebSocket to the sync endpoint (`/sync`, port 8081 by
   default) with the subprotocol `gotipe.v1`. Cloud checks the token, the `documents:write`
   scope and editor access before the upgrade.
4. **Handshake.** The provider asks for the current state, merges it and reports
   `connected`.
5. **Edit.** Each local change sends an update with the operations the server has not
   confirmed. Cloud validates the update, writes it to PostgreSQL, confirms it with an ACK
   and forwards it to the other peers of the document.
6. **Read.** REST reads and exports run the baseline plus every stored update through the
   same Rust engine.

Frames are binary: one type byte followed by a UTF-8 JSON payload.
[Realtime](/docs/cloud/realtime) describes each frame.

## Your own transport

`CollaborationProvider` speaks the GoTipe Cloud protocol. For any other transport, use the
editor's collaboration methods directly:

| Method | Description |
| --- | --- |
| `enableCollaboration(peerId)` | Starts a replica at the current document. The peer ID cannot change afterwards. |
| `getCollaborationUpdate()` | Returns the complete, replay-safe update as UTF-8 JSON bytes. Reading it does not drain it. |
| `receiveCollaborationUpdate(bytes)` | Merges an update atomically. Emits `update`, never `transaction`. |

This example keeps the tabs of one browser in sync with `BroadcastChannel`. Every tab must
create its editor from the same baseline.

```ts title="tab-sync.ts"
import type { GoTipeEditor } from "@gotipe/core";

export function syncTabs(editor: GoTipeEditor, documentId: string): () => void {
  const channel = new BroadcastChannel(`gotipe:${documentId}`);
  let receiving = false;
  const publish = () => channel.postMessage(editor.getCollaborationUpdate());
  editor.enableCollaboration(crypto.randomUUID());
  const stop = editor.on("update", () => {
    // Do not send back an update that just arrived.
    if (!receiving) publish();
  });
  channel.onmessage = (event: MessageEvent<Uint8Array | "sync">) => {
    if (event.data === "sync") return publish();
    receiving = true;
    try {
      editor.receiveCollaborationUpdate(event.data);
    } finally {
      receiving = false;
    }
  };
  channel.postMessage("sync"); // ask the open tabs for their state
  return () => {
    stop();
    channel.close();
  };
}
```

## Limitations

- Collaboration needs the WASM engine. `PageEditor` and editors created from
  `@gotipe/core/js` cannot join a session.
- GoTipe Cloud accepts sync connections only from users with editor access. Viewers can
  read the document over REST but cannot follow edits live.
- Comments, suggestions and versions are not part of the replicated document.
- An edit that arrives during IME composition is not merged with the composed text; the
  editor reports `COMPOSITION_CONFLICT`. See
  [Offline and conflicts](/docs/collaboration/offline).

## Related

- [Collaboration provider](/docs/collaboration/provider): options, tokens, reconnects and cursors.
- [Offline and conflicts](/docs/collaboration/offline): pending edits, local copies, IME.
- [Realtime](/docs/cloud/realtime) and [Authentication](/docs/cloud/auth) in GoTipe Cloud.
- [Engines](/docs/getting-started/engines): WASM and JS.
