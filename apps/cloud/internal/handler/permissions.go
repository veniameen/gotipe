package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
)

type PermissionsHandler struct {
	db    *storage.PostgresStore
	audit *audit.AuditLogger
}

func NewPermissionsHandler(db *storage.PostgresStore, auditLogger *audit.AuditLogger) *PermissionsHandler {
	return &PermissionsHandler{db: db, audit: auditLogger}
}

type PermissionResponse struct {
	UserID    string    `json:"user_id"`
	UserName  string    `json:"user_name"`
	UserEmail string    `json:"user_email"`
	Role      string    `json:"role"` // "viewer", "commenter", "editor", "admin"
	GrantedAt time.Time `json:"granted_at"`
	GrantedBy string    `json:"granted_by"`
}

// ListPermissions handles GET /v1/documents/{docId}/permissions
func (h *PermissionsHandler) ListPermissions() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")
		if !requireDocumentAccess(w, r, h.db.Pool, docID, "admin") {
			return
		}

		rows, err := h.db.Pool.Query(r.Context(),
			`SELECT p.user_id, u.name, u.email, p.role, p.granted_at, COALESCE(p.granted_by::text,'')
			 FROM document_permissions p JOIN users u ON p.user_id = u.id
			 WHERE p.document_id = $1`,
			docID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		defer rows.Close()

		var perms []PermissionResponse
		for rows.Next() {
			var p PermissionResponse
			if err := rows.Scan(&p.UserID, &p.UserName, &p.UserEmail, &p.Role, &p.GrantedAt, &p.GrantedBy); err != nil {
				apierror.ErrInternal.Write(w)
				return
			}
			perms = append(perms, p)
		}

		if rows.Err() != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		if perms == nil {
			perms = []PermissionResponse{}
		}

		apierror.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": perms})
	}
}

// SetPermission handles PUT /v1/documents/{docId}/permissions
func (h *PermissionsHandler) SetPermission() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")

		if !requireDocumentAccess(w, r, h.db.Pool, docID, "admin") {
			return
		}

		var req struct {
			Email string `json:"email"`
			Role  string `json:"role"` // "viewer", "commenter", "editor", "admin"
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		validRoles := map[string]bool{"viewer": true, "commenter": true, "editor": true, "admin": true}
		if !validRoles[req.Role] {
			apierror.ErrValidation.WithMessage("invalid role").Write(w)
			return
		}

		// Lookup user
		var targetUserID string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT id FROM users WHERE email = $1`, req.Email,
		).Scan(&targetUserID)
		if err != nil {
			apierror.ErrNotFound.WithMessage("User not found").Write(w)
			return
		}

		_, err = h.db.Pool.Exec(r.Context(),
			`INSERT INTO document_permissions (document_id, user_id, role, granted_by, granted_at)
			 VALUES ($1, $2, $3, $4, now())
			 ON CONFLICT (document_id, user_id) DO UPDATE SET role = $3, granted_by = $4, granted_at = now()`,
			docID, targetUserID, req.Role, user.UserID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionPermissionChange, "document", docID,
			map[string]string{"target_user": targetUserID, "role": req.Role})

		apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "granted", "user_id": targetUserID, "role": req.Role})
	}
}

// RevokePermission handles DELETE /v1/documents/{docId}/permissions/{userId}
func (h *PermissionsHandler) RevokePermission() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")
		targetUserID, valid := pathUUID(w, r, "userId")
		if !valid {
			return
		}

		if !requireDocumentAccess(w, r, h.db.Pool, docID, "owner") {
			return
		}

		_, err := h.db.Pool.Exec(r.Context(),
			`DELETE FROM document_permissions WHERE document_id = $1 AND user_id = $2`,
			docID, targetUserID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionPermissionChange, "document", docID,
			map[string]string{"target_user": targetUserID, "action": "revoked"})

		w.WriteHeader(http.StatusNoContent)
	}
}
