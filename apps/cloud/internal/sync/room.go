package sync

import (
	"context"
	"encoding/json"
	"errors"
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

// Room's event loop exclusively owns membership, awareness, the update log and
// its storage generation. Read pumps enqueue messages; they never send to or
// close another client's queue.
type Room struct {
	documentID string
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	events     chan roomEvent
	replaced   chan struct{}
	persist    PersistenceStore
	log        *slog.Logger
	state      *updateLog
	generation string
	awareness  map[string][]byte
	count      atomic.Int64
	done       chan struct{}
	dirty      bool
	// stale is set when storage was replaced but could not be reloaded.
	stale bool
	// tick saves a checkpoint, or checks the stored generation when nothing changed.
	tick time.Duration
}

func NewRoom(documentID string, persist PersistenceStore, log *slog.Logger) *Room {
	return &Room{documentID: documentID, clients: make(map[*Client]bool), register: make(chan *Client),
		unregister: make(chan *Client), events: make(chan roomEvent, 256), replaced: make(chan struct{}, 1),
		persist: persist, log: log, awareness: make(map[string][]byte), done: make(chan struct{}), tick: snapshotInterval}
}

// loadState reads one storage generation without changing the live room.
func (r *Room) loadState(ctx context.Context) (*updateLog, string, error) {
	stored, err := r.persist.LoadState(ctx, r.documentID)
	if err != nil {
		return nil, "", err
	}
	state, err := newUpdateLog(stored.Document)
	if err != nil {
		return nil, "", err
	}
	for _, update := range stored.Updates {
		staged, _, _, err := state.prepare(update)
		if err != nil {
			return nil, "", err
		}
		state = staged
	}
	return state, stored.Generation, nil
}
func (r *Room) Run(ctx context.Context) {
	defer close(r.done)
	defer func() {
		for client := range r.clients {
			r.remove(client)
		}
	}()
	state, generation, err := r.loadState(ctx)
	if err != nil {
		r.log.Error("failed to load collaboration state", "document_id", r.documentID, "error", err)
		return
	}
	r.state, r.generation = state, generation
	ticker := time.NewTicker(r.tick)
	defer ticker.Stop()
	hadClients := false
	for {
		select {
		case client := <-r.register:
			// Another process may have replaced the document: never serve an old baseline.
			r.verifyGeneration(ctx)
			// A reconnect replaces a prior connection using the same peer identity.
			for existing := range r.clients {
				if existing.peerID == client.peerID {
					r.remove(existing)
				}
			}
			r.clients[client] = true
			r.count.Store(int64(len(r.clients)))
			hadClients = true
			if r.stale {
				break // The loop stops below and closes this connection.
			}
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
		case <-r.replaced:
			r.adoptStoredBaseline(ctx)
		case <-ticker.C:
			if !r.dirty {
				r.verifyGeneration(ctx)
			} else if errors.Is(r.saveState(ctx), ErrBaselineReplaced) {
				r.adoptStoredBaseline(ctx)
			}
		case <-ctx.Done():
			saveCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			r.saveState(saveCtx)
			cancel()
			return
		}
		if r.stale || (hadClients && len(r.clients) == 0) {
			r.saveState(ctx)
			return
		}
	}
}

// remove ends a connection at once: a peer replaced by a reconnect, a full
// queue or revoked access. release lets the write pump flush queued frames and
// close normally.
func (r *Room) remove(client *Client) bool  { return r.leave(client, true) }
func (r *Room) release(client *Client) bool { return r.leave(client, false) }
func (r *Room) leave(client *Client, abort bool) bool {
	if !r.clients[client] {
		return false
	}
	delete(r.clients, client)
	delete(r.awareness, client.peerID)
	r.count.Store(int64(len(r.clients)))
	close(client.send)
	if abort && client.conn != nil {
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
		if errors.Is(err, ErrBaselineReplaced) {
			r.foreignBaseline(ctx, event.client)
			return
		}
		if err != nil {
			r.error(event.client, "INVALID_UPDATE", err.Error())
			return
		}
		if changed {
			saveCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			saveErr := r.persist.SaveUpdate(saveCtx, r.documentID, r.generation, delta)
			cancel()
			if errors.Is(saveErr, ErrBaselineReplaced) {
				r.adoptStoredBaseline(ctx)
				return
			}
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
		data, err := readPresence(event.client.peerID, event.data)
		if err != nil {
			// Refused from the sender only: nothing is stored or relayed.
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
func (r *Room) saveState(ctx context.Context) error {
	if r.state == nil || !r.dirty {
		return nil
	}
	if err := r.persist.SaveSnapshot(ctx, r.documentID, r.generation, r.state.encode()); err != nil {
		r.log.Error("failed to checkpoint collaboration", "document_id", r.documentID, "error", err)
		return err
	}
	r.dirty = false
	return nil
}
func (r *Room) ClientCount() int      { return int(r.count.Load()) }
func (r *Room) Done() <-chan struct{} { return r.done }
