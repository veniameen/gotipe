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

There are two update envelopes. Both are replay-safe unions of operations.

`gotipe.crdt/1` is the **full state**: the baseline document and every operation.
`encode_update_since()` and `WasmEditor.get_update()` return it. The version
argument is deliberately not used to omit operations because a maximum-only vector
cannot represent out-of-order gaps. Use it for a local copy, for peers that meet for
the first time and for the server's full-state frame; it is not what an edit sends.

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

`gotipe.crdt/2` carries **operations only**. The baseline is not repeated: the
transport names it by `generation`, an opaque token (see "Operations by
generation"). The engine accepts the envelope without comparing a document and
ignores `generation` and other transport fields; an envelope with `base` is refused.

```json
{ "protocol": "gotipe.crdt/2", "generation": "6c0d6e3f5a1b4c2d8e9f0a1b2c3d4e5f", "operations": [] }
```

In `gotipe.crdt/1` the baseline must match on both peers; its local revision counter
is ignored. An operation ID is immutable. Repeated identical operations are ignored;
conflicting payloads under an existing ID fail atomically. Unsupported old
position-based updates return an error rather than dropping their effects.

### Sending only what a peer lacks

A replica's own Lamport clocks only grow, and a transport that sends its operations
in order with one frame in flight has them confirmed in order. So the operations a
peer has confirmed are a prefix, and one acknowledged clock replaces a set of IDs.

- `encode_local_update_after(after, max_bytes)` /
  `WasmEditor.get_local_update_after(after, maxBytes)` returns this replica's own
  operations with a clock greater than `after`, oldest first, as `gotipe.crdt/2` plus
  `"remaining": n`, the number of later own operations a positive `max_bytes` left
  out, and `"continues"`. Operations received from peers are never included.
  The result ends only after the last operation of a local transaction, so a peer
  never receives half of one: a peer validates the whole document it projects, and
  half a transaction (a heading without its `level`, an image without `src`) is no
  valid document. When the next transaction alone exceeds `max_bytes`, the result
  is the part of it that fits (at least one operation) with `"continues": true`;
  the caller reads the rest with `after` set to the part's last clock.
- `encode_missing_from(remote)` / `WasmEditor.get_update_missing_from(remote)` takes
  a peer's or server's full state and returns the operations it lacks, except this
  replica's own after `"acknowledged"`, the newest of its operations in that state.
  It finds operations restored from a local copy under another peer ID, and gaps;
  the caller sends them once and continues with `after: acknowledged`.

Neither call drains anything or changes the replica. `after` is an exact integer
`0..9007199254740991`; anything else is an error.

A transaction ends with `CrdtDocument::end_transaction`. `try_apply_local`,
`apply_local_document` and undo/redo end their own; `WasmEditor` ends one after each
`apply`, review change and accepted suggestion, so review data travels with the edit
it belongs to. Own operations that no transaction ended, such as ones restored from a
local copy under the same peer ID, travel together with the next transaction. The
newest own operation always ends a result, so nothing waits for an end that never
comes.

### Blocks inside deleted blocks

A block whose ancestor is deleted is not projected: a cell added to a row that
another peer deleted meanwhile (`insertColumn`, `splitCell` against `deleteRow`) is
deleted with the row on every replica, never moved to the root, where no schema
accepts a row or a cell. A block whose parent is not known yet waits the same way.
Its operations stay in the log, and a later local edit does not delete it for good,
so undoing the delete brings it back with its content. Only blocks that concurrent
moves put into a cycle are shown at the root. `ReplicaState::placement` decides it.

Concurrent row, column, merge and split edits can still leave a table whose grid is
not valid (a span past the last row, overlapping cells, rows without a cell at some
position). After a remote update that changed a table, `receiveCollaborationUpdate`
runs `normalizeTableGeometry` (`packages/core/src/table/repair.ts`) and dispatches
its steps as a local transaction with `{ addToHistory: false, origin: "repair" }`,
so every replica receives the repair. The rules are deterministic, and a cell the
repair adds is named after its place (a hash of its row and its index there,
`editor/remote-table-repair.ts`), so replicas that repair the same table the same way
create the same block rather than two.

### Mark order

A character's marks are an ordered list, in the order the local engine produces
(`gotipe-core::transform::marks`, `packages/core/src/engine/mark-rules.ts`): a mark
of a type already present is replaced in place, any other is appended, and removing
and applying a mark again moves it last. The projection keeps this order: `SetMark`
replaces in place or appends, `InsertChar` and the baseline keep their span order,
and replay applies operations in identity order (Lamport clock, then peer ID). Every
replica therefore derives the same order from the same operation set, and the order
of the author's own replica is what the local engine produced, so collaborative undo
and redo restore it. Concurrent marks of different types are ordered by operation
identity. A local edit emits `SetMark` operations in the target's order; when only
the order changed it removes and re-applies the marks that moved back
(`replica/marks.rs`). Exports, REST `content` and HTML nest marks identically on all
peers. Attribute keys inside one mark are an unordered map and are not part of this
contract.

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
- `get_update(): Uint8Array` returns the full state; reading it does not drain it.
- `get_local_update_after(after: number, maxBytes: number): Uint8Array` and
  `get_update_missing_from(remote: Uint8Array): Uint8Array` return operations only
  (see "Sending only what a peer lacks"). In `@gotipe/core` all three are
  `editor.getCollaborationUpdate()`, `({ after, maxBytes })` and `({ missingFrom })`.
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

REST `collaboration_state` contains `{baseline, updates, generation}`. Initialize
the editor with that baseline, enable its peer, and apply all stored envelopes
before accepting new local edits or connecting. Apply them as **one** update (the
union of their operations, `applyCollaborationState` in `@gotipe/collaboration`),
never one by one: the records are a union, not a sequence. A row saved while a
compaction ran precedes the merged row it may depend on, and one record alone may
project a document the schema refuses (a list item without its list). The editor
validates the merged state once. `updates` are stored records in
either envelope: `gotipe.crdt/2` without `generation` for everything written since
generations exist, `gotipe.crdt/1` for older rows until their log is compacted.
`generation` names `baseline` and is passed to the sync handshake. Materialized
document content alone is not a new collaboration baseline. A conflicting baseline
with local operations is rejected.

The host's transaction subscription sends local updates and suppresses a receive
operation from triggering an endless rebroadcast loop. Keep unacknowledged
operations until the server confirms durable persistence. A transport sends only
operations after its acknowledged clock, in order, and after a reconnect derives
that clock again from the server's full state. ACK frames have no payload; a sender
uses one in-flight update or a FIFO ACK queue.

A transaction larger than one message (1 MiB) goes as parts: `gotipe.crdt/2` updates
with `"continues": true`, then the last one without it, sent back to back. Cloud
validates each part, buffers them for that connection, and only with the last part
saves the whole transaction as one record, acknowledges once and relays it as one
update. Nothing of an unfinished transaction is ever saved, acknowledged or relayed:

- A disconnect, or more than 30 seconds without its next part, drops the parts
  (`UPDATE_NOT_SAVED` and a normal close for the pause); the sender sends the
  transaction again whole.
- Any error on a part (an invalid operation, another generation) also closes the
  connection: the sender has already sent the later parts, which must never become a
  transaction of their own.
- One connection's parts may hold `SYNC_TRANSACTION_LIMIT` bytes (16 MiB by default,
  at most 30 MiB, half of what a read applies); more gets `UPDATE_TOO_LARGE` and a
  normal close. All unfinished transactions of one API process share a budget of
  eight times the limit; past it a part gets `UPDATE_NOT_SAVED` and a close, and the
  sender retries.
- A save that would make the generation's stored state (baseline plus records)
  larger than a read applies (60 MiB, `document.MaterializationLimit`) gets
  `DOCUMENT_TOO_LARGE` and is not stored, so the document never becomes unreadable.

After `UPDATE_TOO_LARGE` the provider sends that one transaction again in frames that
stand alone (no `continues`): the edit and every later one can be saved. A peer may
then project a piece the schema refuses; its provider keeps such a relayed update
and merges it with the following ones until the union is valid (at most 32 MiB),
and the next full state holds them anyway. Operations restored under another peer
ID are sent as one transaction, since where theirs ended is unknown, with the same
fallback. `gotipe.crdt/1` cannot continue: over `gotipe.v1` a transaction must fit
into one message, and the provider reports a larger one and stops. Messages from
Cloud to a client, the full state and relayed transactions, are not limited to
1 MiB; a relayed transaction is framed once and shared by all recipients.

The ACK deadline (`acknowledgementTimeout`) starts once the socket's
`bufferedAmount` has drained, so a large transaction on a slow uplink is not taken
for a lost ACK; an upload that makes no progress for the deadline fails the same
way. Only an ACK, or a handshake with nothing pending, resets the reconnect
attempts, so an upload that never completes ends after `maxReconnectAttempts`. A
read with `after` also forgets the transaction ends at or below it, so the table
of boundaries holds only what is still unconfirmed.

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
| `0x02` | Full replication state (`gotipe.crdt/1`): sent after the upgrade and in reply to `0x01` |
| `0x03` | Update envelope: operations, in the connection's protocol |
| `0x04` | Awareness; `{ "peerId": "…", "removed": true }` removes a peer |
| `0x05` | Request current awareness |
| `0x08` | Structured error `{ "code": "…", "message": "…" }` |
| `0x09` | ACK after durable save; duplicate delivery also receives ACK |

| `0x08` code | Sender's reaction |
| --- | --- |
| `UPDATE_NOT_SAVED` | Storage failed; reconnect and resend the unacknowledged operations. |
| `UPDATE_TOO_LARGE` | The parts of one transaction exceed `SYNC_TRANSACTION_LIMIT`; nothing was saved and the server closes the connection. Reconnect and send that transaction in standalone frames. |
| `DOCUMENT_TOO_LARGE` | Saving would make the document's stored state larger than a read applies; nothing was saved. Stop. |
| `BASELINE_REPLACED` | The replica's baseline is obsolete; the server closes the connection. Reload the document over REST and start a new replica. Never retry with the old one. |
| `INVALID_AWARENESS` | Only this presence frame was refused; the connection and the document stay. |
| `INVALID_UPDATE`, `UNKNOWN_MESSAGE` | Protocol error; stop. |

The connection query uses `document_id`, `peer_id` and, for `gotipe.v2`, `generation`.
`peer_id` follows the replica rule of the engine (non-blank, at most 256 bytes, no
`@base` prefix); anything else is refused with HTTP 400 before upgrade, as is
`gotipe.v2` without a `generation` of 1–128 characters `[A-Za-z0-9._~-]`.
Authentication and document write access are
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
The negotiated subprotocol is `gotipe.v2` when the client offers it, otherwise
`gotipe.v1` (see "Operations by generation"); authentication middleware consumes the
credential subprotocol before upgrade. Origins default to same origin. Explicit
`Server.SetAllowedOrigins` entries are exact HTTP(S) scheme/host pairs; wildcard,
null, userinfo, paths and query strings are rejected. Native clients without an
Origin header remain supported and still require authentication.

## Operations by generation

A generation is one baseline of a document: the immutable object in
`documents.r2_key`. Its token is `hex(sha256("gotipe.generation/1\0" + r2_key))[:32]`
(`document.GenerationToken`): replacing the content changes it, and it reveals
nothing about storage. Clients treat it as opaque.

| | `gotipe.v1` | `gotipe.v2` |
| --- | --- | --- |
| Offered by | clients from before generations, or without a `generation` | clients that loaded `collaboration_state.generation` |
| Handshake | none: the baseline of every update is compared | `generation` query parameter is compared with the room's token once |
| Client update (`0x03`) | `gotipe.crdt/1`: baseline plus operations | `gotipe.crdt/2`: `generation` plus operations |
| Relayed update (`0x03`) | `gotipe.crdt/1` with the baseline | `gotipe.crdt/2`, the stored record: no baseline, no generation |
| Full state (`0x02`) | `gotipe.crdt/1` | `gotipe.crdt/1`; sent unasked after the upgrade, so `0x01` is not needed |

The room compares a `gotipe.v2` client's generation when it registers, after checking
the stored generation: a mismatch gets `BASELINE_REPLACED` and a normal close before
any state is sent. The envelope's protocol, not the subprotocol, decides how one
update is checked, so a `gotipe.crdt/2` update must always name the room's
generation: another one is answered like an update from another baseline, none is
`INVALID_UPDATE`. Both kinds of client share a room; each receives updates in its
own protocol. An update's size no longer depends on the document: the provider
fills frames to 512 KiB of whole pending transactions, half of the 1 MiB message
limit; a larger transaction goes whole up to the limit and in parts beyond it.

The room stages an update against its live log without copying it, saves only the
operations it lacks as one `gotipe.crdt/2` record without baseline or token, then
commits them to the log, acknowledges and relays. The cost of an update is its own
size.

## Storage and log compaction

The ordinary baseline remains in `documents.r2_key`. `document_updates` is the
log: every acknowledged operation is in one of its rows, each tagged with the
immutable `generation_key`; readers filter it against the current object key. REST
replacement/restore atomically invalidates old logs. A room loads one generation
(the object and the rows of its key); stored rows are pinned to their generation by
that key, so their baseline, when an old row still repeats it, is not compared
again. A save inserts only while `r2_key` still equals the room's generation. A late
write racing with REST replacement can never enter the new generation's visible
log; it fails with `ErrBaselineReplaced` instead.

`CompactLog(documentID, generation)` replaces the rows of a generation by one row
holding the union of their operations (`sync.LogMerger`, the same validation as a
live update). It reads the rows with their IDs and merges them without a lock, so a
long merge never delays a save. One short transaction then locks the `documents`
row `FOR NO KEY UPDATE`, requires the generation to be current, deletes exactly the
IDs it read and inserts the merged row; if any of those rows is already gone,
another compaction or a replacement got there first and nothing is written. Saves
and a REST replacement of that document wait for the lock; inserts that only
reference the document (comments, versions) do not. A row committed after the read
was not merged, is not deleted and is merged by the next compaction. Because the
merged record lives in the log itself and readers apply rows as a union, a read
during a compaction sees the old rows or the merged row, never less, without a
transaction of its own. The merged row gets a new, higher ID, so a row saved during
the merge precedes it: readers must apply the rows as one union (see
`collaboration_state` above); the room and `gotipe-convert project-crdt` do, the
latter because it validates no schema and replays the whole union each time.

A room calls it on its 5-minute tick after updates, beside its event loop, so saves
and ACKs continue meanwhile (at most 1 minute, one at a time per room), and once its
last client has left (at most 2 minutes, after a running one finished; the room is
already done, so a new room can serve the document). One API process runs at most two
merges at once, since each holds a log in memory; a waiting one gives up at its
deadline and is retried. It is not needed for
durability and is skipped at shutdown. It does nothing until the generation has 256
rows or 4 MiB outside its largest row (the previous merge). A failure or timeout
leaves storage unchanged and is retried.

`document_snapshots` holds checkpoints of servers from before compaction. They are
no longer written. The latest one of a generation is still read with its rows; the
first compaction merges it and deletes the checkpoints up to it, and every old row
that repeated the baseline becomes part of one record without it.

REST content/export must project the baseline plus stored records through the Rust
engine (`gotipe-convert project-crdt`); reading the baseline alone is insufficient.
A read applies at most 60 MiB of baseline and records. Compaction removes repeated
baselines, checkpoints and per-row overhead; it never drops an operation, so a
document's log still grows with its editing history.

All API processes that serve one document must run a version that knows
`gotipe.crdt/2`: an older process cannot read the new records and fails its room
and its REST reads of an edited document explicitly. Upgrade them together.

### Re-baselining (design, not implemented)

For a log that stays large after compaction, the remaining step is to fold it into
a new baseline. It would be opt-in per deployment and run only for a room without
clients: project the content with the native engine, commit it as a new object and
generation in the transaction REST replacement uses (only if no row was added
since), and so drop the log. The costs are why it is not automatic: every replica
of the old generation, including an offline one with unsent edits, gets
`BASELINE_REPLACED` and cannot merge them; character identities change, so comment
anchors (`gotipe.anchor.*`) and review data kept as `SetData` operations must be
re-anchored and carried into the new generation by the engine first. Until then
`PATCH` with `content` or a version restore is the manual form of it.

## Baseline replacement

`PATCH /v1/documents/{id}` with `content` and a version restore commit a new
generation, then notify the sync server (`Server.ReplaceBaseline`). The open room
reloads storage; if the generation changed it adopts the new log and sends
`BASELINE_REPLACED` to every client, which the server then closes normally (1000)
after the frames already queued. A notice for the generation a room already serves
changes nothing. A room in another API process gets no notice, so it compares its
generation with `documents.r2_key` (`CurrentGeneration`) before serving a new client,
when an update's `base` or `generation` differs from its own, and on its 5-minute
tick when it has nothing to compact; a save or compaction of an old generation fails
with `ErrBaselineReplaced`. Whenever the stored generation moved on, the room adopts it and
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
`BASELINE_REPLACED` instead of failing. A `gotipe.v2` replica learns it earlier: the
server refuses its generation at the handshake.

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
