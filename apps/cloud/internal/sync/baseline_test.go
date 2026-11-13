package sync

import (
	"encoding/json"
	"io"
	"log/slog"
	"testing"
	"time"
)

var replacementDocument = []byte(`{"version":0,"blocks":[{"id":"r1","block_type":"paragraph","attrs":{},"content":{"type":"RichText","value":[{"text":"Новый 😀","marks":[]}]},"children":[]}]}`)

func updateOn(base []byte, block, peer string, clock uint64, value string) []byte {
	id := operationID{Lamport: clock, PeerID: peer}
	change, _ := json.Marshal(map[string]any{"InsertChar": map[string]any{
		"block_id": block, "position": []positionPart{{Digit: 2, ID: id}}, "value": value, "marks": []any{},
	}})
	data, _ := json.Marshal(replicaUpdate{Protocol: replicaProtocol, Base: base, Operations: []replicaOperation{{ID: id, Change: change}}})
	return data
}

// expectResync reads past presence removals to the BASELINE_REPLACED notice and
// then requires the room to have closed the client's queue.
func expectResync(t *testing.T, client *Client) {
	t.Helper()
	for {
		select {
		case data, ok := <-client.send:
			if !ok {
				t.Fatalf("%s closed without BASELINE_REPLACED", client.peerID)
			}
			if data[0] == 0x04 {
				continue
			}
			if data[0] != 0x08 || errorCode(t, data[1:]) != BaselineReplacedCode {
				t.Fatalf("%s expected BASELINE_REPLACED, got %q", client.peerID, data)
			}
			select {
			case extra, ok := <-client.send:
				if ok {
					t.Fatalf("%s received %q after BASELINE_REPLACED", client.peerID, extra)
				}
			case <-time.After(2 * time.Second):
				t.Fatalf("%s was not released after BASELINE_REPLACED", client.peerID)
			}
			return
		case <-time.After(2 * time.Second):
			t.Fatalf("%s did not receive BASELINE_REPLACED", client.peerID)
		}
	}
}
func errorCode(t *testing.T, payload []byte) string {
	t.Helper()
	var value struct{ Code string }
	if err := json.Unmarshal(payload, &value); err != nil {
		t.Fatal(err)
	}
	return value.Code
}
func waitDone(t *testing.T, room *Room) {
	t.Helper()
	select {
	case <-room.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("room kept serving an obsolete baseline")
	}
}
func stateBase(t *testing.T, data []byte) string {
	t.Helper()
	var update replicaUpdate
	if err := json.Unmarshal(data, &update); err != nil {
		t.Fatal(err)
	}
	return string(update.Base)
}

func TestRESTReplacementResynchronizesOpenRoom(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	server := NewServer(store, slog.New(slog.NewTextHandler(io.Discard, nil)))
	t.Cleanup(server.Shutdown)
	room := server.getOrCreateRoom("doc")
	a := join(t, room, "a")
	receive(t, a, 2)
	b := join(t, room, "b")
	receive(t, b, 2)
	room.handleUpdate(a, updateFor("a", 1, "Ж"))
	receive(t, a, 9)
	receive(t, b, 3)

	store.replace(replacementDocument)
	server.ReplaceBaseline("DOC") // REST accepts the ID in either case.
	expectResync(t, a)
	expectResync(t, b)
	waitDone(t, room)

	next := server.getOrCreateRoom("doc")
	c := join(t, next, "c")
	state := receive(t, c, 2)
	want, _ := canonicalDocument(replacementDocument)
	if stateBase(t, state) != string(want) || operationCount(t, state) != 0 {
		t.Fatalf("new connection did not get the replaced baseline: %s", state)
	}
	next.handleUpdate(c, updateOn(replacementDocument, "r1", "c", 1, "Ж"))
	receive(t, c, 9)
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(store.updates) != 1 {
		t.Fatalf("update on the new baseline was not saved: %d", len(store.updates))
	}
}

func TestReplacementFoundWhileSavingResynchronizesInsteadOfFailing(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	b := join(t, room, "b")
	receive(t, b, 2)
	// Another API process replaced the content; this room was not notified.
	store.replace(replacementDocument)
	room.handleUpdate(a, updateFor("a", 1, "Ж"))
	expectResync(t, a)
	expectResync(t, b)
	waitDone(t, room)
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(store.updates) != 0 || len(store.snapshots) != 0 {
		t.Fatal("an edit of the old baseline entered the new generation")
	}
}

func TestReplacementNoticeForCurrentGenerationKeepsClients(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	room.baselineReplaced()
	room.handleUpdate(a, updateFor("a", 1, "Ж"))
	receive(t, a, 9)
}

func TestUpdateFromAnotherBaselineResynchronizesOnlyItsSender(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	b := join(t, room, "b")
	receive(t, b, 2)
	room.handleUpdate(b, updateOn(replacementDocument, "r1", "b", 1, "X"))
	expectResync(t, b)
	receive(t, a, 4) // b's presence removal
	room.handleUpdate(a, updateFor("a", 1, "Ж"))
	receive(t, a, 9)
}

func TestUnreadableReplacementStopsRoomAfterTellingClients(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	store.replace(replacementDocument)
	store.mu.Lock()
	store.loadFails = true
	store.mu.Unlock()
	room.baselineReplaced()
	expectResync(t, a)
	waitDone(t, room)
}

// Another API process replaced the content; this room was not notified and has
// nothing to save. A client that loaded the new content must not be served the
// old baseline, or it would reload and reconnect here forever.
func TestStaleRoomAdoptsReplacementBeforeServingNewClient(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	store.replace(replacementDocument)
	c := join(t, room, "c")
	expectResync(t, a)
	want, _ := canonicalDocument(replacementDocument)
	if state := receive(t, c, 2); stateBase(t, state) != string(want) {
		t.Fatalf("new client was served the old baseline: %s", state)
	}
	room.handleUpdate(c, updateOn(replacementDocument, "r1", "c", 1, "Ж"))
	receive(t, c, 9)
}

func TestStaleRoomAdoptsReplacementWhenAnUpdateUsesIt(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	b := join(t, room, "b")
	receive(t, b, 2)
	store.replace(replacementDocument)
	// b ignores the old full state and edits the new content.
	room.handleUpdate(b, updateOn(replacementDocument, "r1", "b", 1, "Ж"))
	expectResync(t, a)
	expectResync(t, b)
	waitDone(t, room)
	next := startRoom(t, store)
	c := join(t, next, "c")
	want, _ := canonicalDocument(replacementDocument)
	if state := receive(t, c, 2); stateBase(t, state) != string(want) {
		t.Fatalf("reconnecting client was served the old baseline: %s", state)
	}
}

func TestIdleStaleRoomChecksStorageOnItsTick(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	room := startRoomEvery(t, store, 20*time.Millisecond)
	a := join(t, room, "a")
	receive(t, a, 2)
	store.replace(replacementDocument)
	expectResync(t, a)
	waitDone(t, room)
}

func TestUnreadableGenerationStillServesTheLoadedState(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	store.mu.Lock()
	store.loadFails = true
	store.mu.Unlock()
	b := join(t, room, "b")
	receive(t, b, 2)
	// An update from another baseline cannot be judged without storage: retry later.
	room.handleUpdate(b, updateOn(replacementDocument, "r1", "b", 1, "X"))
	if code := errorCode(t, receive(t, b, 8)); code != "UPDATE_NOT_SAVED" {
		t.Fatalf("got %s", code)
	}
}
