# GoTipe — Real-time Collaboration

## Обзор

GoTipe использует CRDT (Conflict-free Replicated Data Type) для real-time collaboration. CRDT встроен в ядро — collaboration работает без облака, через self-hosted сервер или peer-to-peer.

```
┌──────────┐      WebSocket       ┌──────────────┐      WebSocket       ┌──────────┐
│ Client A │ ◄──────────────────► │  Sync Server │ ◄──────────────────► │ Client B │
│          │   binary updates     │              │   binary updates     │          │
│ CRDT Doc │                      │  CRDT Doc    │                      │ CRDT Doc │
│ (WASM)   │                      │  (Rust/Go)   │                      │ (WASM)   │
└──────────┘                      │              │                      └──────────┘
                                  │  PostgreSQL  │
                                  │  (persistence)│
                                  └──────────────┘
```

---

## Почему CRDT, а не OT

| Аспект | CRDT | OT (Operational Transform) |
|--------|------|---------------------------|
| **Сервер** | Опциональный (peer-to-peer возможен) | Обязателен (центральный transform server) |
| **Offline** | Полная поддержка — merge при reconnect | Ограниченная — нужен server для transform |
| **Conflict resolution** | Автоматическая, математически доказанная | Ручные правила, сложные edge cases |
| **Latency** | Immediate local apply, async sync | Optimistic local, server round-trip для confirm |
| **Complexity** | Сложнее document model, проще protocol | Проще model, сложнее transform functions |
| **Scalability** | Каждый peer — independent | Server — bottleneck |
| **Undo/Redo** | Через CRDT history (built-in) | Отдельная система |
| **Кто использует** | Figma, Linear, Notion (partial) | Google Docs, Tiptap (via Yjs — CRDT!) |

**Решение:** CRDT даёт offline-first, peer-to-peer support и mathematical correctness. OT требует центральный сервер и имеет известные edge cases при >2 concurrent users. Примечание: Yjs (который использует Tiptap) — это тоже CRDT, не OT.

### Выбор CRDT engine

| Library | Approach | Performance (B4) | Doc size | Rust? | Rich Text? | Tree? |
|---------|----------|-------------------|----------|-------|------------|-------|
| **Loro** | Rust/WASM CRDT | 3,089ms | 258KB | Да | Да (v1.0+) | MovableTree |
| **Yjs** | JS CRDT | 5,714ms | 159KB | Нет | Да | Нет (Map) |
| **Automerge** | Rust/WASM CRDT | 14,326ms | 129KB | Да | Да (basic) | Нет |
| **Diamond Types** | Rust CRDT | Fastest raw | Smallest | Да | Text only | Нет |
| **Custom (GoTipe)** | Loro-inspired, Rust | Target: <2,000ms | Target: <200KB | Да | Да | MovableTree |

**Решение:** Loro-inspired custom engine в Rust. Причины:
1. Loro доказал, что Rust CRDT быстрее Yjs на B4 benchmark (3,089ms vs 5,714ms)
2. MovableTree — критичен для block editor (drag-and-drop blocks)
3. Свой engine позволяет tight integration с GoTipe document model
4. Rich Text CRDT с marks — проверено Loro v1.0+
5. Если Loro стабилизирует API до релиза — возможен прямой Loro dependency вместо custom

---

## CRDT Engine (gotipe-crdt)

### Архитектура

```rust
// crates/gotipe-crdt/src/doc.rs

use crate::text::RichTextCrdt;
use crate::tree::MovableTreeCrdt;
use crate::sync::SyncProtocol;

/// Peer ID — уникальный идентификатор участника
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PeerId(pub String);

/// CRDT Document — содержит всё состояние для collaboration
pub struct CrdtDocument {
    peer_id: PeerId,
    /// Block tree — CRDT для структуры блоков
    tree: MovableTreeCrdt,
    /// Rich text per block — CRDT для текстового содержимого
    texts: HashMap<BlockId, RichTextCrdt>,
    /// Block attributes — last-writer-wins register
    attrs: HashMap<BlockId, LwwMap<String, AttrValue>>,
    /// Version vector — для sync
    version: VersionVector,
    /// History — для undo/redo
    history: CrdtHistory,
}

impl CrdtDocument {
    pub fn new(peer_id: &str, initial_doc: Document) -> Result<Self, CrdtError> {
        let peer = PeerId(peer_id.to_string());
        let mut tree = MovableTreeCrdt::new(peer.clone());
        let mut texts = HashMap::new();
        let mut attrs = HashMap::new();

        // Initialize CRDT from document
        for block in initial_doc.flatten() {
            tree.insert(block.id.clone(), block.parent_id(), block.index())?;
            if let BlockContent::RichText(spans) = &block.content {
                let mut text_crdt = RichTextCrdt::new(peer.clone());
                text_crdt.init_from_spans(spans)?;
                texts.insert(block.id.clone(), text_crdt);
            }
            attrs.insert(block.id.clone(), LwwMap::from(block.attrs.clone()));
        }

        Ok(CrdtDocument {
            peer_id: peer,
            tree,
            texts,
            attrs,
            version: VersionVector::new(),
            history: CrdtHistory::new(),
        })
    }

    /// Apply local editor step → generate CRDT operations
    pub fn apply_local(&mut self, steps: &[Step]) -> Result<Vec<CrdtOp>, CrdtError> {
        let mut ops = Vec::new();
        for step in steps {
            match step {
                Step::InsertText { block_id, offset, text, marks } => {
                    let text_crdt = self.texts.get_mut(block_id)
                        .ok_or(CrdtError::BlockNotFound)?;
                    let op = text_crdt.insert(*offset, text, marks)?;
                    ops.push(CrdtOp::Text(block_id.clone(), op));
                }
                Step::DeleteText { block_id, from, to } => {
                    let text_crdt = self.texts.get_mut(block_id)
                        .ok_or(CrdtError::BlockNotFound)?;
                    let op = text_crdt.delete(*from, *to)?;
                    ops.push(CrdtOp::Text(block_id.clone(), op));
                }
                Step::InsertBlock { parent_id, index, block } => {
                    let op = self.tree.insert(
                        block.id.clone(),
                        parent_id.clone(),
                        *index,
                    )?;
                    ops.push(CrdtOp::Tree(op));

                    // Initialize text CRDT for new block
                    if let BlockContent::RichText(_) = &block.content {
                        self.texts.insert(
                            block.id.clone(),
                            RichTextCrdt::new(self.peer_id.clone()),
                        );
                    }
                }
                Step::MoveBlock { block_id, new_parent_id, new_index } => {
                    let op = self.tree.move_node(
                        block_id.clone(),
                        new_parent_id.clone(),
                        *new_index,
                    )?;
                    ops.push(CrdtOp::Tree(op));
                }
                Step::SetBlockAttrs { block_id, attrs: new_attrs } => {
                    let lww = self.attrs.entry(block_id.clone())
                        .or_insert_with(|| LwwMap::new());
                    for (k, v) in new_attrs {
                        lww.set(k.clone(), v.clone(), self.version.tick(&self.peer_id));
                    }
                    ops.push(CrdtOp::Attrs(block_id.clone(), new_attrs.clone()));
                }
                // ... другие steps
                _ => {}
            }
        }
        self.history.record(ops.clone());
        Ok(ops)
    }

    /// Apply remote binary update
    pub fn apply_remote(&mut self, encoded: &[u8]) -> Result<Vec<Step>, CrdtError> {
        let ops = SyncProtocol::decode(encoded)?;
        let mut steps = Vec::new();

        for op in ops {
            match op {
                CrdtOp::Text(block_id, text_op) => {
                    let text_crdt = self.texts.get_mut(&block_id)
                        .ok_or(CrdtError::BlockNotFound)?;
                    let step = text_crdt.apply_remote(text_op)?;
                    steps.push(step);
                }
                CrdtOp::Tree(tree_op) => {
                    let step = self.tree.apply_remote(tree_op)?;
                    steps.push(step);
                }
                CrdtOp::Attrs(block_id, attrs) => {
                    let lww = self.attrs.entry(block_id.clone())
                        .or_insert_with(|| LwwMap::new());
                    lww.merge(attrs.clone());
                    steps.push(Step::SetBlockAttrs { block_id, attrs });
                }
            }
        }

        self.version.merge_remote(&SyncProtocol::version_from(encoded)?);
        Ok(steps)
    }

    /// Encode all changes since given version
    pub fn encode_update_since(&self, since: &VersionVector) -> Vec<u8> {
        SyncProtocol::encode_since(&self.tree, &self.texts, &self.attrs, since)
    }

    /// Full document snapshot (binary)
    pub fn encode_snapshot(&self) -> Vec<u8> {
        SyncProtocol::encode_snapshot(&self.tree, &self.texts, &self.attrs)
    }
}
```

---

## Sync Protocol

### WebSocket Binary Protocol

```
┌──────────────────────────────────────────────────────┐
│                  Message Frame                        │
│                                                      │
│  ┌──────┬───────┬──────────────────────────────────┐ │
│  │ Type │ Flags │            Payload                │ │
│  │ 1B   │ 1B    │          variable                 │ │
│  └──────┴───────┴──────────────────────────────────┘ │
│                                                      │
│  Types:                                              │
│    0x01 = SyncStep1 (version vector)                 │
│    0x02 = SyncStep2 (missing updates)                │
│    0x03 = Update (incremental)                       │
│    0x04 = Awareness (presence/cursors)               │
│    0x05 = AwarenessQuery                             │
│    0x06 = Snapshot (full document)                   │
│    0x07 = SnapshotRequest                            │
│    0x08 = Auth                                       │
│    0x09 = Error                                      │
│                                                      │
│  Flags:                                              │
│    bit 0 = compressed (zstd)                         │
│    bit 1 = requires ack                              │
│    bit 2 = is response                               │
└──────────────────────────────────────────────────────┘
```

### Sync Flow

```
Client A                    Server                     Client B
   │                          │                           │
   │──── Auth (0x08) ────────►│                           │
   │◄─── Auth OK ─────────────│                           │
   │                          │                           │
   │── SyncStep1 (0x01) ────►│                           │
   │   [version vector]       │                           │
   │                          │                           │
   │◄── SyncStep2 (0x02) ────│                           │
   │   [missing updates]      │                           │
   │                          │                           │
   │── Awareness (0x04) ─────►│── Awareness (0x04) ─────►│
   │   [cursor, selection]    │   [cursor A info]         │
   │                          │                           │
   │                          │◄── SyncStep1 (0x01) ─────│
   │                          │── SyncStep2 (0x02) ─────►│
   │                          │                           │
   │                       ... editing ...                │
   │                          │                           │
   │── Update (0x03) ────────►│── Update (0x03) ────────►│
   │   [CRDT ops, binary]    │   [forwarded]             │
   │                          │                           │
   │                          │◄── Update (0x03) ─────────│
   │◄── Update (0x03) ────────│   [CRDT ops from B]      │
```

### Binary Encoding

```rust
// crates/gotipe-crdt/src/sync.rs
use std::io::{Write, Read, Cursor};

pub struct SyncProtocol;

impl SyncProtocol {
    const MSG_SYNC_STEP1: u8 = 0x01;
    const MSG_SYNC_STEP2: u8 = 0x02;
    const MSG_UPDATE: u8 = 0x03;
    const MSG_AWARENESS: u8 = 0x04;

    const FLAG_COMPRESSED: u8 = 0x01;
    const FLAG_REQUIRES_ACK: u8 = 0x02;

    /// Encode a CRDT update into binary frame
    pub fn encode_update(ops: &[CrdtOp]) -> Vec<u8> {
        let mut buf = Vec::new();

        // Header
        buf.push(Self::MSG_UPDATE);
        let mut flags = 0u8;

        // Encode ops
        let ops_bytes = Self::encode_ops(ops);

        // Compress if >1KB
        let payload = if ops_bytes.len() > 1024 {
            flags |= Self::FLAG_COMPRESSED;
            zstd::encode_all(Cursor::new(&ops_bytes), 3).unwrap_or(ops_bytes)
        } else {
            ops_bytes
        };

        buf.push(flags);

        // Length prefix (4 bytes, big-endian)
        buf.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        buf.extend_from_slice(&payload);

        buf
    }

    /// Decode a binary frame
    pub fn decode(data: &[u8]) -> Result<Vec<CrdtOp>, SyncError> {
        if data.len() < 6 {
            return Err(SyncError::TooShort);
        }

        let msg_type = data[0];
        let flags = data[1];
        let len = u32::from_be_bytes([data[2], data[3], data[4], data[5]]) as usize;

        let payload = &data[6..6 + len];

        let decompressed = if flags & Self::FLAG_COMPRESSED != 0 {
            zstd::decode_all(Cursor::new(payload))?
        } else {
            payload.to_vec()
        };

        match msg_type {
            Self::MSG_UPDATE => Self::decode_ops(&decompressed),
            Self::MSG_SYNC_STEP1 => Self::decode_version_vector(&decompressed),
            Self::MSG_SYNC_STEP2 => Self::decode_ops(&decompressed),
            _ => Err(SyncError::UnknownMessageType(msg_type)),
        }
    }

    fn encode_ops(ops: &[CrdtOp]) -> Vec<u8> {
        // Compact binary encoding:
        // - VarInt for op count
        // - For each op: type byte + fields
        // - Strings: length-prefixed UTF-8
        // - Numbers: VarInt
        let mut buf = Vec::new();
        Self::write_varint(&mut buf, ops.len() as u64);
        for op in ops {
            op.encode(&mut buf);
        }
        buf
    }

    fn write_varint(buf: &mut Vec<u8>, mut value: u64) {
        loop {
            let byte = (value & 0x7F) as u8;
            value >>= 7;
            if value == 0 {
                buf.push(byte);
                break;
            }
            buf.push(byte | 0x80);
        }
    }
}
```

---

## Awareness (Presence & Cursors)

```rust
// crates/gotipe-crdt/src/awareness.rs

use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwarenessState {
    pub peer_id: PeerId,
    pub user: UserInfo,
    pub cursor: Option<CursorPosition>,
    pub selection: Option<SelectionRange>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub name: String,
    pub color: String,    // hex color для cursor/selection
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    pub block_id: BlockId,
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionRange {
    pub anchor_block: BlockId,
    pub anchor_offset: usize,
    pub head_block: BlockId,
    pub head_offset: usize,
}

pub struct AwarenessProtocol {
    local: AwarenessState,
    remotes: HashMap<PeerId, AwarenessState>,
    /// Timeout для удаления stale peers (30 секунд)
    timeout_ms: u64,
}

impl AwarenessProtocol {
    pub fn new(peer_id: PeerId, user: UserInfo) -> Self {
        AwarenessProtocol {
            local: AwarenessState {
                peer_id,
                user,
                cursor: None,
                selection: None,
                timestamp: Self::now(),
            },
            remotes: HashMap::new(),
            timeout_ms: 30_000,
        }
    }

    /// Update local cursor position
    pub fn set_cursor(&mut self, block_id: BlockId, offset: usize) -> Vec<u8> {
        self.local.cursor = Some(CursorPosition { block_id, offset });
        self.local.selection = None;
        self.local.timestamp = Self::now();
        self.encode_local()
    }

    /// Update local selection
    pub fn set_selection(&mut self, selection: SelectionRange) -> Vec<u8> {
        self.local.cursor = None;
        self.local.selection = Some(selection);
        self.local.timestamp = Self::now();
        self.encode_local()
    }

    /// Apply remote awareness update
    pub fn apply_remote(&mut self, data: &[u8]) -> Result<Vec<AwarenessEvent>, AwarenessError> {
        let states: Vec<AwarenessState> = Self::decode(data)?;
        let mut events = Vec::new();

        for state in states {
            let peer_id = state.peer_id.clone();
            if peer_id == self.local.peer_id {
                continue; // skip own state
            }

            let event = if self.remotes.contains_key(&peer_id) {
                AwarenessEvent::Updated(state.clone())
            } else {
                AwarenessEvent::Joined(state.clone())
            };

            self.remotes.insert(peer_id, state);
            events.push(event);
        }

        // Clean up stale peers
        let now = Self::now();
        let stale: Vec<PeerId> = self.remotes.iter()
            .filter(|(_, s)| now - s.timestamp > self.timeout_ms)
            .map(|(id, _)| id.clone())
            .collect();

        for id in stale {
            self.remotes.remove(&id);
            events.push(AwarenessEvent::Left(id));
        }

        Ok(events)
    }

    /// Get all remote awareness states
    pub fn remotes(&self) -> &HashMap<PeerId, AwarenessState> {
        &self.remotes
    }

    fn now() -> u64 {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
    }

    fn encode_local(&self) -> Vec<u8> {
        let mut buf = vec![SyncProtocol::MSG_AWARENESS, 0]; // type + flags
        let payload = serde_json::to_vec(&self.local).unwrap();
        buf.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        buf.extend_from_slice(&payload);
        buf
    }
}

pub enum AwarenessEvent {
    Joined(AwarenessState),
    Updated(AwarenessState),
    Left(PeerId),
}
```

### TypeScript API для awareness

```typescript
// packages/collaboration/src/awareness.ts
import type { AwarenessState, UserInfo, CursorPosition } from './types';

export interface AwarenessOptions {
  user: UserInfo;
  /** Heartbeat interval in ms (default: 10000) */
  heartbeatInterval?: number;
}

// Используется в React adapter:
// const { users, localUser } = useCollaborationAwareness(editor);
```

---

## Self-Hosted Sync Server

### Архитектура (Go)

```
┌─────────────────────────────────────────────────────────────┐
│                   GoTipe Sync Server                         │
│                                                             │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  HTTP Handler │  │  WS Handler  │  │  Auth Middleware │  │
│  │  /health      │  │  /ws/:docId  │  │  API Key / JWT  │  │
│  │  /api/docs    │  │              │  │                 │  │
│  └───────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│          │                 │                    │            │
│          ▼                 ▼                    ▼            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Room Manager                       │    │
│  │                                                     │    │
│  │  room:doc-123 → Room {                              │    │
│  │    clients: [ws1, ws2],                              │    │
│  │    crdt_state: Vec<u8>,                              │    │
│  │    awareness: HashMap<PeerId, AwarenessState>,       │    │
│  │    last_saved: Instant,                              │    │
│  │  }                                                  │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                   │
│  ┌──────────────────────┼──────────────────────────────┐    │
│  │              Persistence Layer                       │    │
│  │                      │                              │    │
│  │  ┌──────────┐  ┌────┴─────┐  ┌──────────────────┐  │    │
│  │  │PostgreSQL│  │  Valkey  │  │ R2 (snapshots)   │  │    │
│  │  │ metadata │  │  pubsub  │  │ binary CRDT state │  │    │
│  │  │ history  │  │  cache   │  │                  │  │    │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Go Server (core)

```go
// apps/cloud/sync/server.go
package sync

import (
    "context"
    "log/slog"
    "net/http"
    "sync"
    "time"

    "github.com/gorilla/websocket"
)

type SyncServer struct {
    rooms    map[string]*Room
    mu       sync.RWMutex
    store    PersistenceStore
    upgrader websocket.Upgrader
    logger   *slog.Logger
}

type Room struct {
    documentID string
    clients    map[string]*Client
    crdtState  []byte // binary CRDT snapshot
    awareness  map[string][]byte
    mu         sync.RWMutex
    lastSaved  time.Time
    saveTimer  *time.Timer
}

type Client struct {
    peerID string
    conn   *websocket.Conn
    send   chan []byte
}

func NewSyncServer(store PersistenceStore, logger *slog.Logger) *SyncServer {
    return &SyncServer{
        rooms:  make(map[string]*Room),
        store:  store,
        logger: logger,
        upgrader: websocket.Upgrader{
            ReadBufferSize:  4096,
            WriteBufferSize: 4096,
            CheckOrigin:     func(r *http.Request) bool { return true },
        },
    }
}

func (s *SyncServer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    docID := r.PathValue("docId")
    peerID := r.URL.Query().Get("peerId")

    conn, err := s.upgrader.Upgrade(w, r, nil)
    if err != nil {
        s.logger.Error("upgrade failed", "error", err)
        return
    }

    room := s.getOrCreateRoom(docID)
    client := &Client{
        peerID: peerID,
        conn:   conn,
        send:   make(chan []byte, 256),
    }

    room.addClient(client)
    defer room.removeClient(client)

    // Send current CRDT state
    room.mu.RLock()
    if len(room.crdtState) > 0 {
        client.send <- encodeSnapshot(room.crdtState)
    }
    // Send current awareness
    for _, state := range room.awareness {
        client.send <- state
    }
    room.mu.RUnlock()

    // Read/write loops
    go client.writePump()
    client.readPump(room, s)
}

func (c *Client) readPump(room *Room, server *SyncServer) {
    defer c.conn.Close()

    for {
        _, message, err := c.conn.ReadMessage()
        if err != nil {
            break
        }

        if len(message) < 2 {
            continue
        }

        msgType := message[0]

        switch msgType {
        case 0x03: // Update
            // Apply to room CRDT state
            room.mu.Lock()
            room.crdtState = mergeCrdtUpdate(room.crdtState, message[2:])
            room.scheduleSave(server.store)
            room.mu.Unlock()

            // Broadcast to other clients
            room.broadcast(message, c.peerID)

        case 0x04: // Awareness
            room.mu.Lock()
            room.awareness[c.peerID] = message
            room.mu.Unlock()
            room.broadcast(message, c.peerID)
        }
    }
}

func (r *Room) broadcast(message []byte, excludePeer string) {
    r.mu.RLock()
    defer r.mu.RUnlock()

    for _, client := range r.clients {
        if client.peerID != excludePeer {
            select {
            case client.send <- message:
            default:
                // Client buffer full, skip
            }
        }
    }
}

func (r *Room) scheduleSave(store PersistenceStore) {
    if r.saveTimer != nil {
        r.saveTimer.Stop()
    }
    // Debounce: save 2 seconds after last update
    r.saveTimer = time.AfterFunc(2*time.Second, func() {
        r.mu.RLock()
        state := make([]byte, len(r.crdtState))
        copy(state, r.crdtState)
        r.mu.RUnlock()

        ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
        defer cancel()
        _ = store.SaveDocument(ctx, r.documentID, state)
    })
}
```

### Persistence Interface

```go
// apps/cloud/sync/persistence.go
package sync

import "context"

type PersistenceStore interface {
    // Load CRDT state for a document
    LoadDocument(ctx context.Context, docID string) ([]byte, error)

    // Save CRDT state (full snapshot)
    SaveDocument(ctx context.Context, docID string, state []byte) error

    // Save incremental update (for history)
    SaveUpdate(ctx context.Context, docID string, update []byte) error

    // Get document history (list of versions)
    GetHistory(ctx context.Context, docID string, limit int) ([]Version, error)

    // Get document at specific version
    GetVersion(ctx context.Context, docID string, version uint64) ([]byte, error)
}

type Version struct {
    Number    uint64
    Timestamp int64
    PeerID    string
    Size      int64
}
```

### PostgreSQL Schema

```sql
-- Metadata & history
CREATE TABLE documents (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    owner_id    TEXT NOT NULL,
    -- Latest version number
    version     BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE document_snapshots (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version     BIGINT NOT NULL,
    -- Binary CRDT snapshot stored in Cloudflare R2, this is the key
    r2_key      TEXT NOT NULL,
    size_bytes  BIGINT NOT NULL,
    peer_id     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_id, version)
);

CREATE TABLE document_updates (
    id          BIGSERIAL PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    -- Binary CRDT update (incremental)
    data        BYTEA NOT NULL,
    peer_id     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_updates_doc_id ON document_updates(document_id, id);

-- Compact old updates into snapshot every N updates
-- Triggered by application logic, not DB trigger
```

---

## Conflict Resolution

### Text Conflicts (Rich Text CRDT)

| Сценарий | Результат |
|----------|----------|
| A и B вставляют текст в одну позицию | Оба текста сохраняются, порядок по peer_id (deterministic) |
| A удаляет текст, B форматирует тот же текст | Текст удалён (delete wins by default) |
| A делает bold, B делает italic на том же range | Оба marks применены (marks не конфликтуют) |
| A делает heading 2, B делает heading 3 (attrs) | Last-writer-wins по timestamp |

### Block Tree Conflicts

| Сценарий | Результат |
|----------|----------|
| A и B перемещают блок в разные места | MovableTree CRDT: один wins (deterministic), второй move ignored |
| A удаляет блок, B редактирует этот блок | Блок удалён, правки B потеряны (delete wins) |
| A и B создают блок в одном месте | Оба блока сохранены, порядок по peer_id |
| A делает блок дочерним B, B делает B дочерним A (cycle) | MovableTree обнаруживает cycle, второй move ignored |

---

## Offline Support

```
┌─────────────────────────────────────────┐
│            Offline Mode Flow             │
│                                         │
│  1. User edits while offline            │
│     ┌─────────┐                         │
│     │  CRDT   │ ← all changes stored    │
│     │  Local  │   as CRDT operations    │
│     │  State  │                         │
│     └─────────┘                         │
│                                         │
│  2. Connection restored                  │
│     ┌─────────┐      ┌──────────┐      │
│     │  Local  │ ───► │  Server  │      │
│     │  CRDT   │ sync │  CRDT    │      │
│     │         │ ◄─── │          │      │
│     └─────────┘      └──────────┘      │
│                                         │
│  3. Automatic merge (CRDT guarantees)    │
│     - No user intervention needed       │
│     - All changes from all peers merged │
│     - Deterministic final state         │
└─────────────────────────────────────────┘
```

```typescript
// packages/collaboration/src/provider.ts
export class GoTipeProvider {
  private ws: WebSocket | null = null;
  private pendingUpdates: Uint8Array[] = [];
  private reconnectAttempt = 0;

  constructor(
    private url: string,
    private documentId: string,
    private editor: GoTipeEditor,
  ) {
    this.connect();

    // Listen for online/offline events
    window.addEventListener('online', () => this.connect());
    window.addEventListener('offline', () => this.disconnect());

    // Store updates locally when offline
    editor.on('update', ({ update }) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(update);
      } else {
        this.pendingUpdates.push(update);
        // Persist to IndexedDB for crash recovery
        this.persistLocally(update);
      }
    });
  }

  private connect() {
    this.ws = new WebSocket(`${this.url}/ws/${this.documentId}`);

    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Send all pending updates
      for (const update of this.pendingUpdates) {
        this.ws!.send(update);
      }
      this.pendingUpdates = [];
    };

    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      this.editor.receiveUpdate(data);
    };

    this.ws.onclose = () => {
      // Exponential backoff reconnect
      const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
      this.reconnectAttempt++;
      setTimeout(() => this.connect(), delay);
    };
  }

  destroy() {
    this.ws?.close();
  }
}
```

---

## Benchmarks

### Latency (target)

| Операция | Local (WASM) | Network (server) | Total |
|----------|-------------|-------------------|-------|
| Keystroke apply | <1ms | — | <1ms |
| CRDT op generation | <0.5ms | — | <0.5ms |
| CRDT op encoding | <0.1ms | — | <0.1ms |
| Network round-trip | — | 20-100ms | 20-100ms |
| Remote op apply | <0.5ms | — | <0.5ms |
| **Total collaboration latency** | | | **~25-105ms** |

### Throughput

| Metric | Target |
|--------|--------|
| Operations per second (single client) | >10,000 ops/s |
| Concurrent clients per room | >50 |
| Concurrent rooms per server | >10,000 |
| Max document size | 100MB CRDT state |
| Max operations in memory | 1M ops before compaction |

### Document Size Limits

| Document | Blocks | CRDT State Size | Sync Time (initial) |
|----------|--------|-----------------|---------------------|
| Small (blog post) | ~50 | ~10KB | <50ms |
| Medium (report) | ~500 | ~100KB | <200ms |
| Large (book chapter) | ~5,000 | ~1MB | <1s |
| Very Large (manual) | ~50,000 | ~10MB | ~5s |

---

## Provider Pattern

GoTipe collaboration поддерживает pluggable providers — любой transport для sync.

```typescript
// packages/collaboration/src/types.ts
export interface CollaborationProvider {
  /** Connect to document */
  connect(documentId: string): void;

  /** Disconnect */
  disconnect(): void;

  /** Send local CRDT update */
  sendUpdate(update: Uint8Array): void;

  /** Send awareness update */
  sendAwareness(state: Uint8Array): void;

  /** Event: received remote update */
  onUpdate(callback: (update: Uint8Array) => void): void;

  /** Event: received awareness update */
  onAwareness(callback: (state: Uint8Array) => void): void;

  /** Event: connection status changed */
  onStatus(callback: (status: 'connected' | 'connecting' | 'disconnected') => void): void;

  /** Destroy provider */
  destroy(): void;
}
```

### Built-in Providers

| Provider | Transport | Self-hosted | Cloud |
|----------|-----------|-------------|-------|
| `GoTipeProvider` | WebSocket | GoTipe sync server | GoTipe Cloud |
| `WebRTCProvider` | WebRTC | Peer-to-peer (STUN/TURN) | Optional signaling |
| `BroadcastProvider` | BroadcastChannel | Same browser (tabs) | N/A |
| `IndexedDBProvider` | IndexedDB | Local persistence | N/A |

### Yjs Compatibility (adapter)

```typescript
// packages/collaboration/src/adapters/yjs.ts
// Для миграции с Tiptap/Yjs:
import { YjsAdapter } from '@gotipe/collaboration/adapters/yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

// Существующий Hocuspocus сервер работает с GoTipe
const hocuspocus = new HocuspocusProvider({
  url: 'wss://your-hocuspocus-server.com',
  name: 'doc-123',
});

const editor = createEditor({
  extensions: [
    Collaboration.configure({
      provider: new YjsAdapter(hocuspocus),
    }),
  ],
});
```

### Liveblocks Compatibility

```typescript
// packages/collaboration/src/adapters/liveblocks.ts
import { LiveblocksAdapter } from '@gotipe/collaboration/adapters/liveblocks';
import { createClient } from '@liveblocks/client';

const client = createClient({ publicApiKey: 'pk_...' });

const editor = createEditor({
  extensions: [
    Collaboration.configure({
      provider: new LiveblocksAdapter(client, { roomId: 'doc-123' }),
    }),
  ],
});
```

---

## Связанные документы

- [01-architecture.md](01-architecture.md) — общая архитектура и CRDT crate
- [03-editor-core.md](03-editor-core.md) — EditorState, Transactions, Steps
- [10-cloud.md](10-cloud.md) — GoTipe Cloud sync service
- [12-release-plan.md](12-release-plan.md) — план реализации collaboration
