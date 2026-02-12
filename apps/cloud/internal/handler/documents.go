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
	"github.com/gotipe/cloud/internal/billing"
	"github.com/gotipe/cloud/internal/storage"
)

type DocumentsHandler struct {
	db    *storage.PostgresStore
	r2    *storage.R2Store
	audit *audit.AuditLogger
}

func NewDocumentsHandler(db *storage.PostgresStore, r2 *storage.R2Store, auditLogger *audit.AuditLogger) *DocumentsHandler {
	return &DocumentsHandler{db: db, r2: r2, audit: auditLogger}
}

type CreateDocumentRequest struct {
	ID      string          `json:"id,omitempty"`
	Title   string          `json:"title"`
	Content json.RawMessage `json:"content"`
}

type DocumentResponse struct {
	ID            string          `json:"id"`
	Title         string          `json:"title"`
	Version       int64           `json:"version"`
	SizeBytes     int64           `json:"size_bytes"`
	Content       json.RawMessage `json:"content,omitempty"`
	Collaborators json.RawMessage `json:"collaborators,omitempty"`
	SyncURL       string          `json:"sync_url,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

type ListDocumentsResponse struct {
	Data   []DocumentResponse `json:"data"`
	Total  int64              `json:"total"`
	Limit  int                `json:"limit"`
	Offset int                `json:"offset"`
}

// CreateDocument handles POST /v1/documents
func (h *DocumentsHandler) CreateDocument() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		var req CreateDocumentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		if req.Title == "" {
			apierror.ErrValidation.WithMessage("title is required").Write(w)
			return
		}

		// Check plan quota
		var docCount int64
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM documents WHERE owner_id = $1`,
			user.UserID,
		).Scan(&docCount)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		if !billing.CheckDocumentQuota(user.Plan, docCount) {
			apierror.ErrQuotaExceeded.WithMessage("Document limit reached for your plan").Write(w)
			return
		}

		docID := req.ID
		if docID == "" {
			docID = uuid.New().String()
		}

		contentBytes := req.Content
		if contentBytes == nil {
			contentBytes = json.RawMessage(`{"blocks":[]}`)
		}

		sizeBytes := int64(len(contentBytes))

		// Upload content to R2
		r2Key := "documents/" + docID + "/content.json"
		if err := h.r2.Put(r.Context(), r2Key, contentBytes); err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		// Insert into DB
		now := time.Now()
		_, err = h.db.Pool.Exec(r.Context(),
			`INSERT INTO documents (id, title, owner_id, version, size_bytes, r2_key, created_at, updated_at)
			 VALUES ($1, $2, $3, 1, $4, $5, $6, $6)`,
			docID, req.Title, user.UserID, sizeBytes, r2Key, now,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		// Log usage
		_, _ = h.db.Pool.Exec(r.Context(),
			`INSERT INTO usage_logs (user_id, action, resource_type, resource_id, created_at)
			 VALUES ($1, 'document.create', 'document', $2, now())`,
			user.UserID, docID,
		)

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionDocumentCreate, "document", docID, map[string]string{"title": req.Title})

		apierror.WriteJSON(w, http.StatusCreated, DocumentResponse{
			ID:        docID,
			Title:     req.Title,
			Version:   1,
			SizeBytes: sizeBytes,
			Content:   contentBytes,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}
}

// GetDocument handles GET /v1/documents/{id}
func (h *DocumentsHandler) GetDocument() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "id")

		var doc DocumentResponse
		var r2Key string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT id, title, version, size_bytes, r2_key, created_at, updated_at
			 FROM documents WHERE id = $1 AND (owner_id = $2 OR id IN (
				SELECT document_id FROM document_permissions WHERE user_id = $2
			 ))`,
			docID, user.UserID,
		).Scan(&doc.ID, &doc.Title, &doc.Version, &doc.SizeBytes, &r2Key, &doc.CreatedAt, &doc.UpdatedAt)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}

		// Fetch content from R2
		content, err := h.r2.Get(r.Context(), r2Key)
		if err == nil {
			doc.Content = json.RawMessage(content)
		}

		apierror.WriteJSON(w, http.StatusOK, doc)
	}
}

// ListDocuments handles GET /v1/documents
func (h *DocumentsHandler) ListDocuments() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 100 {
			limit = 20
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		if offset < 0 {
			offset = 0
		}

		var total int64
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM documents WHERE owner_id = $1`,
			user.UserID,
		).Scan(&total)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		rows, err := h.db.Pool.Query(r.Context(),
			`SELECT id, title, version, size_bytes, created_at, updated_at
			 FROM documents WHERE owner_id = $1
			 ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
			user.UserID, limit, offset,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		defer rows.Close()

		var docs []DocumentResponse
		for rows.Next() {
			var d DocumentResponse
			if err := rows.Scan(&d.ID, &d.Title, &d.Version, &d.SizeBytes, &d.CreatedAt, &d.UpdatedAt); err != nil {
				continue
			}
			docs = append(docs, d)
		}

		if docs == nil {
			docs = []DocumentResponse{}
		}

		apierror.WriteJSON(w, http.StatusOK, ListDocumentsResponse{
			Data:   docs,
			Total:  total,
			Limit:  limit,
			Offset: offset,
		})
	}
}

// UpdateDocument handles PATCH /v1/documents/{id}
func (h *DocumentsHandler) UpdateDocument() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "id")

		var req struct {
			Title   *string         `json:"title,omitempty"`
			Content json.RawMessage `json:"content,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		// Verify ownership
		var ownerID, r2Key string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT owner_id, r2_key FROM documents WHERE id = $1`,
			docID,
		).Scan(&ownerID, &r2Key)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}
		if ownerID != user.UserID {
			apierror.ErrForbidden.Write(w)
			return
		}

		if req.Content != nil {
			if err := h.r2.Put(r.Context(), r2Key, req.Content); err != nil {
				apierror.ErrInternal.Write(w)
				return
			}
		}

		// Build update query
		if req.Title != nil {
			_, err = h.db.Pool.Exec(r.Context(),
				`UPDATE documents SET title = $1, version = version + 1, size_bytes = $2, updated_at = now()
				 WHERE id = $3`,
				*req.Title, len(req.Content), docID,
			)
		} else if req.Content != nil {
			_, err = h.db.Pool.Exec(r.Context(),
				`UPDATE documents SET version = version + 1, size_bytes = $1, updated_at = now()
				 WHERE id = $2`,
				len(req.Content), docID,
			)
		}

		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionDocumentUpdate, "document", docID, nil)

		// Return updated document
		var doc DocumentResponse
		_ = h.db.Pool.QueryRow(r.Context(),
			`SELECT id, title, version, size_bytes, created_at, updated_at FROM documents WHERE id = $1`,
			docID,
		).Scan(&doc.ID, &doc.Title, &doc.Version, &doc.SizeBytes, &doc.CreatedAt, &doc.UpdatedAt)

		apierror.WriteJSON(w, http.StatusOK, doc)
	}
}

// DeleteDocument handles DELETE /v1/documents/{id}
func (h *DocumentsHandler) DeleteDocument() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "id")

		// Verify ownership
		var ownerID, r2Key string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT owner_id, r2_key FROM documents WHERE id = $1`,
			docID,
		).Scan(&ownerID, &r2Key)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}
		if ownerID != user.UserID {
			apierror.ErrForbidden.Write(w)
			return
		}

		// Delete from R2
		_ = h.r2.Delete(r.Context(), r2Key)

		// Delete from DB (cascades to comments, versions, permissions)
		_, err = h.db.Pool.Exec(r.Context(),
			`DELETE FROM documents WHERE id = $1`,
			docID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionDocumentDelete, "document", docID, nil)

		w.WriteHeader(http.StatusNoContent)
	}
}
