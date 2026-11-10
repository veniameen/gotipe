//go:build integration

package document

import (
	"context"
	"github.com/gotipe/cloud/internal/testdb"
	"strings"
	"testing"
)

func TestMaterializationIgnoresLateWritesFromReplacedBaseline(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID, docID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('snapshot@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'new-base')RETURNING id`, userID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	for _, generation := range []string{"old-base", "new-base"} {
		if _, err := db.Pool.Exec(ctx, `INSERT INTO document_updates(document_id,data,generation_key)VALUES($1,$2,$3)`, docID, []byte(`{"generation":"`+generation+`"}`), generation); err != nil {
			t.Fatal(err)
		}
	}
	reader := &Reader{DB: db.Pool, Store: objects{baseline: []byte(`{"blocks":[]}`)}, Converter: converter(func(_ context.Context, _ string, data []byte) ([]byte, error) {
		if strings.Contains(string(data), "old-base") || !strings.Contains(string(data), "new-base") {
			t.Fatalf("wrong generation %s", data)
		}
		return []byte(`{"blocks":[]}`), nil
	})}
	snapshot, err := reader.LoadSnapshot(ctx, docID, "new-base")
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.CollaborationState.Updates) != 1 {
		t.Fatal("obsolete generation leaked into browser bootstrap")
	}
}
