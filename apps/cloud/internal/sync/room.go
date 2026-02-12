package sync

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/klauspost/compress/zstd"
)

const (
	zstdThreshold     = 1024 // compress payloads > 1KB
	saveInterval      = 5 * time.Second
	snapshotInterval  = 5 * time.Minute
)

// Room manages a set of clients connected to a single document
type Room struct {
	documentID string
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
	persist    PersistenceStore
	log        *slog.Logger

	// Document state
	docState   []byte // current CRDT state
	awareness  map[string][]byte // peerID -> awareness state
	mu         sync.RWMutex

	// Compression
	encoder *zstd.Encoder
	decoder *zstd.Decoder

	// Lifecycle
	done chan struct{}
}

func NewRoom(documentID string, persist PersistenceStore, log *slog.Logger) *Room {
	encoder, _ := zstd.NewWriter(nil)
	decoder, _ := zstd.NewReader(nil)

	return &Room{
		documentID: documentID,
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
		persist:    persist,
		log:        log,
		awareness:  make(map[string][]byte),
		encoder:    encoder,
		decoder:    decoder,
		done:       make(chan struct{}),
	}
}

// Run starts the room's event loop
func (r *Room) Run(ctx context.Context) {
	saveTicker := time.NewTicker(saveInterval)
	defer saveTicker.Stop()

	// Load initial state
	state, err := r.persist.LoadDocument(ctx, r.documentID)
	if err != nil {
		r.log.Error("failed to load document", "document_id", r.documentID, "error", err)
	} else {
		r.mu.Lock()
		r.docState = state
		r.mu.Unlock()
	}

	for {
		select {
		case client := <-r.register:
			r.clients[client] = true
			r.log.Info("client joined room",
				"document_id", r.documentID,
				"peer_id", client.peerID,
				"clients", len(r.clients),
			)

			// Send current state to new client
			r.mu.RLock()
			if r.docState != nil {
				msg := r.buildMessage(0x02, r.docState) // SyncStep2 with full state
				client.send <- msg
			}
			// Send awareness state
			for _, awareness := range r.awareness {
				client.send <- r.buildMessage(0x04, awareness)
			}
			r.mu.RUnlock()

		case client := <-r.unregister:
			if _, ok := r.clients[client]; ok {
				delete(r.clients, client)
				close(client.send)

				// Remove awareness
				r.mu.Lock()
				delete(r.awareness, client.peerID)
				r.mu.Unlock()

				// Broadcast awareness removal
				r.broadcastAwarenessRemoval(client.peerID)

				r.log.Info("client left room",
					"document_id", r.documentID,
					"peer_id", client.peerID,
					"clients", len(r.clients),
				)

				// Close room if empty
				if len(r.clients) == 0 {
					r.saveState(ctx)
					close(r.done)
					return
				}
			}

		case message := <-r.broadcast:
			for client := range r.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(r.clients, client)
				}
			}

		case <-saveTicker.C:
			r.saveState(ctx)

		case <-ctx.Done():
			r.saveState(ctx)
			for client := range r.clients {
				close(client.send)
			}
			close(r.done)
			return
		}
	}
}

func (r *Room) handleSyncStep1(client *Client, stateVector []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Send our state to the client
	if r.docState != nil {
		msg := r.buildMessage(0x02, r.docState)
		client.send <- msg
	}
}

func (r *Room) handleSyncStep2(client *Client, update []byte) {
	r.applyUpdate(client, update)
}

func (r *Room) handleUpdate(client *Client, update []byte) {
	r.applyUpdate(client, update)
}

func (r *Room) applyUpdate(sender *Client, update []byte) {
	// Decompress if needed
	data := update
	if len(data) > 0 && r.isCompressed(data) {
		decompressed, err := r.decoder.DecodeAll(data, nil)
		if err == nil {
			data = decompressed
		}
	}

	// Update server state
	r.mu.Lock()
	// In a full implementation, this would merge CRDT states
	// For now, append the update
	r.docState = data
	r.mu.Unlock()

	// Broadcast to all clients except sender
	msg := r.buildMessage(0x03, update)
	for client := range r.clients {
		if client != sender {
			select {
			case client.send <- msg:
			default:
				close(client.send)
				delete(r.clients, client)
			}
		}
	}
}

func (r *Room) handleAwareness(client *Client, data []byte) {
	r.mu.Lock()
	r.awareness[client.peerID] = data
	r.mu.Unlock()

	// Broadcast awareness to all other clients
	msg := r.buildMessage(0x04, data)
	for c := range r.clients {
		if c != client {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

func (r *Room) handleAwarenessQuery(client *Client) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, awareness := range r.awareness {
		client.send <- r.buildMessage(0x04, awareness)
	}
}

func (r *Room) broadcastAwarenessRemoval(peerID string) {
	// Send removal message (0x09)
	msg := r.buildMessage(0x09, []byte(peerID))
	for client := range r.clients {
		select {
		case client.send <- msg:
		default:
		}
	}
}

func (r *Room) buildMessage(msgType byte, payload []byte) []byte {
	// Compress payload if > threshold
	data := payload
	if len(data) > zstdThreshold {
		compressed := r.encoder.EncodeAll(data, nil)
		if len(compressed) < len(data) {
			data = compressed
		}
	}

	msg := make([]byte, 1+len(data))
	msg[0] = msgType
	copy(msg[1:], data)
	return msg
}

func (r *Room) isCompressed(data []byte) bool {
	// zstd magic number: 0x28 0xB5 0x2F 0xFD
	return len(data) >= 4 && data[0] == 0x28 && data[1] == 0xB5 && data[2] == 0x2F && data[3] == 0xFD
}

func (r *Room) saveState(ctx context.Context) {
	r.mu.RLock()
	state := r.docState
	r.mu.RUnlock()

	if state == nil {
		return
	}

	if err := r.persist.SaveSnapshot(ctx, r.documentID, state); err != nil {
		r.log.Error("failed to save document state",
			"document_id", r.documentID,
			"error", err,
		)
	}
}

// ClientCount returns number of connected clients
func (r *Room) ClientCount() int {
	return len(r.clients)
}

// Done returns a channel that's closed when the room shuts down
func (r *Room) Done() <-chan struct{} {
	return r.done
}
