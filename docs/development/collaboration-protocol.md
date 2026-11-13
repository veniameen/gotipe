# Document replication contract

The Rust editor resolves DOM offsets locally in UTF-16 code units. Network changes
refer to stable character and block identities; peers never apply another peer's
numeric text offset directly. The implementation lives in `gotipe-crdt::replica`:
dense sequence positions, per-field writes, deletion tombstones, and text routing
through split/merge. Initial character identities derive from the shared baseline.

## Snapshots and updates

`CrdtDocument::encode_snapshot()` returns an ordinary Rust `Document`. A snapshot
contains content, not the replication history. Use it for document versions and
export; it is not a network update.

`encode_update_since()` and `WasmEditor.get_update()` currently return the complete
idempotent update log. The version argument is deliberately not used to omit
operations because a maximum-only vector cannot represent out-of-order gaps.

```json
{
  "protocol": "gotipe.crdt/1",
  "base": { "version": 0, "blocks": [] },
  "operations": [
    {
      "id": { "lamport": 1, "peer_id": "peer-a" },
      "change": { "DeleteBlock": { "block_id": "block-1" } }
    }
  ]
}
```

The baseline must match on both peers; its local revision counter is ignored.
An operation ID is immutable. Repeated identical operations are ignored;
conflicting payloads under an existing ID fail atomically. Unsupported old
position-based updates return an error rather than dropping their effects.

`SetData` entries carry document-associated `comments` and `suggestions` as typed
JSON strings. Comment endpoints reference character identities in reserved
`gotipe.anchor.*` metadata. `get_comments()` resolves their current UTF-16
positions. A split may produce `CommentAnchor::Range` with endpoints in separate
blocks; deleting all referenced content preserves the discussion as an orphaned
document comment. Review data is not inserted into ordinary block JSON.

## WASM boundary

- `enable_collaboration(peerId: string): void` starts a replica at the current document.
- `apply(transactionJson: string): string` validates the entire transaction before
  updating editor or replication state.
- `get_update(): Uint8Array` returns a replay-safe update; reading it does not drain it.
- `receive_update(bytes: Uint8Array): string` merges atomically and returns the full
  current document JSON. It does not invoke a JavaScript transaction callback.
- `undo_collaboration()` / `redo_collaboration()` return document JSON or `undefined`
  when their stack is empty. They deactivate/reactivate local operation identities;
  concurrent remote operations remain active and the undo itself replicates.
- `can_undo_collaboration()` / `can_redo_collaboration()` expose native history.
  `clear_collaboration_history()` clears stacks without resetting the replica log.
- `set_selection(selectionJson: string)` validates and changes only the native
  selection; `export_selection()` returns it after undo/redo. `Range` preserves
  directional `{anchor:{block_id,offset},head:{block_id,offset}}` endpoints in
  different blocks. Existing `Cursor`, `Text`, `Block`, `Multi` remain supported.

Transactions are staged completely before publication. A validated per-step trace
retains generated split identities while reconciling multi-step edits, so concurrent
text follows splits/merges even when formatting or insertion shares the transaction.
Attributes preserve recursive JSON arrays and objects as well as scalar values.

REST `collaboration_state` contains `{baseline, updates}`. Initialize the editor
with that baseline, enable its peer, and apply all stored envelopes before accepting
new local edits or connecting. Materialized document content alone is not a new
collaboration baseline. A conflicting baseline with local operations is rejected.

The host's transaction subscription sends local updates and suppresses a receive
operation from triggering an endless rebroadcast loop. Keep unacknowledged updates
until the server confirms durable persistence. A transport may omit already
acknowledged operation IDs, but must resend unacknowledged IDs after reconnect.
ACK frames have no payload; a sender uses one in-flight update or a FIFO ACK queue.

Suggestion mode queues validated proposals without applying their document edit.
Acceptance checks the proposal's baseline and applies its transaction atomically;
stale and already-decided proposals return explicit errors. Rejection leaves the
document unchanged and records the decision.

## Cloud frames and persistence

WebSocket messages contain one type byte followed by an uncompressed UTF-8 JSON
payload. Browser clients need no compression runtime.

| Type | Meaning |
| --- | --- |
| `0x01` | Request current replication state |
| `0x02` | Full replication state / handshake response |
| `0x03` | Update envelope |
| `0x04` | Awareness; `{ "peerId": "…", "removed": true }` removes a peer |
| `0x05` | Request current awareness |
| `0x08` | Structured error `{ "code": "…", "message": "…" }` |
| `0x09` | ACK after durable save; duplicate delivery also receives ACK |

| `0x08` code | Sender's reaction |
| --- | --- |
| `UPDATE_NOT_SAVED` | Storage failed; reconnect and resend the unacknowledged operations. |
| `BASELINE_REPLACED` | The replica's baseline is obsolete; the server closes the connection. Reload the document over REST and start a new replica. Never retry with the old one. |
| `INVALID_AWARENESS` | Only this presence frame was refused; the connection and the document stay. |
| `INVALID_UPDATE`, `UNKNOWN_MESSAGE` | Protocol error; stop. |

The connection query uses `document_id` and `peer_id`. `peer_id` follows the replica
rule of the engine (non-blank, at most 256 bytes, no `@base` prefix); anything else is
refused with HTTP 400 before upgrade. Authentication and document write access are
checked before WebSocket upgrade. The room event loop alone owns membership, outgoing
queues, awareness, the operation union and its storage generation. Read pumps post
events. A failed durable write changes neither the in-memory union nor peers.

Awareness is validated, not relayed blindly. A client frame is one JSON object of at
most 32 KiB: `user.name` up to 256 UTF-16 code units, `user.color` `#rgb`/`#rrggbb`,
optional `user.avatar` (`http:`, `https:` or `data:image/`, up to 16384 code units),
optional `cursor {blockId, offset}` and `selection {blockId, from, to}` with a
non-empty block and exact non-negative integers (`from <= to`), and a numeric
`lastActive`. The room stores and relays only these fields with the connection's
`peerId`; `removed` and unknown fields are dropped. An invalid frame is answered with
`INVALID_AWARENESS` to its sender only and is neither stored nor relayed; the
sender's previous valid presence stays. Receivers still validate: an unreadable
presence removes only that peer and is reported without closing anything.
`@gotipe/collaboration` validates its own user at configuration time, sends
presence only when the user, caret or one-block selection changes (remote merges
alone do not count), at most once per 100 ms after the change, and re-announces
it after every handshake.
The negotiated subprotocol is `gotipe.v1`; authentication middleware consumes the
credential subprotocol before upgrade. Origins default to same origin. Explicit
`Server.SetAllowedOrigins` entries are exact HTTP(S) scheme/host pairs; wildcard,
null, userinfo, paths and query strings are rejected. Native clients without an
Origin header remain supported and still require authentication.

The ordinary baseline remains in `documents.r2_key`. Immutable deltas are stored in
`document_updates`; replication checkpoints use `document_snapshots`. Neither is
written over the ordinary document object. REST replacement/restore atomically
invalidates old logs. Each record also carries the immutable `generation_key`;
readers filter it against the current object key. A room loads one generation
(object, checkpoint and updates for that key) and validates every update's `base`
against it; saves and checkpoints insert only while `r2_key` still equals the room's
generation. A late write racing with REST replacement can never enter the new
generation's visible log; it fails with `ErrBaselineReplaced` instead.

REST content/export must project the baseline plus stored updates through the Rust
engine (`gotipe-convert project-crdt`); reading the baseline alone is insufficient.
Checkpoints do not justify discarding older updates unless coverage is proven.
The current adapter retains the durable log and deduplicates replay.

## Baseline replacement

`PATCH /v1/documents/{id}` with `content` and a version restore commit a new
generation, then notify the sync server (`Server.ReplaceBaseline`). The open room
reloads storage; if the generation changed it adopts the new log and sends
`BASELINE_REPLACED` to every client, which the server then closes normally (1000)
after the frames already queued. A notice for the generation a room already serves
changes nothing. A room in another API process gets no notice, so it compares its
generation with `documents.r2_key` (`CurrentGeneration`) before serving a new client,
when an update's `base` differs from its baseline, and on its 5-minute tick when it
has nothing to checkpoint; a save or checkpoint of an old generation fails with
`ErrBaselineReplaced`. Whenever the stored generation moved on, the room adopts it and
resynchronizes its clients, so a client that loaded the new content is never served
the old one. An update from another baseline while the stored generation is still the
room's gets `BASELINE_REPLACED` for its sender only; if the generation cannot be read,
it gets `UPDATE_NOT_SAVED`. If storage cannot be reloaded, clients still receive
`BASELINE_REPLACED` and the room stops instead of serving an obsolete log.

A save advances the document row first (`UPDATE … WHERE r2_key = generation`) and
inserts the delta only from the row it changed. A save waiting for a REST
replacement's row lock therefore matches nothing after the replacement commits and
inserts no delta of the old generation.

A replica cannot change its baseline: the provider stops, keeps unconfirmed
operations in the editor (`getSyncState().pendingOperations`) and calls
`onBaselineReplaced` (or `onError`). The host loads `collaboration_state` again and
creates a new editor and provider. The provider also recognizes a replacement that
happened while it was offline: when the editor rejects a full state (`0x02`) whose
`base` differs from its own (ignoring the revision counter), it reacts as to
`BASELINE_REPLACED` instead of failing.

## Exact clocks and failure boundaries

Operation clocks, including character targets and position components, must fit
JavaScript's exact integer range `0..9007199254740991`; real operation identities
start at 1. Rust and Go reject larger wire values before changing the log. Local
allocation returns an error at exhaustion. Projection, text, undo, comments and
proposals are staged so exhaustion cannot publish a partial edit. Native callers
handling external input should use `CrdtDocument::try_new`, `try_apply_local` and
`try_set_data`; the legacy infallible entry points require previously validated
inputs and available clock space.

`SyncProtocol` uses the same single-type-byte WebSocket framing as Cloud. Legacy
flags remain zero for source compatibility; payloads are never implicitly
compressed or concatenated. Legacy positional operations have no guessed inverse:
`try_inverse` reports missing history rather than inventing deleted text.

Version snapshot storage has a separate `GTS1` header and explicit plain/zstd
codec flag. Decoders accept older plain JSON or zstd frames, enforce a 64 MiB
decoded limit, and reject unavailable/unknown compression explicitly. A storage
snapshot is not a CRDT checkpoint or a WebSocket frame.
