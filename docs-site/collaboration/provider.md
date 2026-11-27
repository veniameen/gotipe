---
title: Collaboration provider
description: Configure CollaborationProvider tokens, save acknowledgements, reconnects and remote cursors, or connect editors on one page with LocalCollaborationBridge.
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
import { BlockEditor } from "@gotipe/block-editor";
import { CollaborationProvider, type CollaborationState } from "@gotipe/collaboration";
import { createId } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useMemo } from "react";

export function SharedDocument(props: {
  documentId: string;
  state: CollaborationState;
  getToken: () => Promise<string>;
}) {
  const { documentId, state, getToken } = props;
  const editor = useEditor({ engine: "wasm", content: state.baseline, extensions: [FullPreset] });
  // One peer ID per editor replica, kept across reconnects.
  const peerId = useMemo(() => createId(), [editor]);

  useEffect(() => {
    if (!editor) return;
    const provider = new CollaborationProvider({
      documentId,
      wsUrl: "wss://sync.example.com/sync",
      peerId,
      initialState: state,
      token: getToken,
      user: { name: "Alice", color: "#2c62d4" },
    });
    provider.connect(editor);
    return () => provider.destroy();
  }, [editor, peerId, documentId, state, getToken]);

  // BlockEditor draws the people the provider writes into the editor's `collaboration` layer.
  return <BlockEditor editor={editor} />;
}
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `documentId` | `string` | — | Required. Sent as the `document_id` query parameter. |
| `wsUrl` | `string` | — | An absolute `ws:` or `wss:` URL of the sync endpoint, for example `wss://sync.example.com/sync`. No user info and no `token` parameter. |
| `user` | `AwarenessUser` | — | `{ name, color, avatar? }` that other peers see. `name` has at most 256 characters, `color` is `#rgb` or `#rrggbb`, `avatar` an `http:`, `https:` or `data:image/` URL of at most 16 384 characters. Other fields are not sent. |
| `peerId` | `string` | `createId()` | The replica's ID: not blank, at most 256 bytes in UTF-8, not starting with `@base`. Stays the same across reconnects; every editor and every tab needs its own. |
| `initialState` | `CollaborationState` | — | `{ baseline, updates, generation }` from Cloud. Applied once, on the first `connect()`. Create the editor from `baseline`. With `generation` the provider sends operations without the baseline; without it every frame repeats the baseline. |
| `token` | `string \| () => string \| Promise<string>` | — | The credential. A function is called before every connection attempt. |
| `reconnectInterval` | `number` | `1000` | First reconnect delay in ms. It doubles on each attempt, up to 30 000. |
| `maxReconnectAttempts` | `number` | `10` | Attempts before the provider stops with an error. |
| `handshakeTimeout` | `number` | `15000` | Time in ms for each connection step: getting the token, opening the socket, receiving the state. |
| `acknowledgementTimeout` | `number` | `15000` | Time in ms to wait for the server to confirm a saved update. |
| `createWebSocket` | `(url, protocols) => WebSocket` | — | Your own socket factory, for example outside the browser or in tests. |

The constructor throws a `TypeError` for a `wsUrl`, `user`, `peerId` or `generation` that
breaks these rules. Such a mistake can never connect, so it is not retried.

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
| `onSyncChange` | `{ pendingOperations: number, saving: boolean }` | After local edits, saves and handshakes. `pendingOperations` counts operations the server has not confirmed; `saving` is `true` while a frame waits for its ACK. |
| `onPeersChange` | `PeerState[]` | A peer joins, moves the caret or leaves. Empty after the connection drops. |
| `onBaselineReplaced` | — | The document's content was replaced in GoTipe Cloud. The provider has stopped; load the document again. See [When the document is replaced](#when-the-document-is-replaced). |
| `onError` | `Error` | A token, socket, protocol or saving failure, and recoverable problems such as an unreadable peer presence. A failure never turns into success. |

## Tokens

- Pass a function as `token`. The provider calls it before every connection attempt, so a
  reconnect gets a fresh short-lived token. A token that resolves after `disconnect()` or
  `destroy()` is ignored.
- The token travels as a WebSocket subprotocol, `gotipe.auth.<base64url>`, next to
  `gotipe.v2` and `gotipe.v1`. It never appears in the URL.
- GoTipe Cloud checks the token, the `documents:write` scope and editor access to the
  document before the upgrade. It closes the socket when the token expires or is revoked,
  and the provider reconnects with a new token. List your browser origins in
  `SYNC_ALLOWED_ORIGINS`. See [Authentication](/docs/cloud/auth).

## Saving and reconnecting

- One frame is in flight at a time. It carries operations the server has not confirmed,
  oldest first, and nothing else: no baseline and no operation sent before. A frame holds
  at most 512 KiB, half of what Cloud accepts in one message, so a large document or a long
  offline session takes more frames, not a larger one.
- A frame always ends after a whole edit (transaction): other editors check the document they
  receive, and half an edit is no valid document. An edit larger than a frame goes whole when
  it fits into a message (1 MiB); a larger one, such as a long paste, goes as parts that Cloud
  keeps until the last one, then saves and confirms together. If the connection drops in
  between, nothing was saved and the whole edit is sent again.
- Operations a peer typed into an inline atom it did not know (a mention, a formula) lose the
  atom's marks when they arrive. That repair is a local edit outside the undo history, sent to
  everyone, so all editors agree.
- The server writes the frame to its database, then answers with an empty ACK and forwards
  the operations to the other peers. A duplicate gets an ACK too.
- Typing is merged: after a pause a frame leaves at once, during a burst at most one every
  50 ms, and over time at most 300 frames a minute. Nothing is dropped; later keystrokes
  travel in the next frame.
- Without an ACK within `acknowledgementTimeout`, the provider reconnects. The handshake
  then shows which operations the server already has, and only the rest is sent again.
- The handshake also finds operations in the editor that the server lacks and that this
  replica did not make, such as a [local copy](/docs/collaboration/offline#keep-edits-across-reloads)
  of a closed tab. They are sent once, before the replica's own.
- Reconnect delays double from `reconnectInterval` up to 30 seconds and reset after a
  successful handshake. With the defaults the provider tries for about three minutes (1, 2,
  4, 8, 16, then 30 seconds), then reports `error` and stops. Edits stay in the editor;
  call `connect(editor)` to try again.

The provider offers the subprotocols `gotipe.v2` and `gotipe.v1`. With `gotipe.v2` it names
the baseline by `initialState.generation`. Without a generation, or with a server that
selects `gotipe.v1`, it falls back to the first protocol: the same rules, but every frame
repeats the baseline, so the baseline itself must fit into a message.

| Failure | What the provider does |
| --- | --- |
| The socket closes | Reports `disconnected` and reconnects. |
| A socket error, a timeout, a token function that throws, the server error `UPDATE_NOT_SAVED` | Calls `onError` and reconnects. |
| The browser refuses the endpoint (`SecurityError`, for example `ws:` from an HTTPS page) | Calls `onError` and stops without retrying. |
| An unreadable presence from a peer, the server error `INVALID_AWARENESS` | Calls `onError` and keeps working. The peer's caret disappears until its next valid presence. |
| The server error `BASELINE_REPLACED` (also when it refuses the `generation` at the handshake), or a full state from another baseline | Stops and calls `onBaselineReplaced`. See below. |
| The server error `UPDATE_TOO_LARGE` (an edit larger than `SYNC_TRANSACTION_LIMIT`) | Calls `onError`, reconnects and sends that edit in frames the server takes one by one. Other editors may see it in pieces; one their schema refuses waits until the rest arrives. |
| One operation larger than a message (1 MiB), the server error `DOCUMENT_TOO_LARGE`, or over `gotipe.v1` a baseline or an edit that does not fit into one message | Calls `onError` and stops; reconnecting cannot help. |
| A malformed frame, an unexpected ACK, an update the editor rejects, any other server error | Calls `onError` and stops. Fix the cause, then call `connect(editor)`. |

## When the document is replaced

A replica can only merge edits made from the same baseline. When someone replaces the
document's content over REST (`PATCH` with `content`, or a version restore), GoTipe Cloud
sends `BASELINE_REPLACED` to every connected editor and closes their connections. An editor
that was offline, or that loaded the document just before the replacement, gets the same
answer at its next handshake, because its `generation` no longer matches.

The provider then stops for good: reconnecting cannot help. It reports `disconnected` and
calls `onBaselineReplaced`; without that option it reports `error` and calls `onError`.
Edits the server had not confirmed stay in the editor but cannot be saved:
`getSyncState().pendingOperations` tells how many. Load the document again and create a
new editor and provider:

```ts title="reload-on-replace.ts"
import { CollaborationProvider, type CollaborationState } from "@gotipe/collaboration";
import { createEditor, type GoTipeEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";

export async function openShared(
  documentId: string,
  load: () => Promise<CollaborationState>,
  getToken: () => Promise<string>,
  mount: (editor: GoTipeEditor) => void,
): Promise<() => void> {
  const initialState = await load();
  const editor = await createEditor({
    engine: "wasm",
    content: initialState.baseline,
    extensions: [FullPreset],
  });
  let close = () => {};
  const provider = new CollaborationProvider({
    documentId,
    wsUrl: "wss://sync.example.com/sync",
    initialState,
    token: getToken,
    user: { name: "Alice", color: "#3264ab" },
    onBaselineReplaced: () => {
      const unsaved = provider.getSyncState().pendingOperations;
      if (unsaved) console.warn(`${unsaved} unsaved changes were replaced`);
      close();
      void openShared(documentId, load, getToken, mount).then((next) => {
        close = next;
      });
    },
  });
  provider.connect(editor);
  mount(editor);
  close = () => {
    provider.destroy();
    editor.destroy();
  };
  return () => close();
}
```

## Awareness and remote cursors

After each handshake, and then whenever the caret or the selection changes, the provider
sends the local peer: `user`, the caret as `cursor: { blockId, offset }` (the selection
head), and `selection: { blockId, from, to }` for a range inside one block. A selection
across blocks shows only the caret. Changes are sent at most once per 100 ms, after the
last one, and only if they differ from what peers already have: edits from other peers do
not resend your presence.

Remote peers arrive in `onPeersChange` as `PeerState[]`. The provider also writes them to
the editor's `collaboration` decoration layer as `remote-cursor` and `remote-selection`
decorations. Peers disappear when they leave, and all at once when the connection drops.
The server relays awareness and does not store it.

Each person is drawn once, by one owner:

- `BlockEditor` draws the layer with its overlay and leaves it out of the document. Its
  `remotePeers` prop adds people from another source; a peer ID in both is drawn once.
- `Editor` and `EditorContent` of `@gotipe/react` and `EditorContent` of `@gotipe/vue` draw
  the layer inside the text: a caret with the name, and a tinted range.
- To draw the layer yourself, name it in `hostLayers` and the renderer leaves it out. For
  example, the overlay of `BlockEditor` over an editor surface of your own:

```tsx title="cursors.tsx"
import {
  COLLABORATION_LAYER,
  CollaborationCursors,
  type RemotePeer,
} from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import { Editor } from "@gotipe/react";
import { useRef } from "react";

export function EditorWithCursors(props: { editor: GoTipeEditor; peers: RemotePeer[] }) {
  const container = useRef<HTMLDivElement>(null);
  return (
    <div ref={container} style={{ position: "relative" }}>
      <Editor editor={props.editor} hostLayers={[COLLABORATION_LAYER]} />
      <CollaborationCursors peers={props.peers} containerRef={container} />
    </div>
  );
}
```

`peersFromDecorations(editor.getDecorations(COLLABORATION_LAYER))` turns the layer into
`RemotePeer[]`; read it again on the editor's `decorationsChange` event.

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

- One operation cannot exceed a WebSocket message of GoTipe Cloud, 1 MiB. Text and
  formatting never come near it; a file embedded in an attribute as a `data:` URL can.
  Keep files in [host storage](/docs/concepts/host).
- Without `initialState.generation` the provider uses the first protocol, whose frames
  repeat the baseline: a document of about 1 MiB or more, or an edit larger than one message,
  then cannot sync.
- GoTipe Cloud saves an edit whole up to `SYNC_TRANSACTION_LIMIT` (16 MiB by default); a
  larger one is saved in pieces. A document's stored state may not exceed 60 MiB.
- `acknowledgementTimeout` starts once the browser has sent the frame (`bufferedAmount`), so a
  slow connection does not cause reconnects. Reconnect attempts are counted until an edit is
  confirmed.
- `LocalCollaborationBridge` and your own transport built on `getCollaborationUpdate()`
  without options still exchange the full state on every change.
- `CollaborationCursors` shows names, not avatars.
- GoTipe Cloud limits messages per connection (`RATE_LIMIT_WS`, 1000 per minute by
  default) and closes the socket with code 1008 above it. The provider sends at most 300
  update frames and 600 presence messages in any minute, so it stays below the default.
  If you lower the limit below about 900, connections of people who type continuously
  will be closed and reconnect.
- After the document is replaced, edits the server had not confirmed are not merged into
  the new content; the provider only counts them.

## Related

- [Collaboration](/docs/collaboration/overview): how replication works and what is shared.
- [Offline and conflicts](/docs/collaboration/offline): pending edits, local copies, IME.
- [Realtime](/docs/cloud/realtime): the frames and the server side.
- [BlockEditor](/docs/ui/block-editor): the `remotePeers` prop.
