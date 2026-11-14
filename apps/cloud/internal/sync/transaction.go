package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/gotipe/cloud/internal/document"
)

const (
	// UpdateTooLargeCode is the 0x08 error code for a transaction whose parts
	// exceed what the room buffers for one client. The sender may send it again
	// in smaller pieces; the same transaction whole never fits.
	UpdateTooLargeCode = "UPDATE_TOO_LARGE"
	// DocumentTooLargeCode refuses a save that would make the document's stored
	// state larger than a read may apply (document.MaterializationLimit).
	DocumentTooLargeCode = "DOCUMENT_TOO_LARGE"
	// DefaultTransactionLimit bounds the message bytes of one client's
	// transaction that a room buffers until its last part arrives.
	DefaultTransactionLimit = 16 << 20
	// maxTransactionLimit keeps two transactions of the limit below what a
	// read may apply.
	maxTransactionLimit = document.MaterializationLimit / 2
	// transactionsPerProcess sizes the process-wide buffer for unfinished
	// transactions: this many transactions of the limit at once.
	transactionsPerProcess = 8
	// defaultPartTimeout is the longest wait between two parts of one transaction.
	defaultPartTimeout = 30 * time.Second
	// partExpired is the room event of a transaction whose parts stopped coming.
	partExpired byte = 0xfe
)

var (
	errTransactionTooLarge = errors.New("the transaction exceeds the server's limit")
	errTransactionsBusy    = errors.New("the server buffers too many unfinished transactions")
)

// byteBudget bounds the bytes of unfinished transactions in one process.
type byteBudget struct {
	mu          sync.Mutex
	used, limit int
}

func newByteBudget(limit int) *byteBudget { return &byteBudget{limit: limit} }
func (b *byteBudget) take(n int) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.used+n > b.limit {
		return false
	}
	b.used += n
	return true
}
func (b *byteBudget) give(n int) {
	b.mu.Lock()
	b.used -= n
	b.mu.Unlock()
}

// partialTransaction holds the staged parts of one client's transaction. A
// transaction larger than one message arrives as parts flagged `continues`;
// nothing of it is saved, acknowledged or relayed before its last part. The
// room's event loop owns it; a disconnect, an error or a pause longer than
// partTimeout drops it with its budget.
type partialTransaction struct {
	operations []replicaOperation
	known      map[operationID]json.RawMessage
	bytes      int
	timer      *time.Timer
}

// receiveUpdate handles a client's update or one part of its transaction.
func (r *Room) receiveUpdate(ctx context.Context, client *Client, data []byte) {
	assembling := client.partial != nil
	operations, continues, err := r.state.stage(data)
	if err == nil {
		operations, err = r.collect(client, operations, len(data), continues)
	}
	if err != nil {
		r.dropPartial(client)
		r.refuse(ctx, client, err)
		// The sender has already sent the later parts of this transaction. They
		// must never be saved as a transaction of their own: the connection ends,
		// and the sender sends the whole transaction again after reconnecting.
		if assembling || continues {
			r.release(client)
		}
		return
	}
	if continues {
		return // Saved, acknowledged and relayed whole, with its last part.
	}
	r.save(ctx, client, operations)
}

func (r *Room) refuse(ctx context.Context, client *Client, err error) {
	switch {
	case errors.Is(err, ErrBaselineReplaced):
		r.foreignBaseline(ctx, client)
	case errors.Is(err, errTransactionTooLarge):
		r.error(client, UpdateTooLargeCode, "The transaction exceeds the server's limit and cannot be saved whole.")
		r.release(client)
	case errors.Is(err, errTransactionsBusy):
		r.error(client, "UPDATE_NOT_SAVED", "The server is busy with other large transactions; reconnect and retry.")
		r.release(client)
	default:
		r.error(client, "INVALID_UPDATE", err.Error())
	}
}

// collect adds one staged part of client's transaction. It returns the whole
// transaction with the last part (continues false) and nil while parts are
// outstanding.
func (r *Room) collect(client *Client, operations []replicaOperation, size int, continues bool) ([]replicaOperation, error) {
	partial := client.partial
	if partial == nil {
		if !continues {
			return operations, nil
		}
		partial = &partialTransaction{known: make(map[operationID]json.RawMessage)}
		client.partial = partial
	}
	if partial.bytes+size > r.transactionLimit {
		return nil, errTransactionTooLarge
	}
	if !r.budget.take(size) {
		return nil, errTransactionsBusy
	}
	partial.bytes += size
	fresh, err := r.state.lacking(operations, partial.known)
	if err != nil {
		return nil, err
	}
	for _, op := range fresh {
		partial.known[op.ID] = op.Change
	}
	partial.operations = append(partial.operations, fresh...)
	if continues {
		r.awaitPart(client, partial)
		return nil, nil
	}
	whole := partial.operations
	r.dropPartial(client)
	// Other clients may have saved some of these operations since the first part.
	return r.state.lacking(whole, nil)
}

// awaitPart drops the transaction if its next part does not come in time;
// presence and pings alone keep a connection, not an unfinished transaction.
func (r *Room) awaitPart(client *Client, partial *partialTransaction) {
	if partial.timer != nil {
		partial.timer.Stop()
	}
	partial.timer = time.AfterFunc(r.partTimeout, func() {
		select {
		case r.events <- roomEvent{client: client, kind: partExpired, partial: partial}:
		case <-r.done:
		}
	})
}

// dropPartial releases client's unfinished transaction and its budget.
func (r *Room) dropPartial(client *Client) {
	partial := client.partial
	if partial == nil {
		return
	}
	if partial.timer != nil {
		partial.timer.Stop()
	}
	r.budget.give(partial.bytes)
	client.partial = nil
}

// save stores new operations as one record, then commits, relays and
// acknowledges them. A record that would make the stored state larger than a
// read may apply is refused before the document becomes unreadable.
func (r *Room) save(ctx context.Context, client *Client, operations []replicaOperation) {
	if len(operations) > 0 {
		record := encodeOperations(operations)
		if r.state.stored+len(record) > r.storedLimit {
			r.error(client, DocumentTooLargeCode, fmt.Sprintf(
				"The document's stored state would exceed %d MiB, more than it can be read with; the update was not saved.",
				r.storedLimit>>20))
			return
		}
		// A large record takes longer to write; the room waits for it.
		saveCtx, cancel := context.WithTimeout(ctx, 5*time.Second+time.Duration(len(record)>>20)*time.Second/2)
		saveErr := r.persist.SaveUpdate(saveCtx, r.documentID, r.generation, record)
		cancel()
		if errors.Is(saveErr, ErrBaselineReplaced) {
			r.adoptStoredBaseline(ctx)
			return
		}
		if saveErr != nil {
			r.log.Error("failed to persist collaboration update", "document_id", r.documentID, "error", saveErr)
			r.error(client, "UPDATE_NOT_SAVED", "The update was not saved; reconnect and retry.")
			return
		}
		r.state.commit(operations)
		r.state.stored += len(record)
		r.dirty = true
		r.relay(client, operations, record)
	}
	r.send(client, 0x09, nil)
}

// SetTransactionLimit sets how many message bytes of one client's transaction
// a room buffers: from one message up to half of what a read may apply, so two
// such transactions never make a document unreadable. A process buffers at most
// transactionsPerProcess of them at once. Rooms created later use it.
func (s *Server) SetTransactionLimit(bytes int) error {
	if bytes < maxMessageSize || bytes > maxTransactionLimit {
		return fmt.Errorf("sync transaction limit requires %d..%d bytes", maxMessageSize, maxTransactionLimit)
	}
	s.mu.Lock()
	s.transactionLimit = bytes
	s.budget = newByteBudget(bytes * transactionsPerProcess)
	s.mu.Unlock()
	return nil
}
