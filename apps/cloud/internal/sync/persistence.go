package sync

import (
	"context"
	"errors"
)

// ErrBaselineReplaced means the stored document no longer has the baseline an
// update or a room was built on: REST replaced its content (PATCH with content
// or a version restore). The room reloads storage and asks clients of the old
// baseline to load the document again.
var ErrBaselineReplaced = errors.New("collaboration baseline was replaced")

// StoredState is one storage generation: the ordinary document object plus the
// latest checkpoint and the updates recorded against that object.
type StoredState struct {
	// Generation identifies the baseline. Replacing content always changes it.
	Generation string
	Document   []byte
	// Updates holds the latest checkpoint, if any, then updates in order.
	Updates [][]byte
}

// PersistenceStore keeps collaboration state separately from document JSON.
type PersistenceStore interface {
	// LoadState loads the current generation.
	LoadState(ctx context.Context, documentID string) (StoredState, error)
	// CurrentGeneration reads only the current generation, so a room can check
	// cheaply whether another process replaced the document.
	CurrentGeneration(ctx context.Context, documentID string) (string, error)
	// SaveUpdate durably appends an update to generation and returns
	// ErrBaselineReplaced when generation is no longer current.
	SaveUpdate(ctx context.Context, documentID, generation string, update []byte) error
	// SaveSnapshot stores a checkpoint of generation and returns
	// ErrBaselineReplaced when generation is no longer current.
	SaveSnapshot(ctx context.Context, documentID, generation string, snapshot []byte) error
}
