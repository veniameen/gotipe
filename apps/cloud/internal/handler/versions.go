package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
)

type VersionsHandler struct {
	db    *storage.PostgresStore
	r2    *storage.R2Store
	audit *audit.AuditLogger
}

func NewVersionsHandler(db *storage.PostgresStore, r2 *storage.R2Store, auditLogger *audit.AuditLogger) *VersionsHandler {
	return &VersionsHandler{db: db, r2: r2, audit: auditLogger}
}

type CreateVersionRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	VersionType string `json:"version_type"` // "named", "milestone"
}

type VersionResponse struct {
	ID          string    `json:"id"`
	DocumentID  string    `json:"document_id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	VersionType string    `json:"version_type"`
	CreatedBy   string    `json:"created_by"`
	SizeBytes   int64     `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
}

// CreateVersion handles POST /v1/documents/{docId}/versions
func (h *VersionsHandler) CreateVersion() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")

		var req CreateVersionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		if req.Name == "" {
			apierror.ErrValidation.WithMessage("name is required").Write(w)
			return
		}

		// Get current document content from R2
		var r2Key string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT r2_key FROM documents WHERE id = $1 AND (owner_id = $2 OR id IN (
				SELECT document_id FROM document_permissions WHERE user_id = $2 AND role IN ('editor', 'admin')
			))`,
			docID, user.UserID,
		).Scan(&r2Key)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}

		content, err := h.r2.Get(r.Context(), r2Key)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		versionID := uuid.New().String()
		snapshotKey := "versions/" + docID + "/" + versionID + ".json"

		// Save snapshot to R2
		if err := h.r2.Put(r.Context(), snapshotKey, content); err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		now := time.Now()
		_, err = h.db.Pool.Exec(r.Context(),
			`INSERT INTO versions (id, document_id, name, description, version_type, created_by, snapshot_key, size_bytes, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			versionID, docID, req.Name, req.Description, req.VersionType, user.UserID, snapshotKey, len(content), now,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionVersionCreate, "version", versionID, map[string]string{"document_id": docID, "name": req.Name})

		apierror.WriteJSON(w, http.StatusCreated, VersionResponse{
			ID:          versionID,
			DocumentID:  docID,
			Name:        req.Name,
			Description: req.Description,
			VersionType: req.VersionType,
			CreatedBy:   user.UserID,
			SizeBytes:   int64(len(content)),
			CreatedAt:   now,
		})
	}
}

// ListVersions handles GET /v1/documents/{docId}/versions
func (h *VersionsHandler) ListVersions() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 100 {
			limit = 50
		}

		rows, err := h.db.Pool.Query(r.Context(),
			`SELECT id, document_id, name, description, version_type, created_by, size_bytes, created_at
			 FROM versions WHERE document_id = $1 ORDER BY created_at DESC LIMIT $2`,
			docID, limit,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		defer rows.Close()

		var versions []VersionResponse
		for rows.Next() {
			var v VersionResponse
			if err := rows.Scan(&v.ID, &v.DocumentID, &v.Name, &v.Description, &v.VersionType, &v.CreatedBy, &v.SizeBytes, &v.CreatedAt); err != nil {
				continue
			}
			versions = append(versions, v)
		}

		if versions == nil {
			versions = []VersionResponse{}
		}

		apierror.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": versions})
	}
}

// RestoreVersion handles POST /v1/documents/{docId}/versions/{versionId}/restore
func (h *VersionsHandler) RestoreVersion() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")
		versionID := chi.URLParam(r, "versionId")

		// Get snapshot key
		var snapshotKey string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT snapshot_key FROM versions WHERE id = $1 AND document_id = $2`,
			versionID, docID,
		).Scan(&snapshotKey)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}

		// Get snapshot content from R2
		content, err := h.r2.Get(r.Context(), snapshotKey)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		// Get current document R2 key
		var r2Key string
		err = h.db.Pool.QueryRow(r.Context(),
			`SELECT r2_key FROM documents WHERE id = $1`,
			docID,
		).Scan(&r2Key)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}

		// Overwrite current content with snapshot
		if err := h.r2.Put(r.Context(), r2Key, content); err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		// Update document version
		_, err = h.db.Pool.Exec(r.Context(),
			`UPDATE documents SET version = version + 1, size_bytes = $1, updated_at = now() WHERE id = $2`,
			len(content), docID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		// Create restore point version
		restoreID := uuid.New().String()
		restoreKey := "versions/" + docID + "/" + restoreID + ".json"
		_ = h.r2.Put(r.Context(), restoreKey, content)
		_, _ = h.db.Pool.Exec(r.Context(),
			`INSERT INTO versions (id, document_id, name, version_type, created_by, snapshot_key, size_bytes, created_at)
			 VALUES ($1, $2, $3, 'restore_point', $4, $5, $6, now())`,
			restoreID, docID, "Restored from: "+versionID, user.UserID, restoreKey, len(content),
		)

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionVersionRestore, "version", versionID, map[string]string{"document_id": docID})

		apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "restored", "version_id": restoreID})
	}
}
