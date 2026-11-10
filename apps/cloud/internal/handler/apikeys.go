package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	internalAuth "github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
)

type APIKeysHandler struct {
	db    *storage.PostgresStore
	audit *audit.AuditLogger
	env   string
}

func NewAPIKeysHandler(db *storage.PostgresStore, auditLogger *audit.AuditLogger, env string) *APIKeysHandler {
	return &APIKeysHandler{db: db, audit: auditLogger, env: env}
}

type CreateAPIKeyRequest struct {
	Name      string   `json:"name"`
	Scopes    []string `json:"scopes"`
	ExpiresAt *string  `json:"expires_at,omitempty"`
}

type APIKeyResponse struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Prefix    string   `json:"prefix"`
	Key       string   `json:"key,omitempty"` // only on create
	Scopes    []string `json:"scopes"`
	LastUsed  *string  `json:"last_used_at,omitempty"`
	ExpiresAt *string  `json:"expires_at,omitempty"`
	CreatedAt string   `json:"created_at"`
}

// CreateAPIKey handles POST /v1/api-keys
func (h *APIKeysHandler) CreateAPIKey() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := internalAuth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		var req CreateAPIKeyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		if req.Name == "" {
			apierror.ErrValidation.WithMessage("name is required").Write(w)
			return
		}

		validScopes := map[string]bool{"documents:read": true, "documents:write": true, "ai:use": true, "export:use": true, "account:manage": true}
		for _, scope := range req.Scopes {
			if !validScopes[scope] || !user.HasScope(scope) {
				apierror.ErrForbidden.WithMessage("Cannot grant an unavailable scope").Write(w)
				return
			}
		}
		rawKey, prefix := internalAuth.GenerateKey(h.env)
		keyHash := internalAuth.HashKey(rawKey)
		keyID := uuid.New().String()

		var expiresAt *time.Time
		if req.ExpiresAt != nil {
			t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
			if err != nil {
				apierror.ErrValidation.WithMessage("invalid expires_at format").Write(w)
				return
			}
			expiresAt = &t
		}

		_, err := h.db.Pool.Exec(r.Context(),
			`INSERT INTO api_keys (id, user_id, name, key_hash, prefix, scopes, expires_at, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
			keyID, user.UserID, req.Name, keyHash, prefix, req.Scopes, expiresAt,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionAPIKeyCreate, "api_key", keyID, map[string]string{"name": req.Name})

		apierror.WriteJSON(w, http.StatusCreated, APIKeyResponse{
			ID:        keyID,
			Name:      req.Name,
			Prefix:    prefix,
			Key:       rawKey,
			Scopes:    req.Scopes,
			CreatedAt: time.Now().Format(time.RFC3339),
		})
	}
}

// ListAPIKeys handles GET /v1/api-keys
func (h *APIKeysHandler) ListAPIKeys() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := internalAuth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		rows, err := h.db.Pool.Query(r.Context(),
			`SELECT id, name, prefix, scopes, last_used_at, expires_at, created_at
			 FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
			user.UserID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		defer rows.Close()

		var keys []APIKeyResponse
		for rows.Next() {
			var k APIKeyResponse
			var lastUsed, expiresAt, createdAt *time.Time
			if err := rows.Scan(&k.ID, &k.Name, &k.Prefix, &k.Scopes, &lastUsed, &expiresAt, &createdAt); err != nil {
				apierror.ErrInternal.Write(w)
				return
			}
			if lastUsed != nil {
				s := lastUsed.Format(time.RFC3339)
				k.LastUsed = &s
			}
			if expiresAt != nil {
				s := expiresAt.Format(time.RFC3339)
				k.ExpiresAt = &s
			}
			if createdAt != nil {
				k.CreatedAt = createdAt.Format(time.RFC3339)
			}
			keys = append(keys, k)
		}

		apierror.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": keys})
	}
}

// DeleteAPIKey handles DELETE /v1/api-keys/{id}
func (h *APIKeysHandler) DeleteAPIKey() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := internalAuth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		keyID := chi.URLParam(r, "id")
		result, err := h.db.Pool.Exec(r.Context(),
			`DELETE FROM api_keys WHERE id = $1 AND user_id = $2`,
			keyID, user.UserID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		if result.RowsAffected() == 0 {
			apierror.ErrNotFound.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionAPIKeyDelete, "api_key", keyID, nil)

		w.WriteHeader(http.StatusNoContent)
	}
}
