package handler

import (
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"net/http"
)

// canonicalUUID accepts the hyphenated 36-character UUID form in either case and
// returns it in lower case. Other spellings never name a resource, so callers
// reject them with 400 before PostgreSQL can turn them into a 500.
func canonicalUUID(id string) (string, bool) {
	if len(id) != 36 {
		return "", false
	}
	parsed, err := uuid.Parse(id)
	if err != nil {
		return "", false
	}
	return parsed.String(), true
}

// pathUUID reads a UUID route parameter in canonical form. Any other value answers
// 400 before the database sees it; PostgreSQL would fail on it with a 500.
func pathUUID(w http.ResponseWriter, r *http.Request, name string) (string, bool) {
	id, valid := canonicalUUID(chi.URLParam(r, name))
	if !valid {
		apierror.ErrValidation.WithMessage(name + " must be a UUID").Write(w)
	}
	return id, valid
}

// requireDocumentAccess checks permissions before reading any child resource or
// writing document content. Inaccessible IDs are indistinguishable from missing IDs.
func requireDocumentAccess(w http.ResponseWriter, r *http.Request, db storage.Database, docID, minimumRole string) bool {
	_, ok := documentAccess(w, r, db, docID, minimumRole)
	return ok
}

// documentAccess returns the canonical document ID once the caller holds at least
// minimumRole. A malformed ID answers 400; it cannot exist, so this reveals nothing.
func documentAccess(w http.ResponseWriter, r *http.Request, db storage.Database, docID, minimumRole string) (string, bool) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		apierror.ErrUnauthorized.Write(w)
		return "", false
	}
	id, valid := canonicalUUID(docID)
	if !valid {
		apierror.ErrValidation.WithMessage("document ID must be a UUID").Write(w)
		return "", false
	}
	if !user.AllowsDocument(id) {
		apierror.ErrNotFound.Write(w)
		return "", false
	}
	var role string
	err := db.QueryRow(r.Context(), `SELECT CASE WHEN d.owner_id = $2 THEN 'owner' ELSE COALESCE(p.role, '') END
 FROM documents d LEFT JOIN document_permissions p ON p.document_id = d.id AND p.user_id = $2
 WHERE d.id = $1`, id, user.UserID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		apierror.ErrNotFound.Write(w)
		return "", false
	}
	if err != nil {
		apierror.ErrInternal.Write(w)
		return "", false
	}
	ranks := map[string]int{"viewer": 1, "commenter": 2, "editor": 3, "admin": 4, "owner": 5}
	required, known := ranks[minimumRole]
	if !known || ranks[role] < required {
		apierror.ErrNotFound.Write(w)
		return "", false
	}
	return id, true
}

// SyncDocumentAccess checks editor access before the WebSocket can join a room.
// The current sync protocol carries writes, so viewer-only users cannot join it.
// The sync handler receives the canonical ID: two spellings of one UUID must not
// open two rooms for the same document.
func SyncDocumentAccess(db *storage.PostgresStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := documentAccess(w, r, db.Pool, r.URL.Query().Get("document_id"), "editor")
			if !ok {
				return
			}
			canonical := r.Clone(r.Context())
			query := canonical.URL.Query()
			query.Set("document_id", id)
			canonical.URL.RawQuery = query.Encode()
			next.ServeHTTP(w, canonical)
		})
	}
}
