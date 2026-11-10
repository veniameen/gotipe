package sync

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync/atomic"
	"time"
)

const snapshotInterval = 5 * time.Minute

type roomEvent struct {
	client *Client
	kind   byte
	data   []byte
}

// Room's event loop exclusively owns membership, awareness, and the update log.
// Read pumps enqueue messages; they never send to or close another client's queue.
type Room struct {
	documentID string
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	events     chan roomEvent
	persist    PersistenceStore
	log        *slog.Logger
	state      *updateLog
	awareness  map[string][]byte
	count      atomic.Int64
	done       chan struct{}
	dirty      bool
}

func NewRoom(documentID string, persist PersistenceStore, log *slog.Logger) *Room {
	return &Room{documentID: documentID, clients: make(map[*Client]bool), register: make(chan *Client),
		unregister: make(chan *Client), events: make(chan roomEvent, 256), persist: persist, log: log,
		awareness: make(map[string][]byte), done: make(chan struct{})}
}
func (r *Room) load(ctx context.Context) error {
	document, err := r.persist.LoadDocument(ctx, r.documentID)
	if err != nil {
		return err
	}
	r.state, err = newUpdateLog(document)
	if err != nil {
		return err
	}
	updates, err := r.persist.LoadUpdates(ctx, r.documentID)
	if err != nil {
		return err
	}
	for _, update := range updates {
		staged, _, _, err := r.state.prepare(update)
		if err != nil {
			return err
		}
		r.state = staged
	}
	return nil
}
func (r *Room) Run(ctx context.Context) {
	defer close(r.done)
	defer func() {
		for client := range r.clients {
			r.remove(client)
		}
	}()
	if err := r.load(ctx); err != nil {
		r.log.Error("failed to load collaboration state", "document_id", r.documentID, "error", err)
		return
	}
	ticker := time.NewTicker(snapshotInterval)
	defer ticker.Stop()
	hadClients := false
	for {
		select {
		case client := <-r.register:
			// A reconnect replaces a prior connection using the same peer identity.
			for existing := range r.clients {
				if existing.peerID == client.peerID {
					r.remove(existing)
				}
			}
			r.clients[client] = true
			r.count.Store(int64(len(r.clients)))
			hadClients = true
			r.send(client, 0x02, r.state.encode())
			for _, awareness := range r.awareness {
				r.send(client, 0x04, awareness)
			}
		case client := <-r.unregister:
			r.remove(client)
		case event := <-r.events:
			if r.clients[event.client] {
				if err := event.client.checkAuthorization(); err != nil {
					event.client.closeUnauthorized()
					r.remove(event.client)
				} else {
					r.handleEvent(ctx, event)
				}
			}
		case <-ticker.C:
			r.saveState(ctx)
		case <-ctx.Done():
			saveCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			r.saveState(saveCtx)
			cancel()
			return
		}
		if hadClients && len(r.clients) == 0 {
			r.saveState(ctx)
			return
		}
	}
}
func (r *Room) remove(client *Client) bool {
	if !r.clients[client] {
		return false
	}
	delete(r.clients, client)
	delete(r.awareness, client.peerID)
	r.count.Store(int64(len(r.clients)))
	close(client.send)
	if client.conn != nil {
		client.conn.Close()
	}
	removal, _ := json.Marshal(map[string]any{"peerId": client.peerID, "removed": true})
	r.broadcastExcept(nil, 0x04, removal)
	return true
}
func (r *Room) send(client *Client, kind byte, payload []byte) {
	if !r.clients[client] {
		return
	}
	message := make([]byte, 1+len(payload))
	message[0] = kind
	copy(message[1:], payload)
	select {
	case client.send <- message:
	default:
		r.remove(client)
	}
}
func (r *Room) broadcastExcept(sender *Client, kind byte, payload []byte) {
	for client := range r.clients {
		if client != sender {
			r.send(client, kind, payload)
		}
	}
}
func (r *Room) error(client *Client, code, message string) {
	payload, _ := json.Marshal(map[string]string{"code": code, "message": message})
	r.send(client, 0x08, payload)
}
func (r *Room) handleEvent(ctx context.Context, event roomEvent) {
	switch event.kind {
	case 0x01:
		r.send(event.client, 0x02, r.state.encode())
	case 0x02, 0x03:
		staged, delta, changed, err := r.state.prepare(event.data)
		if err != nil {
			r.error(event.client, "INVALID_UPDATE", err.Error())
			return
		}
		if changed {
			saveCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			saveErr := r.persist.SaveUpdate(saveCtx, r.documentID, delta)
			cancel()
			if err := saveErr; err != nil {
				r.log.Error("failed to persist collaboration update", "document_id", r.documentID, "error", err)
				r.error(event.client, "UPDATE_NOT_SAVED", "The update was not saved; reconnect and retry.")
				return
			}
			r.state = staged
			r.dirty = true
			r.broadcastExcept(event.client, 0x03, delta)
		}
		r.send(event.client, 0x09, nil)
	case 0x04:
		if len(event.data) > 32*1024 {
			r.error(event.client, "INVALID_AWARENESS", "Awareness payload is too large")
			return
		}
		var awareness map[string]any
		if json.Unmarshal(event.data, &awareness) != nil || awareness == nil {
			r.error(event.client, "INVALID_AWARENESS", "Invalid awareness JSON")
			return
		}
		awareness["peerId"] = event.client.peerID
		delete(awareness, "removed")
		data, err := json.Marshal(awareness)
		if err != nil {
			r.error(event.client, "INVALID_AWARENESS", err.Error())
			return
		}
		r.awareness[event.client.peerID] = data
		r.broadcastExcept(event.client, 0x04, data)
	case 0x05:
		for _, awareness := range r.awareness {
			r.send(event.client, 0x04, awareness)
		}
	default:
		r.error(event.client, "UNKNOWN_MESSAGE", "Unsupported collaboration message type")
	}
}
func (r *Room) enqueue(client *Client, kind byte, data []byte) {
	event := roomEvent{client: client, kind: kind, data: append([]byte(nil), data...)}
	select {
	case r.events <- event:
	case <-r.done:
	}
}
func (r *Room) handleSyncStep1(client *Client, data []byte) { r.enqueue(client, 0x01, data) }
func (r *Room) handleSyncStep2(client *Client, data []byte) { r.enqueue(client, 0x02, data) }
func (r *Room) handleUpdate(client *Client, data []byte)    { r.enqueue(client, 0x03, data) }
func (r *Room) handleAwareness(client *Client, data []byte) { r.enqueue(client, 0x04, data) }
func (r *Room) handleAwarenessQuery(client *Client)         { r.enqueue(client, 0x05, nil) }
func (r *Room) saveState(ctx context.Context) {
	if r.state == nil || !r.dirty {
		return
	}
	if err := r.persist.SaveSnapshot(ctx, r.documentID, r.state.encode()); err != nil {
		r.log.Error("failed to checkpoint collaboration", "document_id", r.documentID, "error", err)
		return
	}
	r.dirty = false
}
func (r *Room) ClientCount() int      { return int(r.count.Load()) }
func (r *Room) Done() <-chan struct{} { return r.done }
