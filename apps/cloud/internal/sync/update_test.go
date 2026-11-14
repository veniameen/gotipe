package sync

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/gotipe/cloud/internal/document"
)

// testGeneration is the token of memoryPersistence's default generation.
var testGeneration = document.GenerationToken("")

var testDocument = []byte(`{"version":0,"blocks":[{"id":"b1","block_type":"paragraph","attrs":{},"content":{"type":"RichText","value":[{"text":"A","marks":[]}]},"children":[]}]}`)

func updateFor(peer string, clock uint64, value string) []byte {
	id := operationID{Lamport: clock, PeerID: peer}
	change, _ := json.Marshal(map[string]any{"InsertChar": map[string]any{
		"block_id": "b1", "position": []positionPart{{Digit: 2, ID: id}}, "value": value, "marks": []any{},
	}})
	data, _ := json.Marshal(replicaUpdate{Protocol: fullStateProtocol, Base: testDocument, Operations: []replicaOperation{{ID: id, Change: change}}})
	return data
}
func operationCount(t *testing.T, data []byte) int {
	t.Helper()
	var update replicaUpdate
	if err := json.Unmarshal(data, &update); err != nil {
		t.Fatal(err)
	}
	return len(update.Operations)
}
func TestUpdateLogUnionsDuplicatesAndReorderedDeliveries(t *testing.T) {
	log, err := newUpdateLog(testDocument, testGeneration)
	if err != nil {
		t.Fatal(err)
	}
	for _, data := range [][]byte{updateFor("b", 2, "😀"), updateFor("a", 1, "Ж"), updateFor("b", 2, "😀")} {
		accept(t, log, data)
	}
	if operationCount(t, log.encode()) != 2 {
		t.Fatal("update was dropped or duplicated")
	}
	reordered, _ := newUpdateLog(testDocument, testGeneration)
	for _, data := range [][]byte{updateFor("a", 1, "Ж"), updateFor("b", 2, "😀")} {
		accept(t, reordered, data)
	}
	if string(log.encode()) != string(reordered.encode()) {
		t.Fatal("delivery order changed merged state")
	}
	if fresh, _, err := log.stage(updateFor("a", 1, "Ж")); err != nil || len(fresh) != 0 {
		t.Fatal("duplicate was not idempotent")
	}
}

// accept stages and commits an update the way a room does after a durable save.
func accept(t *testing.T, log *updateLog, data []byte) []replicaOperation {
	t.Helper()
	fresh, _, err := log.stage(data)
	if err != nil {
		t.Fatal(err)
	}
	log.commit(fresh)
	return fresh
}
func TestUpdateValidationRejectsConflictsAndMalformedChangesAtomically(t *testing.T) {
	log, _ := newUpdateLog(testDocument, testGeneration)
	accept(t, log, updateFor("a", 1, "Ж"))
	before := string(log.encode())
	bad := [][]byte{[]byte(`{}`), []byte(`{"protocol":"gotipe.crdt/1","base":{"blocks":[]},"operations":[]}`), updateFor("a", 1, "X"), updateFor("a", 2, "two characters")}
	var poison replicaUpdate
	json.Unmarshal(updateFor("a", 2, "X"), &poison)
	poison.Operations[0].Change = json.RawMessage(`{"NotImplemented":{"block_id":"b1"}}`)
	unknown, _ := json.Marshal(poison)
	bad = append(bad, unknown)
	for _, data := range bad {
		if _, _, err := log.stage(data); err == nil {
			t.Fatalf("accepted invalid update: %s", data)
		}
	}
	if string(log.encode()) != before {
		t.Fatal("failed validation changed log")
	}
}
func TestRevisionCountersDoNotChangeBaselineIdentity(t *testing.T) {
	var update replicaUpdate
	json.Unmarshal(updateFor("a", 1, "Ж"), &update)
	var base map[string]any
	json.Unmarshal(update.Base, &base)
	base["version"] = 42
	update.Base, _ = json.Marshal(base)
	encoded, _ := json.Marshal(update)
	if err := acceptsBaseline(testDocument, encoded); err != nil {
		t.Fatal(err)
	}
}

func TestPublicAndRustBaselinesHaveTheSameIdentity(t *testing.T) {
	public := []byte(`{"version":42,"blocks":[{"id":"b1","type":"heading","attrs":{"level":2},"content":[{"text":"Ж😀","marks":[{"type":"bold"}]}]}]}`)
	rust := []byte(`{"version":1,"blocks":[{"id":"b1","block_type":"heading","attrs":{"level":2.0},"content":{"type":"RichText","value":[{"text":"Ж😀","marks":[{"mark_type":"bold","attrs":{}}]}]},"children":[]}]}`)
	data, _ := json.Marshal(replicaUpdate{Protocol: fullStateProtocol, Base: rust, Operations: []replicaOperation{}})
	if err := acceptsBaseline(public, data); err != nil {
		t.Fatal(err)
	}
	other := []byte(`{"version":0,"blocks":[{"id":"b2","type":"paragraph","content":[]}]}`)
	if err := acceptsBaseline(other, data); !errors.Is(err, ErrBaselineReplaced) {
		t.Fatalf("another baseline was not reported as replaced: %v", err)
	}
}

func acceptsBaseline(document, update []byte) error {
	log, err := newUpdateLog(document, testGeneration)
	if err != nil {
		return err
	}
	_, _, err = log.stage(update)
	return err
}

func TestNestedJSONAttributesPreserveBaselineAndOperationValues(t *testing.T) {
	baseline := []byte(`{"version":0,"blocks":[{"id":"b1","type":"paragraph","attrs":{"align":["left",null],"settings":{"enabled":true,"values":[1,{"key":"Ж😀"}]}},"content":[],"children":[]}]}`)
	log, err := newUpdateLog(baseline, testGeneration)
	if err != nil {
		t.Fatal(err)
	}
	change := json.RawMessage(`{"SetAttr":{"block_id":"b1","key":"settings","value":{"nested":[true,1,{"text":"😀"}]}}}`)
	update, _ := json.Marshal(replicaUpdate{Protocol: fullStateProtocol, Base: baseline, Operations: []replicaOperation{{ID: operationID{Lamport: 1, PeerID: "a"}, Change: change}}})
	if len(accept(t, log, update)) != 1 || operationCount(t, log.encode()) != 1 {
		t.Fatal("attribute operation lost")
	}
}

func TestWireClocksStayWithinExactJavaScriptIntegers(t *testing.T) {
	log, err := newUpdateLog(testDocument, testGeneration)
	if err != nil {
		t.Fatal(err)
	}
	before := string(log.encode())
	for _, clock := range []uint64{maxLamport + 1, ^uint64(0)} {
		if _, _, err := log.stage(updateFor("peer", clock, "X")); err == nil {
			t.Fatalf("accepted unsafe clock %d", clock)
		}
	}
	var nested replicaUpdate
	if err := json.Unmarshal(updateFor("peer", maxLamport+1, "X"), &nested); err != nil {
		t.Fatal(err)
	}
	nested.Operations[0].ID.Lamport = 1
	data, err := json.Marshal(nested)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := log.stage(data); err == nil {
		t.Fatal("accepted unsafe nested position clock")
	}
	if string(log.encode()) != before {
		t.Fatal("failed clock validation changed log")
	}
	if _, _, err := log.stage(updateFor("peer", maxLamport, "X")); err != nil {
		t.Fatalf("maximum exact clock rejected: %v", err)
	}
}
