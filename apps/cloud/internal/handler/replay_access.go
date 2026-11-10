package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/middleware"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
)

// ReplayAccess rechecks current read authorization before disclosing a cached
// successful mutation result. Idempotency must not resurrect revoked access.
func ReplayAccess(db storage.Database) middleware.ReplayAuthorizer {
	return func(w http.ResponseWriter, r *http.Request, requestBody, responseBody []byte) bool {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) < 2 {
			return true
		}
		var documentID, organizationID string
		switch parts[1] {
		case "documents":
			if len(parts) >= 3 {
				documentID = parts[2]
			} else {
				var result struct {
					ID string `json:"id"`
				}
				if json.Unmarshal(responseBody, &result) != nil || result.ID == "" {
					apierror.ErrServiceDown.Write(w)
					return false
				}
				documentID = result.ID
			}
		case "exports", "ai":
			var request struct {
				DocumentID string `json:"document_id"`
			}
			if json.Unmarshal(requestBody, &request) != nil {
				apierror.ErrInvalidJSON.Write(w)
				return false
			}
			documentID = request.DocumentID
		case "organizations":
			if len(parts) >= 3 {
				organizationID = parts[2]
			} else {
				var result struct {
					ID string `json:"id"`
				}
				if json.Unmarshal(responseBody, &result) != nil || result.ID == "" {
					apierror.ErrServiceDown.Write(w)
					return false
				}
				organizationID = result.ID
			}
		}
		if documentID != "" {
			return requireDocumentAccess(w, r, db, documentID, "viewer")
		}
		if organizationID != "" {
			user := auth.UserFromContext(r.Context())
			if user == nil {
				apierror.ErrUnauthorized.Write(w)
				return false
			}
			var exists bool
			err := db.QueryRow(r.Context(), `SELECT true FROM org_members WHERE org_id=$1 AND user_id=$2`, organizationID, user.UserID).Scan(&exists)
			if errors.Is(err, pgx.ErrNoRows) {
				apierror.ErrNotFound.Write(w)
				return false
			}
			if err != nil {
				apierror.ErrInternal.Write(w)
				return false
			}
			return exists
		}
		return true
	}
}
