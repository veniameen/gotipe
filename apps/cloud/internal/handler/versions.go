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
	"github.com/gotipe/cloud/internal/document"
	"github.com/gotipe/cloud/internal/storage"
)

type VersionsHandler struct {
	db       *storage.PostgresStore
	r2       storage.ObjectStore
	audit    *audit.AuditLogger
	contents document.ContentReader
	replaced BaselineReplacement
}

// SetBaselineReplacement installs the collaboration notice sent after a restore;
// call it before serving.
func (h *VersionsHandler) SetBaselineReplacement(notify BaselineReplacement) {
	h.replaced = notify
}

func NewVersionsHandler(db *storage.PostgresStore, r2 storage.ObjectStore, auditLogger *audit.AuditLogger, readers ...document.ContentReader) *VersionsHandler {
	var contents document.ContentReader = document.ObjectReader{Store: r2}
	if len(readers) > 0 {
		contents = readers[0]
	}
	return &VersionsHandler{db: db, r2: r2, audit: auditLogger, contents: contents}
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
		if !requireDocumentAccess(w, r, h.db.Pool, docID, "editor") {
			return
		}

		var req CreateVersionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		if req.Name == "" {
			apierror.ErrValidation.WithMessage("name is required").Write(w)
			return
		}

		if req.VersionType == "" {
			req.VersionType = "named"
		}
		if req.VersionType != "named" && req.VersionType != "milestone" {
			apierror.ErrValidation.WithMessage("version_type must be named or milestone").Write(w)
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

		content, err := h.contents.Load(r.Context(), docID, r2Key)
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
			_ = h.r2.Delete(r.Context(), snapshotKey)
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

// ListVersions handles GET /v1/documents/{docId}/versions: newest first, one page
// at a time (see list_page.go).
func (h *VersionsHandler) ListVersions() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		docID, ok := documentAccess(w, r, h.db.Pool, chi.URLParam(r, "docId"), "viewer")
		if !ok {
			return
		}
		limit, cursor, err := pageQuery(r)
		if err != nil {
			apierror.ErrValidation.WithMessage(err.Error()).Write(w)
			return
		}

		// Restore points are stored without a description.
		query := `SELECT id, document_id, name, COALESCE(description, ''), version_type, created_by, size_bytes, created_at
			 FROM versions WHERE document_id = $1`
		args := []any{docID}
		if cursor != nil {
			query += ` AND (created_at, id) < ($2::timestamptz, $3::uuid)`
			args = append(args, cursor.createdAt, cursor.id)
		}
		args = append(args, limit+1)
		query += ` ORDER BY created_at DESC, id DESC LIMIT $` + strconv.Itoa(len(args))

		rows, err := h.db.Pool.Query(r.Context(), query, args...)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		defer rows.Close()

		var versions []VersionResponse
		for rows.Next() {
			var v VersionResponse
			if err := rows.Scan(&v.ID, &v.DocumentID, &v.Name, &v.Description, &v.VersionType, &v.CreatedBy, &v.SizeBytes, &v.CreatedAt); err != nil {
				apierror.ErrInternal.Write(w)
				return
			}
			versions = append(versions, v)
		}

		if rows.Err() != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		apierror.WriteJSON(w, http.StatusOK, newListPage(versions, limit, func(v VersionResponse) (time.Time, string) {
			return v.CreatedAt, v.ID
		}))
	}
}
