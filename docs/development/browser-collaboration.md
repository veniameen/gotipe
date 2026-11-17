# Connecting a browser editor to Cloud

`@gotipe/collaboration` transmits operations of its own Rust/WASM CRDT.
For this scenario, create the editor with `engine: "wasm"`: the JS-only entry explicitly
returns `COLLABORATION_UNAVAILABLE` rather than imitating sync with JSON copies.
The exact server format: [replication contract](collaboration-protocol.md).

## Loading and starting

GET `/v1/documents/{id}` returns `content` for display and
`collaboration_state: { baseline, updates, generation }` for restoring a replica.
In the SDK the field is called `collaborationState`; the nested CRDT data is not renamed.
Create the editor from the baseline and apply **all** updates before input begins.
Materialized content alone contains no identities and no replication history.
`generation` is the opaque name of this baseline in Cloud. Pass the state to
`initialState` whole: with `generation` the provider connects over `gotipe.v2` and sends
only operations, without it over `gotipe.v1`, where each frame repeats the baseline.

```ts
import { createEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import { CollaborationProvider } from "@gotipe/collaboration";

async function openDocument(
  documentId: string,
  apiUrl: string,
  wsUrl: string,
  getToken: () => Promise<string>,
) {
  const response = await fetch(`${apiUrl}/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  if (!response.ok) throw new Error(`Document load failed: ${response.status}`);
  const { collaboration_state: initialState } = await response.json();
  const editor = await createEditor({
    engine: "wasm",
    content: initialState.baseline,
    extensions: [FullPreset],
  });
  const provider = new CollaborationProvider({
    documentId,
    wsUrl,
    initialState,
    peerId: crypto.randomUUID(),
    token: getToken,
    user: { name: "Alice", color: "#3264ab" },
  });
  provider.connect(editor);
  return { editor, provider };
}
```

`peerId` belongs to one live replica and is kept across reconnects. Different
tabs get different IDs. Connecting again with a different editor is forbidden.
`initialState` is applied once; reconnecting does not replace the local document.

The constructor immediately rejects (`TypeError`) a configuration that cannot work:
a `wsUrl` that is not `ws:`/`wss:`, credentials or a `token` in the URL, a `peerId` longer than 256 bytes
or with the `@base` prefix, an invalid `user` (a name up to 256 characters, a `#rgb`/`#rrggbb` color,
an `http(s)`/`data:image` avatar up to 16384 characters). Such errors are not retried as
transient ones; a `SecurityError`/`SyntaxError` from the WebSocket constructor is also final.

## Save state

`getState()` / `onStateChange` describe the connection. `connected` means the initial
state exchange has completed. `getSyncState()` / `onSyncChange` return
`pendingOperations` and `saving`: the interface can show unsaved edits.

The server acknowledges a batch only after a durable write. The provider keeps one
batch in flight and sends only unacknowledged operations. Acknowledgments arrive
in order, so the acknowledged operations of a replica are a prefix of its Lamport clocks:
the provider keeps a single mark and asks the engine for
`getCollaborationUpdate({ after, maxBytes })` without parsing the whole log on every
keystroke. After a disconnect the mark is taken anew from the server's full state
(`getCollaborationUpdate({ missingFrom })`), so a lost acknowledgment does not
lead to a repeat of something already written. The same call finds operations that the server
does not have and that this replica did not create (the local copy of a closed tab under a different
`peerId`): they go out once, right after the handshake.
Save and protocol errors arrive in `onError`; they are not turned into success.

The frame size does not depend on the document size or the length of an offline session: a frame is filled
with up to 512 KiB of whole transactions, half of Cloud's message limit (1 MiB), and the rest
goes out in the following frames in order. A frame never ends in the middle of a transaction:
a participant validates the whole document against the schema, and half a transaction (a heading without
`level`, an image without `src`) is not a document. A transaction larger than a frame goes out whole
if it fits in one message; larger than a message, it goes in parts with `continues`, which
Cloud accumulates, saves as a single record, confirms with a single ACK, and forwards whole
(`SYNC_TRANSACTION_LIMIT`, 16 MiB). On a disconnect, a pause longer than 30 s, or an error in
any part, the server saves nothing and closes the connection, and the transaction is sent
again in full. If the server replies `UPDATE_TOO_LARGE`, the provider reconnects and
sends that edit as self-contained frames; a participant whose schema rejects such a
piece holds it and applies it together with the next ones until the union becomes a
document. `DOCUMENT_TOO_LARGE` (the document's log would become larger than can be read)
stops the provider. The ACK wait timeout is counted from when the socket handed the data
to the network (`bufferedAmount` dropped to zero), and the reconnect counter is reset only by an
ACK. Recovered foreign operations go out as one transaction. A single operation larger than the limit (for example, an attribute with a file in `data:`) cannot
be transmitted: the provider reports this in `onError` and stops instead of
reconnecting in a loop. It does the same on `gotipe.v1` if the baseline itself does not
fit in a frame or a transaction does not fit in one message.

The stored `collaboration_state.updates` records are a union, not a
sequence: `applyCollaborationState` merges them into one update, and the
editor validates against the schema once. After the log is compacted, a row written during
the merge comes before the merged row it may depend on; applied one by one
they do not work.

If a remote participant typed text inside an inline atom (a mention, a formula),
`receiveCollaborationUpdate` strips the atomic marks from that text with a local
transaction outside history (`normalizeRemoteAtoms`), so all replicas receive the fix,
and simultaneous fixes converge. The provider sends it right after
receiving.

Typing is coalesced: after a pause a frame goes out immediately, in a series of keystrokes no more often than once
every 50 ms, and beyond that a reserve of 60 frames applies, refilled at 4 per second, that
is, no more than 300 edit frames in any minute. Together with presence (up to 10 per
second) the connection stays below the default `RATE_LIMIT_WS` (1000 per minute).
The queue after offline goes out without the 50 ms pause, but within the same reserve.

If the document content was replaced through REST (`PATCH` with `content` or
a version restore), Cloud sends `BASELINE_REPLACED` and closes the connection.
The replica's base is stale: the provider stops without retries, leaves
unacknowledged operations in the editor, and calls `onBaselineReplaced` (without it,
`onError`). The host reloads the document and creates a new editor and provider.
The same happens if the replacement occurred while the replica was offline: a handshake with a
different base is recognized as a replacement, not a failure.

```ts
const provider = new CollaborationProvider({
  documentId,
  wsUrl,
  initialState,
  token: getToken,
  user: { name: "Alice", color: "#3264ab" },
  onBaselineReplaced: () => {
    provider.destroy();
    editor.destroy();
    void openDocument(documentId, apiUrl, wsUrl, getToken);
  },
});
```

`disconnect()` closes the connection and subscriptions without an automatic reconnect;
`connect(editor)` resumes work of the same replica. Unsaved operations
are kept **in the editor's memory**. Surviving a tab close requires host storage
for the baseline, `generation`, and `editor.getCollaborationUpdate()` (the full state);
the provider itself does not write to IndexedDB.
`destroy()` is final, ignores late token promises, and releases resources.

## Authorization and presence

The browser passes a short-lived JWT in a credential subprotocol; the secret does not end up in the URL.
Cloud checks the token, scope, role, and document access before the upgrade and does not return the
credential subprotocol to the client. A `token` function lets you refresh the JWT on reconnect.
`SYNC_ALLOWED_ORIGINS` holds the exact allowed frontend origins; wildcards are not accepted.

Peer awareness contains a name, color, cursor, and selection. The provider updates the
`collaboration` layer and `onPeersChange`, clears it on disconnect and on a removal message.
It does not modify the document for the sake of a cursor. The provider sends its own presence only
when the cursor or selection changes (foreign edits alone do not count), no more often than once
every 100 ms after a change, and again after every handshake. Cloud validates the
presence frame and rejects it (`INVALID_AWARENESS`) to the sender only; invalid
foreign presence removes that one participant and arrives in `onError`, and the connection
keeps working. When closing the component, call `provider.destroy()`
and `editor.destroy()`; destroying the editor also disconnects the provider.

## Local use

`LocalCollaborationBridge` connects several editors with one baseline without a server.
It passes the same CRDT updates and preserves block/character identities. It is a convenient
local example; it provides no disk storage or remote authorization.

## Verified state

The provider's contract tests cover ACK, reconnect, a lost ACK, a save failure,
intentional disconnect, late authorization, malformed data, presence cleanup, invalid
presence from one participant, presence rate, baseline replacement, and configuration errors,
as well as frames without a baseline, frame size in a large document and after a long offline period,
frame order and splitting, recovered foreign operations, a generation rejection at
handshake, operation over `gotipe.v1`, frame rate under continuous typing, transaction
boundaries, `continues` parts with a single ACK, repeating a whole transaction after a disconnect, and
`UPDATE_TOO_LARGE`. In these tests the engine is replaced with a model of its contract; the contract itself
(`after`, `missingFrom`, mark order) is checked against the real WASM in
`packages/core/tests`, and loading records in any order and parts of a transaction with a
heading and an image are checked in `packages/collaboration/tests/engine.test.ts`.
Real Chrome + local Cloud/PostgreSQL: two WASM replicas made concurrent
edits with Cyrillic/emoji without a connection, converged after reconnect, waited for the ACK,
and a new editor restored the same text from the GET baseline and durable updates.
Local evidence: `output/cloud-validation/browser-sync-result.json`.
