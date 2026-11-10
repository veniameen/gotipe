//go:build integration

package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	cloudAI "github.com/gotipe/cloud/internal/ai"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/gotipe/cloud/internal/testdb"
)

type concurrentObjects struct {
	storage.ObjectStore
	mu   sync.Mutex
	keys map[string][]byte
}

func (s *concurrentObjects) Put(_ context.Context, key string, value []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.keys[key] = append([]byte(nil), value...)
	return nil
}
func (s *concurrentObjects) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.keys, key)
	return nil
}

func runQuotaRequests(t *testing.T, handler http.HandlerFunc, user *auth.UserContext, body string) {
	t.Helper()
	const concurrency = 8
	start := make(chan struct{})
	results := make(chan int, concurrency)
	for i := 0; i < concurrency; i++ {
		go func() {
			<-start
			response := httptest.NewRecorder()
			handler(response, requestAs("POST", "/", body, user))
			results <- response.Code
		}()
	}
	close(start)
	statuses := map[int]int{}
	for i := 0; i < concurrency; i++ {
		select {
		case code := <-results:
			statuses[code]++
		case <-time.After(10 * time.Second):
			t.Fatal("concurrent quota requests timed out")
		}
	}
	if statuses[201]+statuses[202] != 1 || statuses[402] != concurrency-1 {
		t.Fatalf("quota race: %v", statuses)
	}
}

func TestDocumentQuotaSerializesCountAndInsertion(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('document-quota@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO documents(owner_id,r2_key)SELECT $1,'existing/'||g FROM generate_series(1,99)g`, userID); err != nil {
		t.Fatal(err)
	}
	objects := &concurrentObjects{keys: map[string][]byte{}}
	h := NewDocumentsHandler(db, objects, audit.NewAuditLogger(db.Pool))
	runQuotaRequests(t, h.CreateDocument(), &auth.UserContext{UserID: userID, Plan: "free"}, `{"title":"Concurrent","content":{"version":1,"blocks":[]}}`)
	var count int
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM documents WHERE owner_id=$1`, userID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 100 || len(objects.keys) != 1 {
		t.Fatalf("documents=%d staged objects=%d", count, len(objects.keys))
	}
}

func TestExportQuotaSurvivesArtifactDeletionAndConcurrentRequests(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID, documentID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('export-quota@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'baseline')RETURNING id`, userID).Scan(&documentID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO usage_logs(user_id,action,resource_type,resource_id)SELECT $1,'export.request','export','expired-'||g FROM generate_series(1,9)g`, userID); err != nil {
		t.Fatal(err)
	}
	h := NewExportsHandler(db, &concurrentObjects{}, audit.NewAuditLogger(db.Pool))
	runQuotaRequests(t, h.CreateExport(), &auth.UserContext{UserID: userID, Plan: "free"}, fmt.Sprintf(`{"document_id":%q,"format":"pdf"}`, documentID))
	var count int
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM usage_logs WHERE user_id=$1 AND action='export.request'`, userID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 10 {
		t.Fatalf("export quota count %d", count)
	}
}

func TestAIQuotaReservesBeforeProviderCallAndReleasesFailure(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('ai-quota@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO usage_logs(user_id,action,resource_type)SELECT $1,'ai.request','ai' FROM generate_series(1,99)`, userID); err != nil {
		t.Fatal(err)
	}
	entered := make(chan struct{}, 1)
	release := make(chan struct{})
	var releaseOnce sync.Once
	defer releaseOnce.Do(func() { close(release) })
	var calls atomic.Int32
	provider := fakeAI(func(ctx context.Context, _ cloudAI.Request, _ func(string) error) (cloudAI.Result, error) {
		calls.Add(1)
		entered <- struct{}{}
		select {
		case <-release:
			return cloudAI.Result{Content: "done"}, nil
		case <-ctx.Done():
			return cloudAI.Result{}, ctx.Err()
		}
	})
	h := NewAIHandler(db, provider, "openai", "model", 100)
	results := make(chan int, 8)
	for i := 0; i < 8; i++ {
		go func() {
			response := httptest.NewRecorder()
			h.Complete()(response, requestAs("POST", "/", `{"command":"complete","prompt":"test"}`, &auth.UserContext{UserID: userID, Plan: "free"}))
			results <- response.Code
		}()
	}
	select {
	case <-entered:
	case <-time.After(10 * time.Second):
		t.Fatal("provider never started")
	}
	for i := 0; i < 7; i++ {
		select {
		case code := <-results:
			if code != 402 {
				t.Fatalf("in-flight reservation failed: %d", code)
			}
		case <-time.After(10 * time.Second):
			t.Fatal("quota rejection timed out")
		}
	}
	releaseOnce.Do(func() { close(release) })
	if code := <-results; code != 200 {
		t.Fatalf("provider response %d", code)
	}
	var completed, pending int
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FILTER(WHERE action='ai.request'),COUNT(*) FILTER(WHERE action='ai.pending') FROM usage_logs WHERE user_id=$1`, userID).Scan(&completed, &pending); err != nil {
		t.Fatal(err)
	}
	if completed != 100 || pending != 0 || calls.Load() != 1 {
		t.Fatalf("completed=%d pending=%d calls=%d", completed, pending, calls.Load())
	}
}

func TestReplayAuthorizationRechecksDocumentAndOrganizationMembership(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var ownerID, userID, docID, orgID string
	for _, record := range []struct {
		email string
		id    *string
	}{{"replay-owner@test.invalid", &ownerID}, {"replay-user@test.invalid", &userID}} {
		if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES($1)RETURNING id`, record.email).Scan(record.id); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'baseline')RETURNING id`, ownerID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO organizations(name,slug,owner_id)VALUES('Replay','replay',$1)RETURNING id`, ownerID).Scan(&orgID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO document_permissions(document_id,user_id,role,granted_by)VALUES($1,$2,'viewer',$3)`, docID, userID, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO org_members(org_id,user_id,role)VALUES($1,$2,'member')`, orgID, userID); err != nil {
		t.Fatal(err)
	}
	guard := ReplayAccess(db.Pool)
	for _, target := range []struct {
		path, remove string
		id           string
	}{
		{"/v1/documents/" + docID + "/comments", `DELETE FROM document_permissions WHERE document_id=$1 AND user_id=$2`, docID},
		{"/v1/organizations/" + orgID + "/members", `DELETE FROM org_members WHERE org_id=$1 AND user_id=$2`, orgID},
	} {
		request := requestAs("POST", target.path, `{}`, &auth.UserContext{UserID: userID, Plan: "free"})
		if !guard(httptest.NewRecorder(), request, []byte(`{}`), []byte(`{"result":"private"}`)) {
			t.Fatal("allowed replay denied")
		}
		if _, err := db.Pool.Exec(ctx, target.remove, target.id, userID); err != nil {
			t.Fatal(err)
		}
		response := httptest.NewRecorder()
		if guard(response, request, []byte(`{}`), []byte(`{"result":"private"}`)) || response.Code != 404 {
			t.Fatalf("revoked access replayed: %d", response.Code)
		}
	}
}
