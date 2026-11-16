package handler

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type testRow func(...any) error

func (r testRow) Scan(dest ...any) error { return r(dest...) }

type testPool struct {
	storage.ConnectionPool
	row   func(string, ...any) pgx.Row
	query func(string, ...any) (pgx.Rows, error)
	exec  func(string, ...any) (pgconn.CommandTag, error)
}

func (p *testPool) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	return p.row(sql, args...)
}
func (p *testPool) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	return p.query(sql, args...)
}
func (p *testPool) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return p.exec(sql, args...)
}

type emptyRows struct {
	pgx.Rows
	err error
}

func (*emptyRows) Next() bool   { return false }
func (*emptyRows) Close()       {}
func (r *emptyRows) Err() error { return r.err }

// testDocumentID is the {docId}/{id} route parameter of requestAs. Document IDs
// are validated as UUIDs before any database access.
const testDocumentID = "6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c44"

// The other route IDs of requestAs: like document IDs, they are UUIDs.
const (
	testCommentID = "0e7d6c5b-4a39-4281-9f0e-1d2c3b4a5968"
	testVersionID = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d"
	testUserID    = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"
)

func requestAs(method, path, body string, user *auth.UserContext) *http.Request {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if user != nil {
		r = r.WithContext(auth.WithUser(r.Context(), user))
	}
	ctx := chi.NewRouteContext()
	ctx.URLParams.Add("docId", testDocumentID)
	ctx.URLParams.Add("id", testDocumentID)
	ctx.URLParams.Add("commentId", testCommentID)
	ctx.URLParams.Add("versionId", testVersionID)
	ctx.URLParams.Add("userId", testUserID)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, ctx))
}

func testJWT(t *testing.T) *auth.JWTService {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	privateDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	svc, err := auth.NewJWTService(string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: privateDER})), string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER})), "test", "test", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return svc
}

// Handler unit doubles model transaction boundaries; real lock/snapshot behavior
// is verified independently against PostgreSQL by quota integration tests.
type testTransaction struct {
	pgx.Tx
	pool *testPool
}

func (p *testPool) BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error) {
	return &testTransaction{pool: p}, nil
}
func (t *testTransaction) Query(ctx context.Context, q string, args ...any) (pgx.Rows, error) {
	return t.pool.Query(ctx, q, args...)
}
func (t *testTransaction) QueryRow(ctx context.Context, q string, args ...any) pgx.Row {
	return t.pool.QueryRow(ctx, q, args...)
}
func (t *testTransaction) Exec(ctx context.Context, q string, args ...any) (pgconn.CommandTag, error) {
	if strings.Contains(q, "pg_advisory_xact_lock") {
		return pgconn.NewCommandTag("SELECT 1"), nil
	}
	return t.pool.Exec(ctx, q, args...)
}
func (t *testTransaction) Commit(context.Context) error   { return nil }
func (t *testTransaction) Rollback(context.Context) error { return nil }
