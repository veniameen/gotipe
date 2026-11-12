---
title: Collaboration provider
description: Options, events and lifecycle of CollaborationProvider — tokens, saving with acknowledgements, reconnects, remote cursors — and the in-page LocalCollaborationBridge.
packages: ["@gotipe/collaboration"]
license: MIT
---

`CollaborationProvider` connects one WASM editor replica to GoTipe Cloud. It owns the
WebSocket, the handshake, saving with acknowledgements, reconnects and awareness. The
document, its undo history and any local storage stay with the editor and your app.

## Install

```sh
npm install @gotipe/collaboration @gotipe/core @gotipe/wasm
```

## Example

This React component shows the carets of other people in `BlockEditor` from the commercial
`@gotipe/block-editor`. `state` is the document's `collaboration_state`, loaded as in
[Connect to GoTipe Cloud](/docs/collaboration/overview#connect-to-gotipe-cloud).

```tsx title="shared-document.tsx"
import { BlockEditor, type RemotePeer } from "@gotipe/block-editor";
import { CollaborationProvider, type CollaborationState } from "@gotipe/collaboration";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useMemo, useState } from "react";

export function SharedDocument(props: {
  documentId: string;
  state: CollaborationState;
  getToken: () => Promise<string>;
}) {
  const { documentId, state, getToken } = props;
  const editor = useEditor({ engine: "wasm", content: state.baseline, extensions: [FullPreset] });
  // One peer ID per editor replica, kept across reconnects.
  const peerId = useMemo(() => crypto.randomUUID(), [editor]);
  const [peers, setPeers] = useState<RemotePeer[]>([]);

  useEffect(() => {
    if (!editor) return;
    const provider = new CollaborationProvider({
      documentId,
      wsUrl: "wss://sync.example.com/sync",
      peerId,
      initialState: state,
      token: getToken,
      user: { name: "Alice", color: "#2c62d4" },
      onPeersChange: setPeers,
    });
    provider.connect(editor);
    return () => provider.destroy();
  }, [editor, peerId, documentId, state, getToken]);

  return <BlockEditor editor={editor} remotePeers={peers} />;
}
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `documentId` | `string` | — | Required. Sent as the `document_id` query parameter. |
| `wsUrl` | `string` | — | A `ws:` or `wss:` URL of the sync endpoint, for example `wss://sync.example.com/sync`. No user info and no `token` parameter. |
| `user` | `AwarenessUser` | — | `{ name, color, avatar? }` that other peers see. `color` is `#rgb` or `#rrggbb`. |
| `peerId` | `string` | `crypto.randomUUID()` | The replica's ID, up to 256 characters. Stays the same across reconnects; every editor and every tab needs its own. |
| `initialState` | `CollaborationState` | — | `{ baseline, updates }` from Cloud. Applied once, on the first `connect()`. Create the editor from `baseline`. |
| `token` | `string \| () => string \| Promise<string>` | — | The credential. A function is called before every connection attempt. |
| `reconnectInterval` | `number` | `1000` | First reconnect delay in ms. It doubles on each attempt, up to 30 000. |
| `maxReconnectAttempts` | `number` | `10` | Attempts before the provider stops with an error. |
| `handshakeTimeout` | `number` | `15000` | Time in ms for each connection step: getting the token, opening the socket, receiving the state. |
| `acknowledgementTimeout` | `number` | `15000` | Time in ms to wait for the server to confirm a saved update. |
| `createWebSocket` | `(url, protocols) => WebSocket` | — | Your own socket factory, for example outside the browser or in tests. |

## Methods

| Method | Description |
| --- | --- |
| `connect(editor)` | Applies `initialState` the first time, enables the replica, subscribes to the editor and opens the socket. On a stopped provider it resumes. Throws for a second editor or after `destroy()`. |
| `disconnect()` | Closes the socket and stops reconnecting. Edits stay in the editor; `connect(editor)` resumes the same replica. |
| `destroy()` | Final cleanup. Destroying a connected editor destroys its provider too. |
| `getState()` | The current `ConnectionState`. |
| `getSyncState()` | `{ pendingOperations, saving }`. |
| `getPeers()` | Copies of the other peers' `PeerState`. |
| `peerId` | The replica's ID (read-only). |

## Events

Pass these callbacks as options.

| Option | Payload | When |
| --- | --- | --- |
| `onStateChange` | `"connecting" \| "connected" \| "disconnected" \| "error"` | The connection changes. `connected` means the initial state exchange has finished. |
| `onSyncChange` | `{ pendingOperations: number, saving: boolean }` | After local edits, saves and reconnects. `pendingOperations` counts operations the server has not confirmed; `saving` is `true` while an update waits for its ACK. |
| `onPeersChange` | `PeerState[]` | A peer joins, moves the caret or leaves. Empty after the connection drops. |
| `onError` | `Error` | A token, socket, protocol or saving failure. A failure never turns into success. |

## Tokens

- Pass a function as `token`. The provider calls it before every connection attempt, so a
  reconnect gets a fresh short-lived token. A token that resolves after `disconnect()` or
  `destroy()` is ignored.
- The token travels as a second WebSocket subprotocol, `gotipe.auth.<base64url>`, next to
  `gotipe.v1`. It never appears in the URL.
- GoTipe Cloud checks the token, the `documents:write` scope and editor access to the
  document before the upgrade. It closes the socket when the token expires or is revoked,
  and the provider reconnects with a new token. List your browser origins in
  `SYNC_ALLOWED_ORIGINS`. See [Authentication](/docs/cloud/auth).

## Saving and reconnecting

- One update is in flight at a time. It carries every operation the server has not
  confirmed.
- The server writes the update to its database, then answers with an empty ACK and
  forwards the update to the other peers. A duplicate gets an ACK too.
- Without an ACK within `acknowledgementTimeout`, the provider reconnects. The handshake
  then shows which operations the server already has, and only the rest is sent again.
- Reconnect delays double from `reconnectInterval` up to 30 seconds and reset after a
  successful handshake. With the defaults the provider tries for about three minutes (1, 2,
  4, 8, 16, then 30 seconds), then reports `error` and stops. Edits stay in the editor;
  call `connect(editor)` to try again.

| Failure | What the provider does |
| --- | --- |
| The socket closes | Reports `disconnected` and reconnects. |
| A socket error, a timeout, a token function that throws, the server error `UPDATE_NOT_SAVED` | Calls `onError` and reconnects. |
| A malformed frame, an unexpected ACK, an update the editor rejects, any other server error | Calls `onError` and stops. Fix the cause, then call `connect(editor)`. |

## Awareness and remote cursors

After the handshake and on every selection or focus change, the provider sends the local
peer: `user`, the caret as `cursor: { blockId, offset }` (the selection head), and
`selection: { blockId, from, to }` for a range inside one block. A selection across blocks
shows only the caret.

Remote peers arrive in `onPeersChange` as `PeerState[]`. The provider also writes them to
the editor's `collaboration` decoration layer as `remote-cursor` and `remote-selection`
decorations, for a renderer of your own. Peers disappear when they leave, and all at once
when the connection drops. The server relays awareness and does not store it.

`BlockEditor` draws carets from its `remotePeers` prop. Over an editor surface of your own,
render `CollaborationCursors` inside a positioned container:

```tsx title="cursors.tsx"
import { CollaborationCursors, type RemotePeer } from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import { Editor } from "@gotipe/react";
import { useRef } from "react";

export function EditorWithCursors(props: { editor: GoTipeEditor; peers: RemotePeer[] }) {
  const container = useRef<HTMLDivElement>(null);
  return (
    <div ref={container} style={{ position: "relative" }}>
      <Editor editor={props.editor} />
      <CollaborationCursors peers={props.peers} containerRef={container} />
    </div>
  );
}
```

Each caret carries the peer's name in their color; selections are tinted. Positions follow
container scroll and window resize.

## The extension

`defineCollaboration` creates and connects a provider when the editor is created and
destroys it with the editor. It takes the same options and does nothing without
`documentId` and `wsUrl`. Without `user`, peers see `Anonymous` in `#6366f1`.

```ts title="shared-editor.ts"
import {
  type CollaborationState,
  defineCollaboration,
  getCollaborationProvider,
} from "@gotipe/collaboration";
import { createEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";

export async function createSharedEditor(
  initialState: CollaborationState,
  getToken: () => Promise<string>,
) {
  const editor = await createEditor({
    engine: "wasm",
    content: initialState.baseline,
    extensions: [
      FullPreset,
      defineCollaboration.configure({
        documentId: "doc-123",
        wsUrl: "wss://sync.example.com/sync",
        initialState,
        token: getToken,
        user: { name: "Alice", color: "#3264ab" },
      }),
    ],
  });
  return { editor, provider: getCollaborationProvider(editor) };
}
```

## LocalCollaborationBridge

`LocalCollaborationBridge` syncs editors on one page without a server, for demos, tests and
side-by-side views. It sends the same CRDT updates as the provider, with no storage and no
authentication. Create every editor with `engine: "wasm"` from the same content, block IDs
included.

```ts title="split-view.ts"
import { LocalCollaborationBridge } from "@gotipe/collaboration";
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const content = {
  version: 1,
  blocks: [
    {
      id: "intro",
      type: "paragraph",
      attrs: {},
      content: [{ text: "Type in either editor.", marks: [] }],
      children: [],
    },
  ],
};
const [left, right] = await Promise.all([
  createEditor({ engine: "wasm", content, extensions: [DefaultPreset] }),
  createEditor({ engine: "wasm", content, extensions: [DefaultPreset] }),
]);
left.mount(document.querySelector<HTMLElement>("#left")!);
right.mount(document.querySelector<HTMLElement>("#right")!);

const bridge = new LocalCollaborationBridge();
bridge.join("alice", left, { name: "Alice", color: "#2c62d4" });
bridge.join("bob", right, { name: "Bob", color: "#2b7547" });
bridge.onPeersChange(() => console.log(bridge.getPeersFor("alice")));
```

| Method | Description |
| --- | --- |
| `join(peerId, editor, user)` | Enables the replica, replays the operations of the editors already joined and starts syncing. Throws for a destroyed editor or a peer ID that another editor uses. |
| `leave(peerId)` | Stops syncing one editor. Destroying an editor leaves too. |
| `getPeersFor(peerId)` / `getAllPeers()` | The peers other than `peerId` / every peer. |
| `onPeersChange(callback)` | Called with every peer on joins, leaves and caret moves. Returns an unsubscribe function. |
| `destroy()` | Removes every editor and callback. |

The bridge writes no decorations: pass `getPeersFor(peerId)` to `remotePeers` or
`CollaborationCursors`. Its caret is the selection anchor, while the provider sends the
head.

## Limitations

- Every update frame repeats the baseline document and all unconfirmed operations.
  GoTipe Cloud accepts WebSocket messages up to 1 MiB and closes the connection for a
  larger one, so a very large document or a long offline session can fail to sync.
- Other peers validate your awareness. Keep `color` in hex: a peer that receives any other
  color format stops its provider. An `avatar` that is not an `http:`, `https:` or
  `data:image/` URL is dropped, and `CollaborationCursors` shows names, not avatars.
- GoTipe Cloud limits messages per connection (`RATE_LIMIT_WS`, 1000 per minute by
  default) and closes the socket with code 1008 above it. The provider reconnects.

## Related

- [Collaboration](/docs/collaboration/overview): how replication works and what is shared.
- [Offline and conflicts](/docs/collaboration/offline): pending edits, local copies, IME.
- [Realtime](/docs/cloud/realtime): the frames and the server side.
- [BlockEditor](/docs/ui/block-editor): the `remotePeers` prop.
