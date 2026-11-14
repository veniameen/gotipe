package sync

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/document"
)

// part is one piece of a transaction larger than a message.
func part(generation, peer string, continues bool, clocks ...uint64) []byte {
	data, _ := json.Marshal(replicaUpdate{Protocol: operationsProtocol, Generation: generation, Operations: operationsFor(peer, clocks...), Continues: continues})
	return data
}
func storedCount(store *memoryPersistence) int {
	store.mu.Lock()
	defer store.mu.Unlock()
	return len(store.updates)
}

// expectQuiet fails if client receives anything within a short wait.
func expectQuiet(t *testing.T, client *Client) {
	t.Helper()
	select {
	case data := <-client.send:
		t.Fatalf("%s received %v before the transaction ended", client.peerID, data)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestATransactionInPartsIsSavedAcknowledgedAndRelayedOnceWhole(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	b := joinDeltas(t, room, "b", token)
	receive(t, b, 2)
	room.handleUpdate(a, part(token, "a", true, 1, 2))
	room.handleUpdate(a, part(token, "a", true, 2, 3)) // A repeated operation is kept once.
	expectQuiet(t, a)
	expectQuiet(t, b)
	if storedCount(store) != 0 {
		t.Fatal("a part of a transaction was saved")
	}
	room.handleUpdate(a, part(token, "a", false, 4))
	receive(t, a, 9)
	if operations := operationCount(t, receive(t, b, 3)); operations != 4 {
		t.Fatalf("relayed %d operations, want the whole transaction", operations)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(store.updates) != 1 || operationCount(t, store.updates[0]) != 4 {
		t.Fatalf("stored %d records, want one", len(store.updates))
	}
}

func TestADisconnectBetweenPartsSavesNothingAndTheResendIsWhole(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	keep := joinDeltas(t, room, "keep", token)
	receive(t, keep, 2)
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	room.handleUpdate(a, part(token, "a", true, 1, 2))
	room.unregister <- a
	again := joinDeltas(t, room, "a", token)
	if operationCount(t, receive(t, again, 2)) != 0 {
		t.Fatal("the full state holds a part of a transaction")
	}
	if storedCount(store) != 0 {
		t.Fatal("a part was saved after a disconnect")
	}
	// The parts of the old connection are gone: the new one sends the whole transaction.
	room.handleUpdate(again, part(token, "a", false, 3))
	receive(t, again, 9)
	room.handleUpdate(again, part(token, "a", true, 1, 2))
	room.handleUpdate(again, part(token, "a", false, 3))
	receive(t, again, 9)
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(store.updates) != 2 || operationCount(t, store.updates[0]) != 1 || operationCount(t, store.updates[1]) != 2 {
		t.Fatalf("stored %d records", len(store.updates))
	}
}

func TestATransactionBeyondTheLimitFailsCleanly(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	room.transactionLimit = 0 // Before the first client joins, so the event loop sees it.
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	room.handleUpdate(a, part(token, "a", true, 1))
	if code := errorCode(t, receive(t, a, 8)); code != UpdateTooLargeCode {
		t.Fatalf("got %s", code)
	}
	if _, open := <-a.send; open {
		t.Fatal("the connection stays open after a refused transaction")
	}
	if storedCount(store) != 0 {
		t.Fatal("a refused transaction was saved")
	}
}

func TestOnlyOperationsUpdatesContinue(t *testing.T) {
	log, _ := newUpdateLog(testDocument, testGeneration)
	legacy, _ := json.Marshal(replicaUpdate{Protocol: fullStateProtocol, Base: testDocument, Operations: operationsFor("a", 1), Continues: true})
	if _, _, err := log.stage(legacy); err == nil {
		t.Fatal("a gotipe.crdt/1 update continued a transaction")
	}
	if err := log.restore(part(testGeneration, "a", true, 1)); err == nil {
		t.Fatal("a stored record continued a transaction")
	}
	if _, continues, err := log.stage(part(testGeneration, "a", true, 1)); err != nil || !continues {
		t.Fatalf("continues %v: %v", continues, err)
	}
}

func TestACompactionOnTheTickDoesNotHoldBackSaves(t *testing.T) {
	store := &memoryPersistence{generation: "g1", compactAt: 1, compactGate: make(chan struct{}), started: make(chan struct{}, 1)}
	token := document.GenerationToken("g1")
	room := startRoomEvery(t, store, 10*time.Millisecond)
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	room.handleUpdate(a, deltaUpdate(token, "a", 1))
	receive(t, a, 9)
	select {
	case <-store.started:
	case <-time.After(2 * time.Second):
		t.Fatal("the tick started no compaction")
	}
	// The merge is still running: the room saves and acknowledges meanwhile.
	room.handleUpdate(a, deltaUpdate(token, "a", 2))
	receive(t, a, 9)
	close(store.compactGate)
	deadline := time.Now().Add(2 * time.Second)
	for {
		store.mu.Lock()
		compactions := store.compactions
		store.mu.Unlock()
		if compactions > 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the compaction never finished")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestAnErrorInsideATransactionDropsItsLaterPartsAndTheConnection(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	b := joinDeltas(t, room, "b", token)
	receive(t, b, 2)
	room.handleUpdate(a, part(token, "a", true, 1, 2))
	bad, _ := json.Marshal(map[string]any{"protocol": operationsProtocol, "generation": token, "continues": true,
		"operations": []map[string]any{{"id": map[string]any{"lamport": 3, "peer_id": "a"}, "change": map[string]any{"Bogus": map[string]any{}}}}})
	room.handleUpdate(a, bad)
	// The sender had already sent the rest: it must not become a transaction.
	room.handleUpdate(a, part(token, "a", true, 4))
	room.handleUpdate(a, part(token, "a", false, 5))
	if code := errorCode(t, receive(t, a, 8)); code != "INVALID_UPDATE" {
		t.Fatalf("got %s", code)
	}
	if _, open := <-a.send; open {
		t.Fatal("the connection stays open after a refused part")
	}
	receive(t, b, 4) // a's presence is removed.
	expectQuiet(t, b)
	if storedCount(store) != 0 {
		t.Fatal("the tail of a refused transaction was saved")
	}
}

func TestATransactionWhosePartsStopIsDropped(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	room.partTimeout = 20 * time.Millisecond // Before the first client joins.
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	room.handleUpdate(a, part(token, "a", true, 1, 2))
	if code := errorCode(t, receive(t, a, 8)); code != "UPDATE_NOT_SAVED" {
		t.Fatalf("got %s", code)
	}
	if _, open := <-a.send; open || storedCount(store) != 0 {
		t.Fatal("an abandoned transaction kept its connection or was saved")
	}
}

func TestUnfinishedTransactionsShareOneBudget(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	first, last := part(token, "a", true, 1), part(token, "a", false, 2)
	room.budget = newByteBudget(len(first) + len(last) + 10) // Before the first client joins.
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	b := joinDeltas(t, room, "b", token)
	receive(t, b, 2)
	room.handleUpdate(a, first)
	room.handleUpdate(b, part(token, "b", true, 1, 2))
	if code := errorCode(t, receive(t, b, 8)); code != "UPDATE_NOT_SAVED" {
		t.Fatalf("got %s", code)
	}
	// The first transaction completes and returns its share.
	room.handleUpdate(a, last)
	for receiveAny(t, a) != 0x09 { // b's departure is announced first.
	}
	c := joinDeltas(t, room, "c", token)
	receive(t, c, 2)
	room.handleUpdate(c, part(token, "c", true, 1))
	room.handleUpdate(c, part(token, "c", false, 2))
	for {
		if kind := receiveAny(t, c); kind == 0x09 {
			break
		} else if kind == 0x08 {
			t.Fatal("the budget was not returned")
		}
	}
}

func TestASaveThatWouldMakeTheDocumentUnreadableIsRefused(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	update := deltaUpdate(token, "a", 1)
	room.storedLimit = len(testDocument) + len(update) // Before the first client joins.
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	room.handleUpdate(a, update)
	receive(t, a, 9)
	room.handleUpdate(a, deltaUpdate(token, "a", 2))
	if code := errorCode(t, receive(t, a, 8)); code != DocumentTooLargeCode {
		t.Fatalf("got %s", code)
	}
	if storedCount(store) != 1 {
		t.Fatal("a save past the read limit was stored")
	}
}
