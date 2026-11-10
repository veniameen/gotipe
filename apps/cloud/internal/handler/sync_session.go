package handler

import (
	"context"
	"errors"
	"time"

	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
)

// SyncSessionAuthorization rechecks the live credential and current editor role.
// It is used for each inbound/outbound data frame and for idle session checks.
func SyncSessionAuthorization(db storage.Database, blocklist auth.TokenBlocklist) func(context.Context, *auth.UserContext, string) error {
	return func(ctx context.Context, user *auth.UserContext, documentID string) error {
		denied := errors.New("collaboration access is no longer authorized")
		if user == nil || !user.HasScope("documents:write") || !user.AllowsDocument(documentID) || (!user.ExpiresAt.IsZero() && !time.Now().Before(user.ExpiresAt)) {
			return denied
		}
		switch {
		case user.APIKeyHash != "":
			var valid bool
			if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM api_keys WHERE key_hash=$1 AND user_id=$2
    AND (expires_at IS NULL OR expires_at>now()) AND (scopes @> ARRAY['documents:write']::text[] OR scopes @> ARRAY['admin']::text[]))`, user.APIKeyHash, user.UserID).Scan(&valid); err != nil {
				return err
			}
			if !valid {
				return denied
			}
		case user.TokenID != "":
			revoked, err := blocklist.BlocklistCheck(ctx, user.TokenID)
			if err != nil {
				return err
			}
			if revoked {
				return denied
			}
		default:
			return denied
		}
		var allowed bool
		err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM documents d LEFT JOIN document_permissions p
   ON p.document_id=d.id AND p.user_id=$2 WHERE d.id=$1 AND (d.owner_id=$2 OR p.role IN('editor','admin')))`, documentID, user.UserID).Scan(&allowed)
		if err != nil {
			return err
		}
		if !allowed {
			return denied
		}
		return nil
	}
}
