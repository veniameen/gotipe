//go:build integration

package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/gotipe/cloud/internal/testdb"
)

type listedPage struct {
	Data []struct {
		ID          string `json:"id"`
		VersionType string `json:"version_type"`
	} `json:"data"`
	HasMore    bool   `json:"has_more"`
	NextCursor string `json:"next_cursor"`
}

func readPage(t *testing.T, handle http.HandlerFunc, user *auth.UserContext, docID, query string) listedPage {
	t.Helper()
	w := httptest.NewRecorder()
	handle(w, apiRequest("GET", "/?"+query, "", user, map[string]string{"docId": docID}))
	if w.Code != 200 {
		t.Fatalf("%s: %d %s", query, w.Code, w.Body)
	}
	var page listedPage
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if page.HasMore == (page.NextCursor == "") {
		t.Fatalf("%s: has_more %v with cursor %q", query, page.HasMore, page.NextCursor)
	}
	return page
}

func pageIDs(page listedPage) []string {
	ids := make([]string, len(page.Data))
	for i, item := range page.Data {
		ids[i] = item.ID
	}
	return ids
}

func orderedIDs(t *testing.T, db *storage.PostgresStore, sql, docID string) []string {
	t.Helper()
	rows, err := db.Pool.Query(context.Background(), sql, docID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

func listFixture(t *testing.T) (*storage.PostgresStore, *auth.UserContext, string) {
	t.Helper()
	db := testdb.Open(t)
	var userID, docID string
	ctx := context.Background()
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('pages@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'content')RETURNING id`, userID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	return db, &auth.UserContext{UserID: userID, Plan: "free", ExpiresAt: time.Now().Add(time.Hour)}, docID
}

// Comments created in one microsecond are ordered by ID; deleting or resolving
// comments already shown does not skip the ones on later pages.
func TestCommentPagesSurviveChangesBetweenRequests(t *testing.T) {
	db, user, docID := listFixture(t)
	ctx := context.Background()
	at := time.Date(2026, 11, 15, 9, 0, 0, 123456000, time.UTC)
	for _, offset := range []time.Duration{0, 0, 0, 0, time.Millisecond, 2 * time.Millisecond} {
		if _, err := db.Pool.Exec(ctx, `INSERT INTO comments(document_id,author_id,content,anchor_type,created_at,updated_at)VALUES($1,$2,'note','document',$3,$3)`, docID, user.UserID, at.Add(offset)); err != nil {
			t.Fatal(err)
		}
	}
	order := orderedIDs(t, db, `SELECT id FROM comments WHERE document_id=$1 ORDER BY created_at, id`, docID)
	list := NewCommentsHandler(db, audit.NewAuditLogger(db.Pool)).ListComments()

	first := readPage(t, list, user, docID, "limit=2")
	if !reflect.DeepEqual(pageIDs(first), order[:2]) || !first.HasMore {
		t.Fatalf("first page %v, want %v", pageIDs(first), order[:2])
	}
	if _, err := db.Pool.Exec(ctx, `DELETE FROM comments WHERE id=$1`, order[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE comments SET resolved_at=now(), resolved_by=$2 WHERE id=$1`, order[1], user.UserID); err != nil {
		t.Fatal(err)
	}
	second := readPage(t, list, user, docID, "limit=2&cursor="+url.QueryEscape(first.NextCursor))
	if !reflect.DeepEqual(pageIDs(second), order[2:4]) || !second.HasMore {
		t.Fatalf("second page %v, want %v", pageIDs(second), order[2:4])
	}
	last := readPage(t, list, user, docID, "limit=2&cursor="+url.QueryEscape(second.NextCursor))
	if !reflect.DeepEqual(pageIDs(last), order[4:]) || last.HasMore {
		t.Fatalf("last page %v (more %v), want %v", pageIDs(last), last.HasMore, order[4:])
	}
	all := readPage(t, list, user, docID, "include_resolved=true")
	if !reflect.DeepEqual(pageIDs(all), order[1:]) {
		t.Fatalf("resolved comments listed %v, want %v", pageIDs(all), order[1:])
	}
}

// A version created between requests does not repeat the last one shown, and
// restore points (stored without a description) are listed.
func TestVersionPagesSurviveNewVersionsAndListRestorePoints(t *testing.T) {
	db, user, docID := listFixture(t)
	ctx := context.Background()
	at := time.Date(2026, 11, 15, 9, 0, 0, 654321000, time.UTC)
	for _, version := range []struct {
		offset time.Duration
		kind   string
	}{{0, "named"}, {0, "named"}, {time.Millisecond, "milestone"}, {2 * time.Millisecond, "restore_point"}, {3 * time.Millisecond, "named"}} {
		if _, err := db.Pool.Exec(ctx, `INSERT INTO versions(document_id,name,version_type,created_by,snapshot_key,created_at)VALUES($1,'v',$2,$3,'snapshot',$4)`, docID, version.kind, user.UserID, at.Add(version.offset)); err != nil {
			t.Fatal(err)
		}
	}
	order := orderedIDs(t, db, `SELECT id FROM versions WHERE document_id=$1 ORDER BY created_at DESC, id DESC`, docID)
	list := NewVersionsHandler(db, nil, audit.NewAuditLogger(db.Pool)).ListVersions()

	first := readPage(t, list, user, docID, "limit=2")
	if !reflect.DeepEqual(pageIDs(first), order[:2]) || first.Data[1].VersionType != "restore_point" {
		t.Fatalf("first page %+v, want %v", first.Data, order[:2])
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO versions(document_id,name,created_by,snapshot_key)VALUES($1,'newer',$2,'snapshot')`, docID, user.UserID); err != nil {
		t.Fatal(err)
	}
	second := readPage(t, list, user, docID, "limit=2&cursor="+url.QueryEscape(first.NextCursor))
	if !reflect.DeepEqual(pageIDs(second), order[2:4]) || !second.HasMore {
		t.Fatalf("second page %v, want %v", pageIDs(second), order[2:4])
	}
	last := readPage(t, list, user, docID, "limit=2&cursor="+url.QueryEscape(second.NextCursor))
	if !reflect.DeepEqual(pageIDs(last), order[4:]) || last.HasMore {
		t.Fatalf("last page %v, want %v", pageIDs(last), order[4:])
	}

	w := httptest.NewRecorder()
	list(w, apiRequest("GET", "/?cursor=bm90IGEgY3Vyc29y", "", user, map[string]string{"docId": docID}))
	if w.Code != 400 {
		t.Fatalf("malformed cursor: %d %s", w.Code, w.Body)
	}
}
