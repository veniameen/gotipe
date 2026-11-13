package sync

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

// memoryPersistence models one document: an immutable object per generation
// and the log recorded against the current generation.
type memoryPersistence struct {
	mu         sync.Mutex
	generation string
	document   []byte
	updates    [][]byte
	snapshots  [][]byte
	fail       bool
	loadFails  bool
}

func (s *memoryPersistence) LoadState(context.Context, string) (StoredState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.loadFails {
		return StoredState{}, errors.New("storage unavailable")
	}
	document := s.document
	if document == nil {
		document = testDocument
	}
	out := append([][]byte{}, s.snapshots...)
	return StoredState{Generation: s.generation, Document: append([]byte(nil), document...), Updates: append(out, s.updates...)}, nil
}
func (s *memoryPersistence) CurrentGeneration(context.Context, string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.loadFails {
		return "", errors.New("storage unavailable")
	}
	return s.generation, nil
}
func (s *memoryPersistence) SaveUpdate(_ context.Context, _ string, generation string, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.fail {
		return errors.New("storage unavailable")
	}
	if generation != s.generation {
		return ErrBaselineReplaced
	}
	s.updates = append(s.updates, append([]byte(nil), data...))
	return nil
}
func (s *memoryPersistence) SaveSnapshot(_ context.Context, _ string, generation string, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if generation != s.generation {
		return ErrBaselineReplaced
	}
	s.snapshots = append(s.snapshots, append([]byte(nil), data...))
	return nil
}

// replace models REST PATCH with content or a version restore: a new object
// and generation, with the old generation's log invalidated.
func (s *memoryPersistence) replace(document []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.generation += "+"
	s.document = append([]byte(nil), document...)
	s.updates, s.snapshots = nil, nil
}
func startRoom(t *testing.T, store *memoryPersistence) *Room {
	t.Helper()
	return startRoomEvery(t, store, snapshotInterval)
}

// startRoomEvery sets the room's tick before Run starts, so tests need not wait minutes.
func startRoomEvery(t *testing.T, store *memoryPersistence, tick time.Duration) *Room {
	t.Helper()
	room := NewRoom("doc", store, slog.New(slog.NewTextHandler(io.Discard, nil)))
	room.tick = tick
	ctx, cancel := context.WithCancel(context.Background())
	go room.Run(ctx)
	t.Cleanup(func() {
		cancel()
		select {
		case <-room.Done():
		case <-time.After(time.Second):
			t.Error("room did not stop")
		}
	})
	return room
}
func join(t *testing.T, room *Room, peer string) *Client {
	t.Helper()
	client := NewClient(room, nil, peer, "user", room.log)
	select {
	case room.register <- client:
	case <-time.After(time.Second):
		t.Fatal("join timed out")
	}
	return client
}
func receive(t *testing.T, client *Client, kind byte) []byte {
	t.Helper()
	select {
	case data, ok := <-client.send:
		if !ok || len(data) == 0 || data[0] != kind {
			t.Fatalf("expected message %d, got %v", kind, data)
		}
		return data[1:]
	case <-time.After(2 * time.Second):
		t.Fatalf("message %d timed out", kind)
		return nil
	}
}
func leave(t *testing.T, room *Room, client *Client) {
	t.Helper()
	select {
	case room.unregister <- client:
	case <-room.Done():
	case <-time.After(time.Second):
		t.Fatal("leave timed out")
	}
}
func TestRoomPersistsBeforeBroadcastAndReplaysAfterReconnect(t *testing.T) {
	store := &memoryPersistence{}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	b := join(t, room, "b")
	receive(t, b, 2)
	room.handleUpdate(a, updateFor("a", 1, "Ж"))
	receive(t, a, 9)
	if operationCount(t, receive(t, b, 3)) != 1 {
		t.Fatal("missing update")
	}
	room.handleUpdate(b, updateFor("b", 1, "😀"))
	receive(t, b, 9)
	receive(t, a, 3)
	leave(t, room, a)
	receive(t, b, 4)
	leave(t, room, b)
	select {
	case <-room.Done():
	case <-time.After(time.Second):
		t.Fatal("empty room remained active")
	}
	store.mu.Lock()
	saved := len(store.updates)
	checkpoints := len(store.snapshots)
	store.mu.Unlock()
	if saved != 2 || checkpoints == 0 {
		t.Fatal("updates/checkpoint not durable")
	}
	restarted := startRoom(t, store)
	c := join(t, restarted, "c")
	if operationCount(t, receive(t, c, 2)) != 2 {
		t.Fatal("reconnect lost prior update")
	}
	restarted.handleUpdate(c, updateFor("a", 1, "Ж"))
	receive(t, c, 9)
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(store.updates) != 2 {
		t.Fatal("duplicate update persisted again")
	}
}
func TestStorageFailureDoesNotCommitOrBroadcastAnEdit(t *testing.T) {
	store := &memoryPersistence{fail: true}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	b := join(t, room, "b")
	receive(t, b, 2)
	room.handleUpdate(a, updateFor("a", 1, "Ж"))
	receive(t, a, 8)
	room.handleSyncStep1(b, nil)
	if operationCount(t, receive(t, b, 2)) != 0 {
		t.Fatal("failed edit entered document log")
	}
	store.mu.Lock()
	store.fail = false
	store.mu.Unlock()
	room.handleUpdate(a, updateFor("a", 1, "Ж"))
	receive(t, a, 9)
	receive(t, b, 3)
}
func TestConcurrentPumpsDoNotRaceMembershipOrLoseOperations(t *testing.T) {
	store := &memoryPersistence{}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	var workers sync.WaitGroup
	for i := 0; i < 4; i++ {
		workers.Add(1)
		go func(index int) {
			defer workers.Done()
			for n := 0; n < 20; n++ {
				room.handleUpdate(a, updateFor("a", uint64(index*20+n+1), "😀"))
				_ = room.ClientCount()
			}
		}(i)
	}
	workers.Wait()
	for i := 0; i < 80; i++ {
		receive(t, a, 9)
	}
	room.handleSyncStep1(a, nil)
	if operationCount(t, receive(t, a, 2)) != 80 {
		t.Fatal("concurrent updates lost")
	}
}
