---
title: Real-time sync
description: The /sync WebSocket of GoTipe Cloud — authentication, frames, access checks, and how edits become durable.
packages: ["@gotipe/collaboration"]
license: MIT
---

Collaborative editing goes through the `/sync` WebSocket on port `8081` of your
[Cloud deployment](/docs/cloud/overview). Each editor is a replica of GoTipe's own CRDT,
which runs in the WASM engine. The server checks every update against the stored document,
saves it in PostgreSQL, and only then acknowledges it and relays it to the other editors.

Use `CollaborationProvider` from `@gotipe/collaboration`; it implements everything on this
page. Read on if you operate the server or write your own client.

## Connect an editor

```sh
npm install @gotipe/core @gotipe/wasm @gotipe/collaboration @gotipe/sdk
```

```ts title="collaborate.ts"
import { CollaborationProvider } from "@gotipe/collaboration";
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { GoTipeClient } from "@gotipe/sdk";

export async function openDocument(documentId: string, getToken: () => Promise<string>) {
  const client = new GoTipeClient({ baseUrl: "https://api.example.com", token: await getToken() });
  const { collaborationState } = await client.getDocument(documentId);
  if (!collaborationState) throw new Error("The server returned no collaboration state");

  const editor = await createEditor({
    engine: "wasm",
    extensions: DefaultPreset,
    content: collaborationState.baseline,
  });
  const provider = new CollaborationProvider({
    documentId,
    wsUrl: "wss://sync.example.com/sync",
    token: getToken,
    user: { name: "Ada Lovelace", color: "#2c62d4" },
    initialState: collaborationState,
    onError: (error) => console.error(error),
  });
  provider.connect(editor);
  return { editor, provider };
}
```

`token` is called again before every reconnect, so return a fresh access token. The provider's
options, states and reconnect rules are in [Collaboration provider](/docs/collaboration/provider).

## Start from REST

`GET /v1/documents/{id}` returns `content`, the current document, and `collaboration_state`
(`collaborationState` in the SDK):

```json
{
  "baseline": { "version": 1, "blocks": [] },
  "updates": [{ "protocol": "gotipe.crdt/2", "operations": [] }],
  "generation": "6c0d6e3f5a1b4c2d8e9f0a1b2c3d4e5f"
}
```

`baseline` is the document as last stored over REST; each update is a stored record of
operations made from it (see [Update envelopes](#update-envelopes)). `generation` is an opaque
token that names this baseline: send it when you connect. Create the editor from `baseline`,
then apply **every** update before the user types, all together as one update: the stored
records are a set, not a sequence, and one of them alone may not be a valid document (log
compaction can store a record before the one it depends on). `content` already has the
updates applied, but it lacks the replica's identities, so it is not a valid starting point.
`initialState` and `applyCollaborationState` do this for you.

A document edited before generations existed may still return `gotipe.crdt/1` updates, each
with a `base`; the engine applies both kinds. They are rewritten the next time the server
compacts that document's log.

## Connection

```text
wss://sync.example.com/sync?document_id=<document id>&peer_id=<replica id>&generation=<generation>
```

- `peer_id` names one editor replica. Keep it across reconnects and give every tab its own; a
  new connection with the same `peer_id` replaces the old one. It must not be blank, may have
  at most 256 bytes in UTF-8 and must not start with `@base`.
- `generation` is the `collaboration_state.generation` the replica was loaded with. It is
  required with the subprotocol `gotipe.v2`. If the document has another generation, because
  its content was replaced, the server answers the upgrade, sends `BASELINE_REPLACED` and
  closes: load the document again.
- Offer the subprotocols `gotipe.v2`, `gotipe.v1` and `gotipe.auth.<token>`, where `<token>`
  is the access token in base64url without padding. The server selects `gotipe.v2` when it is
  offered and `gotipe.v1` otherwise (see [Protocol versions](#protocol-versions)); it removes
  the credential before the upgrade and never echoes or logs it. Clients without browser
  restrictions may send `Authorization: Bearer <token>` instead. A token in the query string
  is ignored.
- The connection needs the `documents:write` scope and the editor, admin or owner role on the
  document. Viewers and commenters cannot connect.
- Browsers must come from the same origin or one listed in `SYNC_ALLOWED_ORIGINS`. Clients that
  send no `Origin` header are allowed and still authenticated.

Before the upgrade, failures are HTTP responses: `400` when `document_id` is missing or not a
UUID, `peer_id` breaks the rule above or `gotipe.v2` comes without a `generation` of 1–128
URL-safe characters, `401` for the credential, `403` for the scope, `404`
for the document or role, `429` for too many connection attempts, `503` when Valkey or the
database cannot check the credential or the limit.

```ts title="raw-socket.ts"
export function openSocket(
  documentId: string,
  peerId: string,
  generation: string,
  token: string,
): WebSocket {
  const credential = btoa(token).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const url = new URL("wss://sync.example.com/sync");
  url.searchParams.set("document_id", documentId);
  url.searchParams.set("peer_id", peerId);
  url.searchParams.set("generation", generation);
  const socket = new WebSocket(url, ["gotipe.v2", `gotipe.auth.${credential}`]);
  socket.binaryType = "arraybuffer";
  return socket;
}
```

## Frames

Every message is binary: one type byte, then UTF-8 JSON (or nothing). Text messages are
ignored. A message may be up to 1 MiB.

| Byte | Direction | Payload | Meaning |
|---|---|---|---|
| `0x01` | Client → server | — | Send me the full state. |
| `0x02` | Server → client | Full state | Sent right after connecting and in reply to `0x01`. |
| `0x03` | Both ways | Update | From a client: new operations. From the server: another peer's new operations. |
| `0x04` | Both ways | Presence object | A peer's user, cursor and selection. |
| `0x05` | Client → server | — | Send me every peer's presence. |
| `0x08` | Server → client | `{ "code", "message" }` | An error. |
| `0x09` | Server → client | — | Acknowledgement: your last update is saved. |

## Update envelopes

The full state (`0x02`) is the baseline and every operation:

```json
{
  "protocol": "gotipe.crdt/1",
  "base": { "version": 0, "blocks": [] },
  "operations": [
    { "id": { "lamport": 1, "peer_id": "peer-a" }, "change": { "DeleteBlock": { "block_id": "block-1" } } }
  ]
}
```

An update (`0x03`) on a `gotipe.v2` connection is operations only. A client names the
generation they were made from; the server relays and stores them without it:

```json
{
  "protocol": "gotipe.crdt/2",
  "generation": "6c0d6e3f5a1b4c2d8e9f0a1b2c3d4e5f",
  "operations": [
    { "id": { "lamport": 2, "peer_id": "peer-a" }, "change": { "DeleteBlock": { "block_id": "block-2" } } }
  ]
}
```

An update that names another generation gets `BASELINE_REPLACED` (see
[Replaced content](#replaced-content)); one without a generation is `INVALID_UPDATE`. Operation
IDs are permanent: a repeated operation is ignored, and the same ID with another change is
rejected. Lamport values run from 1 to 2⁵³ − 1. Do not build changes by hand:

| Call | Returns |
|---|---|
| `editor.getCollaborationUpdate()` | The full state. |
| `editor.getCollaborationUpdate({ after, maxBytes })` | This replica's operations after the Lamport clock `after`, oldest first, as `gotipe.crdt/2` plus `remaining`, the number left out by `maxBytes`, and `continues`. It ends only after a whole transaction; when one transaction alone exceeds `maxBytes`, it returns a part of it with `continues: true`, and the next call after the part's last clock returns the rest. Add `generation` before you send it, keep `continues` only when true and drop `remaining`: the server refuses unknown fields. |
| `editor.getCollaborationUpdate({ missingFrom: fullState })` | The operations the server's full state lacks, except this replica's own after `acknowledged`, its newest operation in that state. |
| `editor.receiveCollaborationUpdate(bytes)` | Applies either envelope. |

The change types are described in the repository's replication contract,
`docs/development/collaboration-protocol.md`.

## Protocol versions

| | `gotipe.v2` | `gotipe.v1` |
|---|---|---|
| Baseline check | Once, at the handshake, by `generation` | In every update, by comparing its `base` |
| Client update | `gotipe.crdt/2`: `generation` and operations | `gotipe.crdt/1`: the baseline and operations |
| Update from the server | `gotipe.crdt/2`: operations | `gotipe.crdt/1` with the baseline |
| Size of an update | Its operations | The whole document plus its operations |

`gotipe.v1` remains for clients released before generations. Both kinds can edit one document
together; each receives updates in its own form. A `gotipe.v1` client cannot sync a document
whose baseline does not fit into a message.

## Saving and acknowledgements

1. The client sends `0x03` with operations the server has not acknowledged.
2. The server validates the envelope and writes the new operations to PostgreSQL.
3. It answers the sender with `0x09` and relays only the new operations to the others as `0x03`.
   A repeated update is acknowledged and not relayed.
4. If saving fails, the sender gets `0x08` `UPDATE_NOT_SAVED` and nothing changes on the
   server or on other peers. Reconnect and send the operations again.
5. If the document's content was replaced meanwhile, the sender gets `BASELINE_REPLACED`
   instead and the update is not saved.

Keep one update in flight and send a replica's operations in the order of their Lamport
clocks. The acknowledged operations of a replica are then a prefix, so a client needs to
remember one clock, not every ID. After a reconnect, take that clock from the full state the
server sends (`missingFrom` does it) and send what follows. Keep an update under 512 KiB and
send the rest in the next one, but never end an update inside a transaction: other peers
check the whole document they project, and half a transaction, such as a heading without its
level, is refused.

### Transactions larger than a message

A transaction that does not fit into one message goes as parts: `gotipe.crdt/2` updates with
`"continues": true`, then the last part without it, sent one after another without waiting.
The server validates each part and keeps it for that connection. Only the last part saves the
whole transaction as one record; the sender then gets one `0x09` and the other peers one
`0x03` with all of it. If the connection drops between parts, the next part takes longer than
30 seconds, or any part is refused, nothing is saved and the connection closes: send the
transaction again, whole. The parts of one transaction may hold `SYNC_TRANSACTION_LIMIT`
bytes (16 MiB by default); a larger one gets `UPDATE_TOO_LARGE` and the connection closes,
and the client may send it again in frames that stand alone. When many large transactions
arrive at once, a part may get `UPDATE_NOT_SAVED`: retry. A save that would make the
document's stored state larger than reads apply (60 MiB) gets `DOCUMENT_TOO_LARGE`.
Only `gotipe.v2` connections can send parts. Messages from the server, the full state and
relayed transactions, can be larger than 1 MiB.

Each saved update advances the document's `version` and `updated_at`. It never replaces the
document JSON you stored over REST: reads, versions and exports apply the stored updates to
it with the native engine.

### Log compaction

Stored updates are rows of one log per baseline. After a document received updates, every 5
minutes and when the last peer leaves, the server merges that log into one record once it
has 256 rows or 4 MiB outside its largest row. The merged record replaces exactly the rows
it was built from, in one transaction, so an update saved at the same moment is kept, and
it holds the same operations: reads and reconnects see no difference. The merged record is
stored after an update saved during the merge, which is why records are applied together.
It also absorbs records written before generations, which repeated the baseline in every row.
Compaction runs beside the document's room, so updates are saved meanwhile, and at most two
run at once in one API process. It changes neither `version` nor `updated_at`.

## Replaced content

`PATCH /v1/documents/{id}` with `content` and a version restore give the document a new
baseline. Edits made from the old one cannot be merged into it. The server reloads the
document's room and sends every connected client `0x08` with the code `BASELINE_REPLACED`,
after the frames already queued for it, then closes the connection with `1000`. A client
that connects with the old `generation`, or sends an update from another baseline or
generation, gets the same answer, alone.

Do not reconnect with the old replica: load the document over REST and start a new one.
`CollaborationProvider` stops and calls `onBaselineReplaced`; it also recognizes a full state
(`0x02`) from another baseline after a reconnect. See
[When the document is replaced](/docs/collaboration/provider#when-the-document-is-replaced).

## Presence

A client sends `0x04` with one JSON object of at most 32 KiB. The server checks it, sets
`peerId` to the connection's `peer_id`, keeps the latest object per peer, relays it to the
others, and sends all current objects to every new connection. When a peer leaves, the others
get `{ "peerId": "…", "removed": true }`. The provider sends and expects this shape:

```json
{ "peerId": "tab-3f2a", "user": { "name": "Ada Lovelace", "color": "#2c62d4" }, "cursor": { "blockId": "p1", "offset": 5 }, "lastActive": 1762945200000 }
```

| Field | Rule |
|---|---|
| `user.name` | Required string, at most 256 UTF-16 code units. |
| `user.color` | Required, `#rgb` or `#rrggbb`. |
| `user.avatar` | Optional `http:`, `https:` or `data:image/` URL, at most 16 384 code units. |
| `cursor` | Optional `{ "blockId", "offset" }`: a non-empty block ID and an integer from 0 to 2⁵³ − 1. |
| `selection` | Optional `{ "blockId", "from", "to" }` with the same rules and `from` ≤ `to`. |
| `lastActive` | Required number. |

The server relays only these fields. A presence that breaks a rule is refused with
`INVALID_AWARENESS`, sent to its sender only: nothing is stored or relayed, the sender's last
valid presence stays, and the connection remains open.

## Errors and closing

| `0x08` code | Meaning |
|---|---|
| `INVALID_UPDATE` | The envelope is malformed, names no generation or an operation conflicts. |
| `UPDATE_NOT_SAVED` | Saving failed; the update was not applied. |
| `UPDATE_TOO_LARGE` | The parts of one transaction exceed `SYNC_TRANSACTION_LIMIT`; nothing was saved and the connection closes. |
| `DOCUMENT_TOO_LARGE` | Saving would make the document's stored state larger than reads apply (60 MiB); nothing was saved. |
| `BASELINE_REPLACED` | The document's content was replaced; the connection closes. Load the document again. |
| `INVALID_AWARENESS` | Presence breaks a rule in [Presence](#presence); only that frame was refused. |
| `UNKNOWN_MESSAGE` | Unsupported type byte. |

The server closes the connection with `1000` after `BASELINE_REPLACED`, with `1008` when the
message rate is exceeded or access has ended, with `1009` for a message over 1 MiB, and with
`1011` when the document's collaboration state cannot be loaded. It pings every 54 seconds and
drops a peer that has not answered a ping for 60 seconds.

## Access during a session

The server checks the credential and the role again every 15 seconds, before it handles a
message and before it sends one. A revoked token, a deleted API key, a lost editor role or an
expired token closes the connection with `1008`; so does an authorization store that cannot be
reached. Reconnect with a fresh token.

| Limit | Value |
|---|---|
| Message size | 1 MiB from a client |
| One transaction sent in parts | `SYNC_TRANSACTION_LIMIT`, 16 MiB by default, at most 30 MiB |
| Wait between two parts | 30 seconds |
| Presence object | 32 KiB |
| Messages per connection | `RATE_LIMIT_WS`, 1,000 per minute by default |
| Connection attempts per user | `RATE_LIMIT_API`, 100 per minute by default |
| Messages a `CollaborationProvider` sends | At most 300 updates and 600 presence messages per minute |
| Stored state a REST read can apply | 60 MiB: the baseline and its stored updates together |

## Limitations

> [!NOTE]
> Real-time editing needs the WASM engine; the JS engine reports `COLLABORATION_UNAVAILABLE`.
> There is no read-only live view for viewers.

- Rooms live in memory of one API process. Peers connected to different processes do not see
  each other's edits until they reconnect. A room in another process than the one that served
  `PATCH` or the restore checks the stored document when a client connects, when an update
  does not match its baseline, and every 5 minutes; editors connected to it may see the old
  content until then.
- Edits that the server had not acknowledged when the content was replaced are not merged into
  the new content.
- Compaction merges records; it never drops an operation, so a document's stored state
  still grows with its editing history, by a few hundred bytes per typed character. When it
  passes 60 MiB, REST reads, versions and exports of that document fail; replacing its
  content with `PATCH` starts a new baseline. The server does not do that on its own,
  because it would discard the unsent edits of offline editors.
- One operation must fit into a message: a file embedded in an attribute as a `data:` URL
  larger than about 1 MiB cannot be synced.
- Every API process that serves a document must understand `gotipe.crdt/2`. Upgrade all
  processes together: an older one cannot read the records a newer one writes.
- The server keeps nothing for a client that is offline: unsent edits live in the editor's
  memory. See [Offline editing](/docs/collaboration/offline).

## Related

- [Collaboration overview](/docs/collaboration/overview)
- [Collaboration provider](/docs/collaboration/provider)
- [REST API](/docs/cloud/rest-api)
- [Authentication](/docs/cloud/auth)
