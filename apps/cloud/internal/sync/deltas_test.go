package sync

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/document"
)

// largeDocument is a stored baseline bigger than a WebSocket message may be.
var largeDocument = []byte(`{"version":0,"blocks":[{"id":"b1","block_type":"paragraph","attrs":{"src":"data:image/png;base64,` +
	strings.Repeat("A", maxMessageSize) + `"},"content":{"type":"RichText","value":[{"text":"A","marks":[]}]},"children":[]}]}`)

func operationsFor(peer string, clocks ...uint64) []replicaOperation {
	operations := make([]replicaOperation, 0, len(clocks))
	for _, clock := range clocks {
		id := operationID{Lamport: clock, PeerID: peer}
		change, _ := json.Marshal(map[string]any{"InsertChar": map[string]any{
			"block_id": "b1", "position": []positionPart{{Digit: 2, ID: id}}, "value": "Ж", "marks": []any{},
		}})
		operations = append(operations, replicaOperation{ID: id, Change: change})
	}
	return operations
}

// deltaUpdate is what a gotipe.v2 client sends: operations under a generation.
func deltaUpdate(generation, peer string, clocks ...uint64) []byte {
	data, _ := json.Marshal(replicaUpdate{Protocol: operationsProtocol, Generation: generation, Operations: operationsFor(peer, clocks...)})
	return data
}
func joinDeltas(t *testing.T, room *Room, peer, generation string) *Client {
	t.Helper()
	client := NewClient(room, nil, peer, "user", room.log)
	client.deltas, client.generation = true, generation
	select {
	case room.register <- client:
	case <-time.After(time.Second):
		t.Fatal("join timed out")
	}
	return client
}
func decodeUpdate(t *testing.T, data []byte) replicaUpdate {
	t.Helper()
	var update replicaUpdate
	if err := json.Unmarshal(data, &update); err != nil {
		t.Fatal(err)
	}
	return update
}

func TestOperationsTravelAndAreStoredWithoutTheBaseline(t *testing.T) {
	store := &memoryPersistence{generation: "g1", document: largeDocument}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	a := joinDeltas(t, room, "a", token)
	if state := decodeUpdate(t, receive(t, a, 2)); state.Protocol != fullStateProtocol || len(state.Base) < maxMessageSize {
		t.Fatal("the full state must still carry the baseline")
	}
	b := joinDeltas(t, room, "b", token)
	receive(t, b, 2)
	legacy := join(t, room, "legacy")
	receive(t, legacy, 2)

	room.handleUpdate(a, deltaUpdate(token, "a", 1))
	receive(t, a, 9)
	relayed := receive(t, b, 3)
	if update := decodeUpdate(t, relayed); update.Protocol != operationsProtocol || update.Base != nil || len(update.Operations) != 1 || len(relayed) > 512 {
		t.Fatalf("gotipe.v2 peer got %d bytes: %.200s", len(relayed), relayed)
	}
	// A gotipe.v1 client's engine compares the baseline of everything it receives.
	if update := decodeUpdate(t, receive(t, legacy, 3)); update.Protocol != fullStateProtocol || len(update.Base) < maxMessageSize || len(update.Operations) != 1 {
		t.Fatal("gotipe.v1 peer did not get the update with its baseline")
	}
	store.mu.Lock()
	record := store.updates[0]
	store.mu.Unlock()
	if len(record) > 512 || bytes.Contains(record, []byte(`"base"`)) || bytes.Contains(record, []byte(`"generation"`)) {
		t.Fatalf("stored record repeats the baseline or a token: %d bytes", len(record))
	}
	// The stored record loads again without a baseline to compare.
	restarted := startRoom(t, store)
	c := joinDeltas(t, restarted, "c", token)
	if operationCount(t, receive(t, c, 2)) != 1 {
		t.Fatal("stored operations were not replayed")
	}
}

func TestFirstProtocolClientsStillSyncWithEveryone(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	legacy := join(t, room, "legacy")
	receive(t, legacy, 2)
	other := join(t, room, "other")
	receive(t, other, 2)
	modern := joinDeltas(t, room, "modern", token)
	receive(t, modern, 2)
	room.handleUpdate(legacy, updateFor("legacy", 1, "Ж"))
	receive(t, legacy, 9)
	if update := decodeUpdate(t, receive(t, other, 3)); update.Protocol != fullStateProtocol || update.Base == nil {
		t.Fatal("gotipe.v1 peer lost the baseline of an update")
	}
	if update := decodeUpdate(t, receive(t, modern, 3)); update.Protocol != operationsProtocol || update.Base != nil || len(update.Operations) != 1 {
		t.Fatal("gotipe.v2 peer did not get the operations alone")
	}
	// A repeated delivery in either protocol is acknowledged and not stored again.
	room.handleUpdate(legacy, updateFor("legacy", 1, "Ж"))
	receive(t, legacy, 9)
	room.handleUpdate(modern, deltaUpdate(token, "legacy", 1))
	receive(t, modern, 9)
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(store.updates) != 1 {
		t.Fatalf("a duplicate was stored: %d records", len(store.updates))
	}
}

func TestHandshakeRefusesAReplicaOfAnotherGeneration(t *testing.T) {
	store := &memoryPersistence{generation: "g2"}
	room := startRoom(t, store)
	current := joinDeltas(t, room, "current", document.GenerationToken("g2"))
	receive(t, current, 2)
	// Loaded before the content was replaced: it must reload, and gets no state.
	stale := joinDeltas(t, room, "stale", document.GenerationToken("g1"))
	expectResync(t, stale)
	// The client of the current generation is not disturbed.
	room.handleUpdate(current, deltaUpdate(document.GenerationToken("g2"), "current", 1))
	if kind := receiveAny(t, current); kind != 0x04 && kind != 0x09 {
		t.Fatalf("unexpected message %d", kind)
	}
}

func receiveAny(t *testing.T, client *Client) byte {
	t.Helper()
	select {
	case data, ok := <-client.send:
		if !ok || len(data) == 0 {
			t.Fatal("connection closed")
		}
		return data[0]
	case <-time.After(2 * time.Second):
		t.Fatal("no message")
		return 0
	}
}

func TestUpdateMustNameTheRoomsGeneration(t *testing.T) {
	store := &memoryPersistence{generation: "g1"}
	token := document.GenerationToken("g1")
	room := startRoom(t, store)
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	b := joinDeltas(t, room, "b", token)
	receive(t, b, 2)
	// No generation: malformed, and reloading would not help.
	room.handleUpdate(a, deltaUpdate("", "a", 1))
	if code := errorCode(t, receive(t, a, 8)); code != "INVALID_UPDATE" {
		t.Fatalf("got %s", code)
	}
	withBase, _ := json.Marshal(replicaUpdate{Protocol: operationsProtocol, Generation: token, Base: testDocument, Operations: operationsFor("a", 1)})
	room.handleUpdate(a, withBase)
	if code := errorCode(t, receive(t, a, 8)); code != "INVALID_UPDATE" {
		t.Fatalf("got %s", code)
	}
	// Another generation while storage still has the room's: only the sender reloads.
	room.handleUpdate(a, deltaUpdate(document.GenerationToken("g0"), "a", 1))
	expectResync(t, a)
	receive(t, b, 4)
	room.handleUpdate(b, deltaUpdate(token, "b", 1))
	receive(t, b, 9)
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(store.updates) != 1 {
		t.Fatalf("a refused update was stored: %d", len(store.updates))
	}
}

func TestStoredRecordsOfEitherProtocolLoadTogether(t *testing.T) {
	// Rows written before generations repeat the baseline; they are pinned to
	// their generation by key and load without comparing it again.
	legacy := updateFor("old", 1, "Ж")
	store := &memoryPersistence{generation: "g1", updates: [][]byte{legacy, encodeOperations(operationsFor("new", 2, 3)), legacy}}
	room := startRoom(t, store)
	a := joinDeltas(t, room, "a", document.GenerationToken("g1"))
	if operationCount(t, receive(t, a, 2)) != 3 {
		t.Fatal("stored operations were lost or duplicated")
	}
}

func TestStagingAnUpdateDoesNotCopyOrChangeTheLog(t *testing.T) {
	log, _ := newUpdateLog(testDocument, testGeneration)
	accept(t, log, deltaUpdate(testGeneration, "a", 1, 2))
	before := log.operations
	fresh, _, err := log.stage(deltaUpdate(testGeneration, "a", 2, 3, 3))
	if err != nil || len(fresh) != 1 || fresh[0].ID.Lamport != 3 {
		t.Fatalf("staged %v: %v", fresh, err)
	}
	if len(log.operations) != 2 {
		t.Fatal("staging changed the log before the durable save")
	}
	log.commit(fresh)
	if len(log.operations) != 3 || len(before) != 3 {
		t.Fatal("commit must extend the live log in place")
	}
	// One update cannot hold two changes under one identity.
	conflicting := operationsFor("a", 4, 4)
	conflicting[1].Change = json.RawMessage(`{"DeleteBlock":{"block_id":"b1"}}`)
	data, _ := json.Marshal(replicaUpdate{Protocol: operationsProtocol, Generation: testGeneration, Operations: conflicting})
	if _, _, err := log.stage(data); err == nil {
		t.Fatal("accepted two changes under one identity")
	}
}

func TestMergeUpdatesIsAUnionInAnyOrderAndRefusesConflicts(t *testing.T) {
	rows := [][]byte{updateFor("a", 1, "Ж"), encodeOperations(operationsFor("b", 2, 3)), encodeOperations(operationsFor("b", 3, 4))}
	merged, err := MergeUpdates(rows)
	if err != nil {
		t.Fatal(err)
	}
	update := decodeUpdate(t, merged)
	if update.Protocol != operationsProtocol || update.Base != nil || len(update.Operations) != 4 {
		t.Fatalf("merged: %s", merged)
	}
	reversed, err := MergeUpdates([][]byte{rows[2], rows[1], rows[0]})
	if err != nil || !bytes.Equal(merged, reversed) {
		t.Fatal("the merge depends on record order")
	}
	// Merging the result with a later row equals merging everything.
	late := encodeOperations(operationsFor("c", 9))
	again, _ := MergeUpdates([][]byte{merged, late})
	all, _ := MergeUpdates(append(rows, late))
	if !bytes.Equal(again, all) {
		t.Fatal("compacting twice differs from compacting once")
	}
	if _, err := MergeUpdates([][]byte{updateFor("a", 1, "Ж"), updateFor("a", 1, "X")}); err == nil {
		t.Fatal("merged two changes under one identity")
	}
	if _, err := MergeUpdates([][]byte{[]byte(`{"protocol":"gotipe.crdt/3","operations":[]}`)}); err == nil {
		t.Fatal("merged an unknown record")
	}
}

func TestRoomCompactsItsLogAndReplaysTheSameOperations(t *testing.T) {
	store := &memoryPersistence{generation: "g1", compactAt: 3}
	token := document.GenerationToken("g1")
	room := startRoomEvery(t, store, 20*time.Millisecond)
	a := joinDeltas(t, room, "a", token)
	receive(t, a, 2)
	for clock := uint64(1); clock <= 5; clock++ {
		room.handleUpdate(a, deltaUpdate(token, "a", clock))
		receive(t, a, 9)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		store.mu.Lock()
		compactions, records := store.compactions, len(store.updates)
		store.mu.Unlock()
		if compactions > 0 {
			if records != 1 {
				t.Fatalf("log has %d records after compaction", records)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the room never compacted its log")
		}
		time.Sleep(5 * time.Millisecond)
	}
	// The live room keeps accepting updates; a row saved after the merge survives.
	room.handleUpdate(a, deltaUpdate(token, "a", 6))
	receive(t, a, 9)
	restarted := startRoom(t, store)
	b := joinDeltas(t, restarted, "b", token)
	if operationCount(t, receive(t, b, 2)) != 6 {
		t.Fatal("compaction changed the replayed operations")
	}
}

// dial opens a real WebSocket through the server's handler, as a browser does.
func dial(t *testing.T, address string, query url.Values, protocols ...string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	dialer := websocket.Dialer{Subprotocols: protocols, HandshakeTimeout: 2 * time.Second}
	return dialer.Dial("ws"+strings.TrimPrefix(address, "http")+"/sync?"+query.Encode(), nil)
}
func readFrame(t *testing.T, conn *websocket.Conn) (byte, []byte) {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	return data[0], data[1:]
}

func TestSubprotocolAndGenerationAreNegotiatedAtTheHandshake(t *testing.T) {
	store := &memoryPersistence{generation: "g1", document: largeDocument}
	token := document.GenerationToken("g1")
	server := NewServer(store, slog.New(slog.NewTextHandler(io.Discard, nil)))
	t.Cleanup(server.Shutdown)
	listener := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		server.HandleWebSocket()(w, r.WithContext(auth.WithUser(r.Context(), &auth.UserContext{UserID: "user"})))
	}))
	t.Cleanup(listener.Close)
	documentID := "0f9d7a52-6f0b-4c11-9b52-3d5f0e6f7a10"
	query := func(peer, generation string) url.Values {
		values := url.Values{"document_id": {documentID}, "peer_id": {peer}}
		if generation != "" {
			values.Set("generation", generation)
		}
		return values
	}

	// gotipe.v2 without a usable generation is refused before the upgrade.
	for _, generation := range []string{"", "two words", strings.Repeat("g", 129)} {
		if _, response, err := dial(t, listener.URL, query("bad", generation), deltaSubprotocol, baselineSubprotocol); err == nil || response == nil || response.StatusCode != http.StatusBadRequest {
			t.Fatalf("generation %q was not refused: %v", generation, err)
		}
	}
	// Another generation: one error frame, then a normal close. No state is sent.
	stale, _, err := dial(t, listener.URL, query("stale", document.GenerationToken("g0")), deltaSubprotocol, baselineSubprotocol)
	if err != nil {
		t.Fatal(err)
	}
	defer stale.Close()
	if kind, payload := readFrame(t, stale); kind != 0x08 || errorCode(t, payload) != BaselineReplacedCode {
		t.Fatalf("stale replica got message %d", kind)
	}
	stale.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := stale.ReadMessage(); !websocket.IsCloseError(err, websocket.CloseNormalClosure) {
		t.Fatalf("stale replica was not closed normally: %v", err)
	}

	modern, _, err := dial(t, listener.URL, query("modern", token), deltaSubprotocol, baselineSubprotocol)
	if err != nil {
		t.Fatal(err)
	}
	defer modern.Close()
	if modern.Subprotocol() != deltaSubprotocol {
		t.Fatalf("server selected %q", modern.Subprotocol())
	}
	if kind, _ := readFrame(t, modern); kind != 0x02 {
		t.Fatalf("expected the full state, got %d", kind)
	}
	// A client from before generations offers gotipe.v1 only and names none.
	legacy, _, err := dial(t, listener.URL, query("legacy", ""), baselineSubprotocol)
	if err != nil {
		t.Fatal(err)
	}
	defer legacy.Close()
	if legacy.Subprotocol() != baselineSubprotocol {
		t.Fatalf("server selected %q", legacy.Subprotocol())
	}
	if kind, _ := readFrame(t, legacy); kind != 0x02 {
		t.Fatalf("expected the full state, got %d", kind)
	}
	// The client's order decides: gotipe.v1 offered before gotipe.v2 is selected,
	// and such a client names no generation.
	ordered, _, err := dial(t, listener.URL, query("ordered", ""), baselineSubprotocol, deltaSubprotocol)
	if err != nil {
		t.Fatal(err)
	}
	defer ordered.Close()
	if ordered.Subprotocol() != baselineSubprotocol {
		t.Fatalf("server selected %q", ordered.Subprotocol())
	}
	if kind, _ := readFrame(t, ordered); kind != 0x02 {
		t.Fatalf("expected the full state, got %d", kind)
	}

	// An edit of a document larger than the message limit now fits a small frame.
	frame := append([]byte{0x03}, deltaUpdate(token, "modern", 1)...)
	if len(frame) > 1024 {
		t.Fatalf("update frame is %d bytes", len(frame))
	}
	if err := modern.WriteMessage(websocket.BinaryMessage, frame); err != nil {
		t.Fatal(err)
	}
	if kind, _ := readFrame(t, modern); kind != 0x09 {
		t.Fatalf("expected an acknowledgement, got %d", kind)
	}
	if kind, payload := readFrame(t, legacy); kind != 0x03 || decodeUpdate(t, payload).Protocol != fullStateProtocol {
		t.Fatalf("gotipe.v1 client got message %d", kind)
	}
	// A frame of half the limit, the size the provider fills, is accepted too.
	many := make([]uint64, 0, 1800)
	for clock := uint64(2); clock < 1802; clock++ {
		many = append(many, clock)
	}
	bulk := append([]byte{0x03}, deltaUpdate(token, "modern", many...)...)
	if len(bulk) < maxMessageSize/4 || len(bulk) > maxMessageSize/2 {
		t.Fatalf("bulk frame is %d bytes", len(bulk))
	}
	if err := modern.WriteMessage(websocket.BinaryMessage, bulk); err != nil {
		t.Fatal(err)
	}
	if kind, _ := readFrame(t, modern); kind != 0x09 {
		t.Fatalf("expected an acknowledgement, got %d", kind)
	}
}
