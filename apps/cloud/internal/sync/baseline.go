package sync

import (
	"context"
	"encoding/json"
	"strings"
	"time"
)

// BaselineReplacedCode is the 0x08 error code that tells a client its replica
// starts from a baseline Cloud no longer has. The client must load the document
// again over REST; the server closes the connection after this frame.
const BaselineReplacedCode = "BASELINE_REPLACED"

// ReplaceBaseline tells the document's open room, if any, that REST committed new
// content (PATCH with content or a version restore). The room reloads storage
// and asks clients of the old baseline to load the document again. It never
// blocks the caller; rooms in other processes notice on their next write.
func (s *Server) ReplaceBaseline(documentID string) {
	s.mu.RLock()
	room := s.rooms[roomKey(documentID)]
	s.mu.RUnlock()
	if room != nil {
		room.baselineReplaced()
	}
}

// roomKey gives every spelling of one document ID the same room: document IDs
// are UUIDs, which REST and PostgreSQL accept in either case.
func roomKey(documentID string) string {
	return strings.ToLower(documentID)
}

func (r *Room) baselineReplaced() {
	select {
	case r.replaced <- struct{}{}:
	default: // A pending reload reads the newest generation anyway.
	}
}

// adoptStoredBaseline reloads storage after its baseline may have been replaced.
// A new generation becomes the live log, and every client, all built on the old
// baseline, is asked to resynchronise. A notice for the generation the room
// already serves changes nothing. If storage cannot be read, clients are still
// told to reload and the room stops instead of serving an obsolete log.
func (r *Room) adoptStoredBaseline(ctx context.Context) {
	state, generation, err := r.loadState(ctx)
	if err != nil {
		r.log.Error("failed to reload replaced collaboration baseline", "document_id", r.documentID, "error", err)
		r.dirty, r.stale = false, true
		r.resynchronize(r.members()...)
		return
	}
	if generation == r.generation {
		return
	}
	r.state, r.generation, r.dirty = state, generation, false
	r.resynchronize(r.members()...)
}

// verifyGeneration adopts a generation that another process committed. A read
// failure keeps serving the loaded state; saves still refuse a stale generation.
func (r *Room) verifyGeneration(ctx context.Context) {
	generation, err := r.currentGeneration(ctx)
	if err != nil {
		r.log.Warn("failed to check the collaboration baseline", "document_id", r.documentID, "error", err)
		return
	}
	if generation != r.generation {
		r.adoptStoredBaseline(ctx)
	}
}

// foreignBaseline answers an update whose base is not the room's baseline. If
// storage moved on, the room was stale: it adopts the new generation and every
// client of the old one reloads. Otherwise only the sender started elsewhere.
func (r *Room) foreignBaseline(ctx context.Context, sender *Client) {
	generation, err := r.currentGeneration(ctx)
	if err != nil {
		r.log.Error("failed to check the collaboration baseline", "document_id", r.documentID, "error", err)
		r.error(sender, "UPDATE_NOT_SAVED", "The update was not saved; reconnect and retry.")
		return
	}
	if generation != r.generation {
		r.adoptStoredBaseline(ctx)
		return
	}
	r.resynchronize(sender)
}

func (r *Room) currentGeneration(ctx context.Context) (string, error) {
	readCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return r.persist.CurrentGeneration(readCtx, r.documentID)
}

func (r *Room) members() []*Client {
	clients := make([]*Client, 0, len(r.clients))
	for client := range r.clients {
		clients = append(clients, client)
	}
	return clients
}

// resynchronize sends BASELINE_REPLACED and closes each connection after its
// queued frames, so earlier updates still arrive before the notice.
func (r *Room) resynchronize(clients ...*Client) {
	payload, _ := json.Marshal(map[string]string{
		"code":    BaselineReplacedCode,
		"message": "The document content was replaced; load it again.",
	})
	for _, client := range clients {
		r.send(client, 0x08, payload)
		r.release(client)
	}
}
