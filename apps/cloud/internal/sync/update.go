package sync

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
)

const replicaProtocol = "gotipe.crdt/1"

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
	Base       json.RawMessage    `json:"base"`
	Operations []replicaOperation `json:"operations"`
}

// updateLog owns a baseline and an immutable operation set. Document snapshots
// and collaboration envelopes remain distinct storage formats.
type updateLog struct {
	base       json.RawMessage
	operations map[operationID]replicaOperation
}

func newUpdateLog(document []byte) (*updateLog, error) {
	base, err := canonicalDocument(document)
	if err != nil {
		return nil, err
	}
	return &updateLog{base: base, operations: make(map[operationID]replicaOperation)}, nil
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

// prepare returns a staged union and only new operations for durable storage.
// The live log is not changed until persistence succeeds.
func (log *updateLog) prepare(data []byte) (*updateLog, []byte, bool, error) {
	var update replicaUpdate
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&update); err != nil {
		return nil, nil, false, err
	}
	if update.Protocol != replicaProtocol {
		return nil, nil, false, errors.New("unsupported collaboration protocol")
	}
	base, err := canonicalDocument(update.Base)
	if err != nil {
		return nil, nil, false, err
	}
	if !bytes.Equal(base, log.base) {
		return nil, nil, false, errors.New("collaboration baseline differs from saved document")
	}
	staged := &updateLog{base: log.base, operations: make(map[operationID]replicaOperation, len(log.operations)+len(update.Operations))}
	for id, op := range log.operations {
		staged.operations[id] = op
	}
	delta := replicaUpdate{Protocol: replicaProtocol, Base: log.base, Operations: []replicaOperation{}}
	for _, op := range update.Operations {
		if err := validateOperation(op); err != nil {
			return nil, nil, false, err
		}
		canonical, err := canonicalJSON(op.Change)
		if err != nil {
			return nil, nil, false, err
		}
		op.Change = canonical
		if prior, ok := staged.operations[op.ID]; ok {
			if !bytes.Equal(prior.Change, op.Change) {
				return nil, nil, false, errors.New("conflicting operation identity")
			}
			continue
		}
		staged.operations[op.ID] = op
		delta.Operations = append(delta.Operations, op)
	}
	encoded, err := json.Marshal(delta)
	return staged, encoded, len(delta.Operations) > 0, err
}
func (log *updateLog) encode() []byte {
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
	data, _ := json.Marshal(replicaUpdate{Protocol: replicaProtocol, Base: log.base, Operations: operations})
	return data // All fields were validated and are JSON serializable.
}

// ValidateBaseline verifies that an update belongs to the current REST document
// generation before a persistence adapter conditionally inserts it.
func ValidateBaseline(document, update []byte) error {
	log, err := newUpdateLog(document)
	if err != nil {
		return err
	}
	_, _, _, err = log.prepare(update)
	return err
}

// MergeUpdates creates a complete reconnect/bootstrap envelope from durable
// checkpoints and deltas without projecting or changing document content.
func MergeUpdates(document []byte, updates [][]byte) ([]byte, error) {
	log, err := newUpdateLog(document)
	if err != nil {
		return nil, err
	}
	for _, update := range updates {
		staged, _, _, err := log.prepare(update)
		if err != nil {
			return nil, err
		}
		log = staged
	}
	return log.encode(), nil
}
