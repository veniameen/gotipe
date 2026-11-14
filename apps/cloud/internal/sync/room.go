package sync

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/gotipe/cloud/internal/document"
)

const (
	snapshotInterval = 5 * time.Minute
	// compactWhileServing bounds a compaction on the tick. It runs beside the
	// event loop, so updates are saved and acknowledged meanwhile.
	compactWhileServing = time.Minute
	// compactAfterClose bounds the one after the last client left, when the
	// room is already done and a new room may serve the document.
	compactAfterClose = 2 * time.Minute
)

type roomEvent struct {
	client *Client
	kind   byte
	data   []byte
	// partial is the transaction a partExpired event refers to.
	partial *partialTransaction
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
	// tick compacts the stored log after updates, or checks the stored generation
	// when nothing changed.
	tick time.Duration
	// transactionLimit bounds the buffered parts of one client's transaction;
	// budget, shared by the rooms of a server, bounds those of all clients.
	transactionLimit int
	budget           *byteBudget
	// partTimeout drops a transaction whose next part does not come in time;
	// storedLimit bounds the stored state a read applies.
	partTimeout time.Duration
	storedLimit int
	// compacting is set while a compaction runs off the event loop; compacted
	// receives its result.
	compacting bool
	compacted  chan error
}

func NewRoom(documentID string, persist PersistenceStore, log *slog.Logger) *Room {
	return &Room{documentID: documentID, clients: make(map[*Client]bool), register: make(chan *Client),
		unregister: make(chan *Client), events: make(chan roomEvent, 256), replaced: make(chan struct{}, 1),
		persist: persist, log: log, awareness: make(map[string][]byte), done: make(chan struct{}), tick: snapshotInterval,
		transactionLimit: DefaultTransactionLimit, compacted: make(chan error, 1),
		budget:      newByteBudget(DefaultTransactionLimit * transactionsPerProcess),
		partTimeout: defaultPartTimeout, storedLimit: document.MaterializationLimit}
}

// loadState reads one storage generation without changing the live room.
func (r *Room) loadState(ctx context.Context) (*updateLog, string, error) {
	stored, err := r.persist.LoadState(ctx, r.documentID)
	if err != nil {
		return nil, "", err
	}
	state, err := newUpdateLog(stored.Document, document.GenerationToken(stored.Generation))
	if err != nil {
		return nil, "", err
	}
	state.stored = len(stored.Document)
	for _, update := range stored.Updates {
		if err := state.restore(update); err != nil {
			return nil, "", err
		}
		state.stored += len(update)
	}
	return state, stored.Generation, nil
}

// Run serves the room until it is empty or stopped, then merges the stored log
// if it has grown. The room is done before that merge starts; a compaction the
// tick started finishes first, so a room never runs two at once.
func (r *Room) Run(ctx context.Context) {
	left := r.serve(ctx)
	if r.compacting {
		<-r.compacted
		r.compacting = false
	}
	if left {
		r.compact(ctx, compactAfterClose)
	}
}

// serve reports whether the room ended because its last client left.
func (r *Room) serve(ctx context.Context) bool {
	defer close(r.done)
	defer func() {
		for client := range r.clients {
			r.remove(client)
		}
	}()
	state, generation, err := r.loadState(ctx)
	if err != nil {
		r.log.Error("failed to load collaboration state", "document_id", r.documentID, "error", err)
		return false
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
			if client.deltas && client.generation != r.state.generation {
				// The replica was loaded from a baseline the document no longer has.
				r.resynchronize(client)
				break
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
			} else if !r.compacting {
				r.startCompaction(ctx)
			}
		case err := <-r.compacted:
			r.compacting = false
			if errors.Is(err, ErrBaselineReplaced) {
				r.adoptStoredBaseline(ctx)
			} else if err != nil {
				r.dirty = true // Retried on a later tick.
			}
		case <-ctx.Done():
			// Every acknowledged update is already durable: nothing to save.
			return false
		}
		if r.stale {
			return false
		}
		if hadClients && len(r.clients) == 0 {
			return true
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
	r.dropPartial(client)
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
	r.sendFramed(client, framed(kind, payload))
}
func framed(kind byte, payload []byte) []byte {
	message := make([]byte, 1+len(payload))
	message[0] = kind
	copy(message[1:], payload)
	return message
}

// sendFramed queues a message that write pumps only read, so one message may be
// shared by every recipient.
func (r *Room) sendFramed(client *Client, message []byte) {
	if !r.clients[client] {
		return
	}
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
		r.receiveUpdate(ctx, event.client, event.data)
	case partExpired:
		if event.client.partial == event.partial {
			r.dropPartial(event.client)
			r.error(event.client, "UPDATE_NOT_SAVED", "The parts of a transaction stopped arriving; send it again.")
			r.release(event.client)
		}
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

// relay sends saved operations to the other clients: as stored to gotipe.v2
// clients, and behind a copy of the baseline to gotipe.v1 clients.
func (r *Room) relay(sender *Client, operations []replicaOperation, record []byte) {
	// Built once and shared: a relayed transaction may be many megabytes.
	var deltas, withBaseline []byte
	for client := range r.clients {
		switch {
		case client == sender:
		case client.deltas:
			if deltas == nil {
				deltas = framed(0x03, record)
			}
			r.sendFramed(client, deltas)
		default:
			if withBaseline == nil {
				withBaseline = framed(0x03, r.state.encodeWithBaseline(operations))
			}
			r.sendFramed(client, withBaseline)
		}
	}
}

// startCompaction merges the stored log beside the event loop: storage makes a
// concurrent save safe, and the room keeps saving and acknowledging meanwhile.
// Updates saved during it set dirty again for the next tick.
func (r *Room) startCompaction(ctx context.Context) {
	r.compacting, r.dirty = true, false
	generation := r.generation
	go func() {
		compactCtx, cancel := context.WithTimeout(ctx, compactWhileServing)
		defer cancel()
		err := r.persist.CompactLog(compactCtx, r.documentID, generation)
		if err != nil {
			r.log.Error("failed to compact the collaboration log", "document_id", r.documentID, "error", err)
		}
		r.compacted <- err // Buffered: never blocks, even after the room ended.
	}()
}

// compact asks storage to merge the log it has grown. Updates are durable
// before their ACK, so a failure here loses nothing and is retried later.
func (r *Room) compact(ctx context.Context, limit time.Duration) error {
	if r.state == nil {
		return nil
	}
	compactCtx, cancel := context.WithTimeout(ctx, limit)
	defer cancel()
	if err := r.persist.CompactLog(compactCtx, r.documentID, r.generation); err != nil {
		r.log.Error("failed to compact the collaboration log", "document_id", r.documentID, "error", err)
		return err
	}
	r.dirty = false
	return nil
}
func (r *Room) ClientCount() int      { return int(r.count.Load()) }
func (r *Room) Done() <-chan struct{} { return r.done }
