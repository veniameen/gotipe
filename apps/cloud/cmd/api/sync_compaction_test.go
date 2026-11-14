package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	cloudsync "github.com/gotipe/cloud/internal/sync"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// logRecord is a row of document_updates or document_snapshots.
type logRecord struct {
	id         int64
	generation string
	data       []byte
}

// compactionDB models the three tables CompactLog touches. A transaction's
// writes are applied on Commit only, so a failure must leave every row.
type compactionDB struct {
	key       string
	nextID    int64
	updates   []logRecord
	snapshots []logRecord
	began     int
	// afterRead runs once the rows have been read for a merge, like a writer
	// whose change commits while the merge is in progress.
	afterRead  func()
	failInsert bool
}

func (db *compactionDB) add(generation string, data []byte) int64 {
	db.nextID++
	db.updates = append(db.updates, logRecord{db.nextID, generation, data})
	return db.nextID
}
func (db *compactionDB) of(records []logRecord, generation string) []logRecord {
	var out []logRecord
	for _, record := range records {
		if record.generation == generation {
			out = append(out, record)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].id < out[j].id })
	return out
}
func (db *compactionDB) Ping(context.Context) error { return nil }
func (db *compactionDB) Close()                     {}
func (db *compactionDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("compaction must write inside its transaction")
}
func (db *compactionDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	rows := &recordRows{records: db.of(db.updates, args[1].(string)), ids: strings.Contains(sql, "SELECT id")}
	if rows.ids && db.afterRead != nil {
		db.afterRead()
		db.afterRead = nil
	}
	return rows, nil
}
func (db *compactionDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	return syncRow(func(values ...any) error {
		switch {
		case strings.Contains(sql, "count(*)"):
			rows := db.of(db.updates, args[1].(string))
			var size, largest int64
			for _, row := range rows {
				size += int64(len(row.data))
				largest = max(largest, int64(len(row.data)))
			}
			*values[0].(*int64), *values[1].(*int64), *values[2].(*int64) = int64(len(rows)), size, largest
			*values[3].(*int64) = int64(len(db.of(db.snapshots, args[1].(string))))
		case strings.Contains(sql, "document_snapshots"):
			checkpoints := db.of(db.snapshots, args[1].(string))
			if len(checkpoints) == 0 {
				return pgx.ErrNoRows
			}
			latest := checkpoints[len(checkpoints)-1]
			if len(values) == 1 {
				*values[0].(*[]byte) = latest.data
			} else {
				*values[0].(*int64), *values[1].(*[]byte) = latest.id, latest.data
			}
		default:
			*values[0].(*string) = db.key
		}
		return nil
	})
}
func (db *compactionDB) BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error) {
	db.began++
	return &compactionTx{db: db}, nil
}

type compactionTx struct {
	pgx.Tx
	db       *compactionDB
	writes   []func()
	locked   bool
	affected int
}

func (tx *compactionTx) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if strings.Contains(sql, "FOR NO KEY UPDATE") {
		tx.locked = true
	}
	return tx.db.QueryRow(ctx, sql, args...)
}
func (tx *compactionTx) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	db := tx.db
	if !tx.locked {
		return pgconn.CommandTag{}, errors.New("the log was changed before the document row was locked")
	}
	switch {
	case strings.HasPrefix(sql, "INSERT INTO document_updates"):
		if db.failInsert {
			return pgconn.CommandTag{}, errors.New("storage unavailable")
		}
		generation, data := args[2].(string), args[1].([]byte)
		tx.writes = append(tx.writes, func() { db.add(generation, data) })
	case strings.HasPrefix(sql, "DELETE FROM document_updates"):
		ids := map[int64]bool{}
		for _, id := range args[0].([]int64) {
			ids[id] = true
		}
		present := 0
		for _, row := range db.updates {
			if ids[row.id] {
				present++
			}
		}
		tx.affected = present
		tx.writes = append(tx.writes, func() {
			kept := db.updates[:0]
			for _, row := range db.updates {
				if !ids[row.id] {
					kept = append(kept, row)
				}
			}
			db.updates = kept
		})
	case strings.HasPrefix(sql, "DELETE FROM document_snapshots"):
		generation, through := args[1].(string), args[2].(int64)
		tx.writes = append(tx.writes, func() {
			kept := db.snapshots[:0]
			for _, row := range db.snapshots {
				if row.generation != generation || row.id > through {
					kept = append(kept, row)
				}
			}
			db.snapshots = kept
		})
	default:
		return pgconn.CommandTag{}, fmt.Errorf("unexpected statement: %s", sql)
	}
	if strings.HasPrefix(sql, "DELETE FROM document_updates") {
		return pgconn.NewCommandTag(fmt.Sprintf("DELETE %d", tx.affected)), nil
	}
	return pgconn.CommandTag{}, nil
}
func (tx *compactionTx) Commit(context.Context) error {
	for _, write := range tx.writes {
		write()
	}
	return nil
}
func (tx *compactionTx) Rollback(context.Context) error { return nil }

type recordRows struct {
	pgx.Rows
	records []logRecord
	ids     bool
	next    int
}

func (r *recordRows) Next() bool { r.next++; return r.next <= len(r.records) }
func (r *recordRows) Scan(values ...any) error {
	record := r.records[r.next-1]
	if r.ids {
		*values[0].(*int64), *values[1].(*[]byte) = record.id, record.data
	} else {
		*values[0].(*[]byte) = record.data
	}
	return nil
}
func (*recordRows) Close()     {}
func (*recordRows) Err() error { return nil }

func operationsRecord(peer string, clocks ...int) []byte {
	operations := make([]map[string]any, 0, len(clocks))
	for _, clock := range clocks {
		id := map[string]any{"lamport": clock, "peer_id": peer}
		operations = append(operations, map[string]any{"id": id, "change": map[string]any{"InsertChar": map[string]any{
			"block_id": "b1", "position": []any{map[string]any{"digit": 2, "id": id}}, "value": "Ж", "marks": []any{},
		}}})
	}
	data, _ := json.Marshal(map[string]any{"protocol": "gotipe.crdt/2", "operations": operations})
	return data
}

// legacyRecord is a row or checkpoint from before generations: it repeats the baseline.
func legacyRecord(base []byte, peer string, clocks ...int) []byte {
	var update map[string]any
	json.Unmarshal(operationsRecord(peer, clocks...), &update)
	update["protocol"], update["base"] = "gotipe.crdt/1", json.RawMessage(base)
	data, _ := json.Marshal(update)
	return data
}

// replayed is what a room or a REST read replays: the identities of the union.
func replayed(t *testing.T, store *dbPersistenceStore) string {
	t.Helper()
	state, err := store.LoadState(context.Background(), "doc")
	if err != nil {
		t.Fatal(err)
	}
	merged, err := cloudsync.MergeUpdates(state.Updates)
	if err != nil {
		t.Fatal(err)
	}
	var update struct {
		Operations []struct {
			ID struct {
				Lamport int    `json:"lamport"`
				PeerID  string `json:"peer_id"`
			} `json:"id"`
		} `json:"operations"`
	}
	json.Unmarshal(merged, &update)
	ids := make([]string, 0, len(update.Operations))
	for _, op := range update.Operations {
		ids = append(ids, fmt.Sprintf("%s:%d", op.ID.PeerID, op.ID.Lamport))
	}
	return strings.Join(ids, " ")
}

func compactionStore(db *compactionDB, base []byte) *dbPersistenceStore {
	return &dbPersistenceStore{db: &storage.PostgresStore{Pool: db}, r2: &syncTestObjects{data: base}, compactRows: 3, compactBytes: 1 << 20}
}

func TestCompactLogMergesGrownLogAndKeepsEveryOperation(t *testing.T) {
	base := []byte(`{"blocks":[],"version":0}`)
	db := &compactionDB{key: "generation"}
	store := compactionStore(db, base)
	db.add("generation", operationsRecord("a", 1))
	db.add("generation", operationsRecord("b", 2, 3))
	if err := store.CompactLog(context.Background(), "doc", "generation"); err != nil || db.began != 0 {
		t.Fatalf("a log below the thresholds was compacted: %v", err)
	}
	db.add("generation", operationsRecord("a", 1, 4)) // A resent operation: rows may overlap.
	db.add("another-generation", operationsRecord("z", 9))
	before := replayed(t, store)
	if err := store.CompactLog(context.Background(), "doc", "generation"); err != nil {
		t.Fatal(err)
	}
	rows := db.of(db.updates, "generation")
	if len(rows) != 1 || strings.Contains(string(rows[0].data), `"base"`) {
		t.Fatalf("log was not merged into one record without a baseline: %d rows", len(rows))
	}
	if after := replayed(t, store); after != before || after != "a:1 b:2 b:3 a:4" {
		t.Fatalf("compaction changed the replay: %q, was %q", after, before)
	}
	if len(db.of(db.updates, "another-generation")) != 1 {
		t.Fatal("compaction touched another generation")
	}
	// One record is compact: nothing is rewritten until the log grows again.
	if err := store.CompactLog(context.Background(), "doc", "generation"); err != nil || db.began != 1 {
		t.Fatalf("a compact log was merged again: %v", err)
	}
}

func TestCompactLogKeepsARowCommittedDuringTheMerge(t *testing.T) {
	db := &compactionDB{key: "generation"}
	store := compactionStore(db, []byte(`{"blocks":[],"version":0}`))
	for clock := 1; clock <= 3; clock++ {
		db.add("generation", operationsRecord("a", clock))
	}
	// Another writer's row becomes visible after this transaction read the log.
	db.afterRead = func() { db.add("generation", operationsRecord("late", 7)) }
	if err := store.CompactLog(context.Background(), "doc", "generation"); err != nil {
		t.Fatal(err)
	}
	if rows := db.of(db.updates, "generation"); len(rows) != 2 {
		t.Fatalf("expected the late row and the merged one, got %d", len(rows))
	}
	if got := replayed(t, store); got != "a:1 a:2 a:3 late:7" {
		t.Fatalf("an acknowledged operation was lost: %q", got)
	}
	// The next compaction merges it; the replay converges to the same union.
	db.add("generation", operationsRecord("a", 8))
	if err := store.CompactLog(context.Background(), "doc", "generation"); err != nil {
		t.Fatal(err)
	}
	if rows := db.of(db.updates, "generation"); len(rows) != 1 || replayed(t, store) != "a:1 a:2 a:3 late:7 a:8" {
		t.Fatalf("second compaction: %d rows, %q", len(rows), replayed(t, store))
	}
}

func TestCompactLogWritesNothingWhenItsRowsWereMergedMeanwhile(t *testing.T) {
	db := &compactionDB{key: "generation"}
	store := compactionStore(db, []byte(`{"blocks":[],"version":0}`))
	for clock := 1; clock <= 3; clock++ {
		db.add("generation", operationsRecord("a", clock))
	}
	// Another process compacts the same rows after this one read them.
	db.afterRead = func() {
		db.updates = nil
		db.add("generation", operationsRecord("a", 1, 2, 3))
	}
	if err := store.CompactLog(context.Background(), "doc", "generation"); err != nil {
		t.Fatal(err)
	}
	if rows := db.of(db.updates, "generation"); len(rows) != 1 || replayed(t, store) != "a:1 a:2 a:3" {
		t.Fatalf("a second merged row was written: %d rows", len(rows))
	}
}

func TestCompactLogRefusesAReplacedGenerationAndFailsAtomically(t *testing.T) {
	db := &compactionDB{key: "new-generation"}
	store := compactionStore(db, []byte(`{"blocks":[],"version":0}`))
	for clock := 1; clock <= 3; clock++ {
		db.add("old-generation", operationsRecord("a", clock))
	}
	if err := store.CompactLog(context.Background(), "doc", "old-generation"); !errors.Is(err, cloudsync.ErrBaselineReplaced) {
		t.Fatalf("a replaced generation was compacted: %v", err)
	}
	if len(db.updates) != 3 {
		t.Fatal("rows of the replaced generation changed")
	}
	db.key, db.failInsert = "old-generation", true
	if err := store.CompactLog(context.Background(), "doc", "old-generation"); err == nil {
		t.Fatal("a failed insert was reported as success")
	}
	if len(db.updates) != 3 {
		t.Fatal("a failed compaction deleted rows")
	}
	// A record the merge cannot read stops it: nothing is deleted on a guess.
	db.failInsert = false
	db.add("old-generation", []byte(`{"protocol":"gotipe.crdt/2","operations":[{"id":{"lamport":1,"peer_id":"a"},"change":{"DeleteBlock":{"block_id":"other"}}}]}`))
	if err := store.CompactLog(context.Background(), "doc", "old-generation"); err == nil || len(db.updates) != 4 {
		t.Fatalf("conflicting rows were merged: %v", err)
	}
}

func TestCompactLogAbsorbsRecordsFromBeforeGenerations(t *testing.T) {
	// Every old row and checkpoint repeats the baseline: sixty rows of a large
	// document were enough to pass the 60 MiB a REST read can apply.
	base := []byte(`{"version":0,"blocks":[{"id":"b1","block_type":"paragraph","attrs":{"src":"` + strings.Repeat("A", 1<<20) + `"},"content":{"type":"RichText","value":[]},"children":[]}]}`)
	db := &compactionDB{key: "generation", nextID: 100}
	store := compactionStore(db, base)
	store.compactRows, store.compactBytes = 0, 0 // The defaults.
	var stored int
	for clock := 1; clock <= 8; clock++ {
		row := legacyRecord(base, "old", clock)
		stored += len(row)
		db.add("generation", row)
	}
	db.snapshots = []logRecord{{1, "generation", legacyRecord(base, "old", 1, 2)}, {2, "generation", legacyRecord(base, "old", 1, 2, 3, 4)}}
	before := replayed(t, store)
	if err := store.CompactLog(context.Background(), "doc", "generation"); err != nil {
		t.Fatal(err)
	}
	rows := db.of(db.updates, "generation")
	if len(rows) != 1 || len(db.snapshots) != 0 {
		t.Fatalf("legacy records remain: %d rows, %d checkpoints", len(rows), len(db.snapshots))
	}
	if stored < 8<<20 || len(rows[0].data) > 4096 {
		t.Fatalf("log went from %d to %d bytes", stored, len(rows[0].data))
	}
	if after := replayed(t, store); after != before || after != "old:1 old:2 old:3 old:4 old:5 old:6 old:7 old:8" {
		t.Fatalf("replay changed: %q", after)
	}
}

func TestCompactLogWaitsForAFreeSlotAndGivesUpUnchanged(t *testing.T) {
	db := &compactionDB{key: "generation"}
	store := compactionStore(db, []byte(`{"blocks":[],"version":0}`))
	for clock := 1; clock <= 3; clock++ {
		db.add("generation", operationsRecord("a", clock))
	}
	// Every slot of this process is taken by other merges.
	for range concurrentCompactions {
		compactionSlots <- struct{}{}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	err := store.CompactLog(ctx, "doc", "generation")
	cancel()
	for range concurrentCompactions {
		<-compactionSlots
	}
	if !errors.Is(err, context.DeadlineExceeded) || db.began != 0 || len(db.updates) != 3 {
		t.Fatalf("a compaction ran without a slot: %v", err)
	}
	if err := store.CompactLog(context.Background(), "doc", "generation"); err != nil || len(db.updates) != 1 {
		t.Fatalf("a free slot did not compact: %v", err)
	}
}
