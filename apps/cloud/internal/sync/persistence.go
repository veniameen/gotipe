package sync

import "context"

// PersistenceStore interface for saving/loading document state
type PersistenceStore interface {
	// LoadDocument loads the latest document state
	LoadDocument(ctx context.Context, documentID string) ([]byte, error)
	// LoadUpdates loads durable collaboration checkpoints and updates in order.
	LoadUpdates(ctx context.Context, documentID string) ([][]byte, error)
	// SaveUpdate saves an incremental CRDT update
	SaveUpdate(ctx context.Context, documentID string, update []byte) error
	// SaveSnapshot saves a collaboration checkpoint separately from document JSON
	SaveSnapshot(ctx context.Context, documentID string, snapshot []byte) error
}
