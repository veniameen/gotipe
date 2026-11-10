//go:build integration

package handler

import (
	"context"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/testdb"
)

type sessionBlocklist struct{ revoked bool }

func (s *sessionBlocklist) BlocklistCheck(context.Context, string) (bool, error) {
	return s.revoked, nil
}

func TestSyncSessionRejectsRevokedJWTKeyAndDocumentPermission(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var ownerID, userID, docID string
	for _, record := range []struct {
		email string
		id    *string
	}{{"sync-owner@test.invalid", &ownerID}, {"sync-user@test.invalid", &userID}} {
		if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES($1)RETURNING id`, record.email).Scan(record.id); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'baseline')RETURNING id`, ownerID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO document_permissions(document_id,user_id,role,granted_by)VALUES($1,$2,'editor',$3)`, docID, userID, ownerID); err != nil {
		t.Fatal(err)
	}
	blocklist := &sessionBlocklist{}
	check := SyncSessionAuthorization(db.Pool, blocklist)
	user := &auth.UserContext{UserID: userID, Scopes: []string{"documents:write"}, TokenID: "jwt", ExpiresAt: time.Now().Add(time.Hour)}
	if err := check(ctx, user, docID); err != nil {
		t.Fatal(err)
	}
	blocklist.revoked = true
	if err := check(ctx, user, docID); err == nil {
		t.Fatal("revoked JWT remains authorized")
	}
	blocklist.revoked = false
	if _, err := db.Pool.Exec(ctx, `UPDATE document_permissions SET role='viewer' WHERE document_id=$1 AND user_id=$2`, docID, userID); err != nil {
		t.Fatal(err)
	}
	if err := check(ctx, user, docID); err == nil {
		t.Fatal("downgraded role remains authorized")
	}
	user.UserID = ownerID
	user.TokenID = ""
	user.APIKeyHash = "hash"
	if _, err := db.Pool.Exec(ctx, `INSERT INTO api_keys(user_id,name,key_hash,prefix,scopes)VALUES($1,'socket','hash','gt_test',ARRAY['documents:write'])`, ownerID); err != nil {
		t.Fatal(err)
	}
	if err := check(ctx, user, docID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `DELETE FROM api_keys WHERE key_hash='hash'`); err != nil {
		t.Fatal(err)
	}
	if err := check(ctx, user, docID); err == nil {
		t.Fatal("deleted API key remains authorized")
	}
}
