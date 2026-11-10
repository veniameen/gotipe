package handler

import (
	"errors"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"net/http"
)

// requireDocumentAccess checks permissions before reading any child resource or
// writing document content. Inaccessible IDs are indistinguishable from missing IDs.
func requireDocumentAccess(w http.ResponseWriter, r *http.Request, db storage.Database, docID, minimumRole string) bool {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		apierror.ErrUnauthorized.Write(w)
		return false
	}
	if !user.AllowsDocument(docID) {
		apierror.ErrNotFound.Write(w)
		return false
	}
	var role string
	err := db.QueryRow(r.Context(), `SELECT CASE WHEN d.owner_id = $2 THEN 'owner' ELSE COALESCE(p.role, '') END
 FROM documents d LEFT JOIN document_permissions p ON p.document_id = d.id AND p.user_id = $2
 WHERE d.id = $1`, docID, user.UserID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		apierror.ErrNotFound.Write(w)
		return false
	}
	if err != nil {
		apierror.ErrInternal.Write(w)
		return false
	}
	ranks := map[string]int{"viewer": 1, "commenter": 2, "editor": 3, "admin": 4, "owner": 5}
	required, known := ranks[minimumRole]
	if !known || ranks[role] < required {
		apierror.ErrNotFound.Write(w)
		return false
	}
	return true
}

// SyncDocumentAccess checks editor access before the WebSocket can join a room.
// The current sync protocol carries writes, so viewer-only users cannot join it.
func SyncDocumentAccess(db *storage.PostgresStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !requireDocumentAccess(w, r, db.Pool, r.URL.Query().Get("document_id"), "editor") {
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
