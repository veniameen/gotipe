package sync

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
)

const (
	// fullStateProtocol repeats the baseline document: the full state (0x02) and
	// updates of gotipe.v1 clients.
	fullStateProtocol = "gotipe.crdt/1"
	// operationsProtocol carries operations only. A client names their baseline
	// by its generation token; stored records are pinned by generation_key.
	operationsProtocol = "gotipe.crdt/2"
)

type operationID struct {
	Lamport uint64 `json:"lamport"`
	PeerID  string `json:"peer_id"`
}
type replicaOperation struct {
	ID     operationID     `json:"id"`
	Change json.RawMessage `json:"change"`
}
type replicaUpdate struct {
	Protocol   string             `json:"protocol"`
	Base       json.RawMessage    `json:"base,omitempty"`
	Generation string             `json:"generation,omitempty"`
	Operations []replicaOperation `json:"operations"`
	// Continues marks a part of one transaction that a later part completes.
	// Only a client's gotipe.crdt/2 update carries it; nothing stored does.
	Continues bool `json:"continues,omitempty"`
}

// updateLog owns a baseline and an immutable operation set. Document snapshots
// and collaboration envelopes remain distinct storage formats.
type updateLog struct {
	base json.RawMessage
	// generation is the token clients name in gotipe.crdt/2 updates.
	generation string
	// stored counts the bytes a read of this generation applies: the baseline
	// and every stored record. It only grows while the room runs.
	stored     int
	operations map[operationID]replicaOperation
}

func newUpdateLog(document []byte, generation string) (*updateLog, error) {
	base, err := canonicalDocument(document)
	if err != nil {
		return nil, err
	}
	return &updateLog{base: base, generation: generation, operations: make(map[operationID]replicaOperation)}, nil
}
func canonicalDocument(data []byte) ([]byte, error) {
	normalized, err := normalizedDocument(data)
	if err != nil {
		return nil, fmt.Errorf("invalid document snapshot: %w", err)
	}
	return normalized, nil
}
func canonicalJSON(data []byte) ([]byte, error) {
	var value any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}

// stage validates a client's update against this log's baseline and returns
// the operations the log lacks, in the update's order, and whether a later part
// completes the transaction. The log does not change until commit, which
// follows the durable save: the cost is the update's size, not the log's.
func (log *updateLog) stage(data []byte) ([]replicaOperation, bool, error) {
	return log.read(data, false)
}

// restore merges a stored record of this log's generation. Storage pins records
// to the generation by key, so their baseline is not compared again.
func (log *updateLog) restore(data []byte) error {
	operations, _, err := log.read(data, true)
	if err == nil {
		log.commit(operations)
	}
	return err
}
func (log *updateLog) commit(operations []replicaOperation) {
	for _, op := range operations {
		log.operations[op.ID] = op
	}
}
func (log *updateLog) read(data []byte, stored bool) ([]replicaOperation, bool, error) {
	var update replicaUpdate
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&update); err != nil {
		return nil, false, err
	}
	if update.Continues && (stored || update.Protocol != operationsProtocol) {
		return nil, false, errors.New("only a client's gotipe.crdt/2 update may continue a transaction")
	}
	operations, err := log.unknown(update, stored)
	return operations, update.Continues, err
}
func (log *updateLog) unknown(update replicaUpdate, stored bool) ([]replicaOperation, error) {
	switch update.Protocol {
	case fullStateProtocol:
		if stored {
			break
		}
		base, err := canonicalDocument(update.Base)
		if err != nil {
			return nil, err
		}
		if !bytes.Equal(base, log.base) {
			return nil, fmt.Errorf("%w: the update starts from another document", ErrBaselineReplaced)
		}
	case operationsProtocol:
		if len(update.Base) != 0 {
			return nil, errors.New("a gotipe.crdt/2 update names its baseline by generation only")
		}
		if !stored && update.Generation == "" {
			return nil, errors.New("a gotipe.crdt/2 update must name its generation")
		}
		if !stored && update.Generation != log.generation {
			return nil, fmt.Errorf("%w: the update names another generation", ErrBaselineReplaced)
		}
	default:
		return nil, errors.New("unsupported collaboration protocol")
	}
	for i, op := range update.Operations {
		if err := validateOperation(op); err != nil {
			return nil, err
		}
		canonical, err := canonicalJSON(op.Change)
		if err != nil {
			return nil, err
		}
		update.Operations[i].Change = canonical
	}
	return log.lacking(update.Operations, nil)
}

// lacking returns the validated, canonical operations this log and earlier
// parts of the same transaction (known) do not hold yet. A known identity with
// another change is a conflict.
func (log *updateLog) lacking(operations []replicaOperation, known map[operationID]json.RawMessage) ([]replicaOperation, error) {
	fresh := make([]replicaOperation, 0, len(operations))
	repeated := make(map[operationID]json.RawMessage, len(operations))
	for _, op := range operations {
		prior, seen := log.operations[op.ID]
		priorChange := prior.Change
		if !seen {
			priorChange, seen = repeated[op.ID]
		}
		if !seen {
			priorChange, seen = known[op.ID]
		}
		if seen {
			if !bytes.Equal(priorChange, op.Change) {
				return nil, errors.New("conflicting operation identity")
			}
			continue
		}
		repeated[op.ID] = op.Change
		fresh = append(fresh, op)
	}
	return fresh, nil
}

// encodeOperations is the stored form of new operations and what gotipe.v2
// clients receive: no baseline and no generation.
func encodeOperations(operations []replicaOperation) []byte {
	if operations == nil {
		operations = []replicaOperation{}
	}
	data, _ := json.Marshal(replicaUpdate{Protocol: operationsProtocol, Operations: operations})
	return data // All fields were validated and are JSON serializable.
}

// encodeWithBaseline is the same update for gotipe.v1 clients, whose engine
// compares the baseline of everything it receives.
func (log *updateLog) encodeWithBaseline(operations []replicaOperation) []byte {
	if operations == nil {
		operations = []replicaOperation{}
	}
	data, _ := json.Marshal(replicaUpdate{Protocol: fullStateProtocol, Base: log.base, Operations: operations})
	return data
}
func (log *updateLog) sorted() []replicaOperation {
	operations := make([]replicaOperation, 0, len(log.operations))
	for _, op := range log.operations {
		operations = append(operations, op)
	}
	sort.Slice(operations, func(i, j int) bool {
		if operations[i].ID.Lamport != operations[j].ID.Lamport {
			return operations[i].ID.Lamport < operations[j].ID.Lamport
		}
		return operations[i].ID.PeerID < operations[j].ID.PeerID
	})
	return operations
}

// encode is the full state: the baseline and every operation.
func (log *updateLog) encode() []byte {
	return log.encodeWithBaseline(log.sorted())
}

// LogMerger unions stored records of one generation, checkpoints and updates
// in either protocol, into one gotipe.crdt/2 record. It never projects or
// changes document content.
type LogMerger struct{ log *updateLog }

func NewLogMerger() *LogMerger {
	return &LogMerger{log: &updateLog{operations: make(map[operationID]replicaOperation)}}
}

// Add merges one stored record; a failed record leaves the merge unchanged.
func (m *LogMerger) Add(update []byte) error { return m.log.restore(update) }

// Bytes encodes every operation merged so far, in identity order.
func (m *LogMerger) Bytes() []byte { return encodeOperations(m.log.sorted()) }

// MergeUpdates compacts durable records into one. Replay is a union, so the
// result replaces exactly the records it was built from.
func MergeUpdates(updates [][]byte) ([]byte, error) {
	merger := NewLogMerger()
	for _, update := range updates {
		if err := merger.Add(update); err != nil {
			return nil, err
		}
	}
	return merger.Bytes(), nil
}
