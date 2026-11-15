package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
)

// sliceRows yields fixed rows; each value is assigned to the matching Scan target.
type sliceRows struct {
	pgx.Rows
	rows [][]any
	at   int
}

func (r *sliceRows) Next() bool { r.at++; return r.at <= len(r.rows) }
func (r *sliceRows) Scan(dest ...any) error {
	for i, value := range r.rows[r.at-1] {
		reflect.ValueOf(dest[i]).Elem().Set(reflect.ValueOf(value))
	}
	return nil
}
func (*sliceRows) Close()     {}
func (*sliceRows) Err() error { return nil }

type listCall struct {
	sql  string
	args []any
}

// listPool authorizes the caller as owner and answers the list query with rows.
func listPool(calls *[]listCall, rows [][]any) *storage.PostgresStore {
	return &storage.PostgresStore{Pool: &testPool{
		row: func(string, ...any) pgx.Row {
			return testRow(func(dest ...any) error { *dest[0].(*string) = "owner"; return nil })
		},
		query: func(sql string, args ...any) (pgx.Rows, error) {
			*calls = append(*calls, listCall{sql, args})
			return &sliceRows{rows: rows}, nil
		},
	}}
}

func versionRow(id string, createdAt time.Time) []any {
	return []any{id, testDocumentID, "v", "", "named", "user", int64(1), createdAt}
}

type pageBody struct {
	Data       []map[string]any `json:"data"`
	HasMore    bool             `json:"has_more"`
	NextCursor *string          `json:"next_cursor"`
}

func TestVersionPagesEndWithACursorThatTheNextPageStartsAfter(t *testing.T) {
	newest := time.Date(2026, 11, 15, 10, 0, 0, 123456000, time.UTC)
	rows := [][]any{
		versionRow("00000000-0000-4000-8000-000000000003", newest),
		versionRow("00000000-0000-4000-8000-000000000002", newest),
		versionRow("00000000-0000-4000-8000-000000000001", newest.Add(-time.Second)),
	}
	var calls []listCall
	handler := NewVersionsHandler(listPool(&calls, rows), nil, nil).ListVersions()
	user := &auth.UserContext{UserID: "caller"}

	w := httptest.NewRecorder()
	handler(w, requestAs("GET", "/?limit=2", "", user))
	var page pageBody
	if err := json.Unmarshal(w.Body.Bytes(), &page); w.Code != 200 || err != nil {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
	if len(page.Data) != 2 || !page.HasMore || page.NextCursor == nil {
		t.Fatalf("the extra row must only announce the next page: %s", w.Body)
	}
	if !strings.HasSuffix(calls[0].sql, "ORDER BY created_at DESC, id DESC LIMIT $2") || !reflect.DeepEqual(calls[0].args, []any{testDocumentID, 3}) {
		t.Fatalf("first page query: %s %v", calls[0].sql, calls[0].args)
	}

	w = httptest.NewRecorder()
	handler(w, requestAs("GET", "/?limit=2&cursor="+*page.NextCursor, "", user))
	if w.Code != 200 {
		t.Fatalf("next page: %d %s", w.Code, w.Body)
	}
	next := calls[1]
	if !strings.Contains(next.sql, "AND (created_at, id) < ($2::timestamptz, $3::uuid)") || !strings.HasSuffix(next.sql, "LIMIT $4") {
		t.Fatalf("next page query: %s", next.sql)
	}
	if at, ok := next.args[1].(time.Time); !ok || !at.Equal(newest) || next.args[2] != "00000000-0000-4000-8000-000000000002" || next.args[3] != 3 {
		t.Fatalf("the cursor must name the last returned version: %v", next.args)
	}
}

func TestLastPageHasNoCursor(t *testing.T) {
	var calls []listCall
	rows := [][]any{versionRow("00000000-0000-4000-8000-000000000001", time.Now())}
	w := httptest.NewRecorder()
	NewVersionsHandler(listPool(&calls, rows), nil, nil).ListVersions()(w, requestAs("GET", "/?limit=1", "", &auth.UserContext{UserID: "caller"}))
	var page pageBody
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil || len(page.Data) != 1 || page.HasMore || page.NextCursor != nil {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
}

func TestCommentPagesFollowCreationOrderAndResolvedFilter(t *testing.T) {
	for _, tc := range []struct {
		query    string
		resolved bool
	}{{"/?limit=500", false}, {"/?include_resolved=true", true}} {
		var calls []listCall
		w := httptest.NewRecorder()
		NewCommentsHandler(listPool(&calls, nil), nil).ListComments()(w, requestAs("GET", tc.query, "", &auth.UserContext{UserID: "caller"}))
		if w.Code != 200 || len(calls) != 1 {
			t.Fatalf("%s: got %d %s", tc.query, w.Code, w.Body)
		}
		sql, args := calls[0].sql, calls[0].args
		if strings.Contains(sql, "c.resolved_at IS NULL") == tc.resolved || !strings.HasSuffix(sql, "ORDER BY c.created_at ASC, c.id ASC LIMIT $2") {
			t.Fatalf("%s: %s", tc.query, sql)
		}
		if !reflect.DeepEqual(args, []any{testDocumentID, defaultPageLimit + 1}) {
			t.Fatalf("%s: out-of-range limit must fall back to %d: %v", tc.query, defaultPageLimit, args)
		}
	}
}

func TestMalformedCursorsAreRejectedBeforeTheListQuery(t *testing.T) {
	encode := func(text string) string { return base64.RawURLEncoding.EncodeToString([]byte(text)) }
	for _, cursor := range []string{
		"%21%21",
		encode("2026-11-15T10:00:00Z"),
		encode("yesterday 00000000-0000-4000-8000-000000000001"),
		encode("2026-11-15T10:00:00Z version"),
		encode("2026-11-15T10:00:00Z 00000000000040008000000000000001"),
		encode("2026-11-15T10:00:00Z 00000000-0000-4000-8000-000000000001") + "=",
	} {
		var calls []listCall
		db := listPool(&calls, nil)
		for _, handle := range []http.HandlerFunc{NewCommentsHandler(db, nil).ListComments(), NewVersionsHandler(db, nil, nil).ListVersions()} {
			w := httptest.NewRecorder()
			handle(w, requestAs("GET", "/?cursor="+cursor, "", &auth.UserContext{UserID: "caller"}))
			if w.Code != 400 || !strings.Contains(w.Body.String(), `"VALIDATION_ERROR"`) {
				t.Fatalf("%q: got %d %s", cursor, w.Code, w.Body)
			}
		}
		if len(calls) != 0 {
			t.Fatalf("%q reached the list query", cursor)
		}
	}
}

func TestCursorKeepsMicrosecondsAndCanonicalID(t *testing.T) {
	at := time.Date(2026, 1, 2, 3, 4, 5, 678901000, time.FixedZone("UTC+3", 3*3600))
	cursor, err := decodeCursor(encodeCursor(at, "6F1C2B8E-0D1A-4F5E-9A63-2A7D1E0B9C44"))
	if err != nil || !cursor.createdAt.Equal(at) || cursor.id != testDocumentID {
		t.Fatalf("round trip: %+v %v", cursor, err)
	}
}
