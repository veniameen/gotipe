package handler

import (
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/billing"
	"github.com/gotipe/cloud/internal/document"
	"github.com/gotipe/cloud/internal/storage"
)

type DocumentsHandler struct {
	db               *storage.PostgresStore
	r2               storage.ObjectStore
	audit            *audit.AuditLogger
	contents         document.ContentReader
	maxDocumentBytes int64
}

func NewDocumentsHandler(db *storage.PostgresStore, r2 storage.ObjectStore, auditLogger *audit.AuditLogger, readers ...document.ContentReader) *DocumentsHandler {
	var contents document.ContentReader = document.ObjectReader{Store: r2}
	if len(readers) > 0 {
		contents = readers[0]
	}
	return &DocumentsHandler{db: db, r2: r2, audit: auditLogger, contents: contents, maxDocumentBytes: 10 << 20}
}

func (h *DocumentsHandler) SetDocumentLimit(limit int64) error {
	if limit < 1 || limit > storage.MaxObjectBytes {
		return errors.New("document byte limit must be between 1 and 64 MiB")
	}
	h.maxDocumentBytes = limit
	return nil
}

type CreateDocumentRequest struct {
	ID      string          `json:"id,omitempty"`
	Title   string          `json:"title"`
	Content json.RawMessage `json:"content"`
}

type DocumentResponse struct {
	ID                 string                       `json:"id"`
	Title              string                       `json:"title"`
	Version            int64                        `json:"version"`
	SizeBytes          int64                        `json:"size_bytes"`
	Content            json.RawMessage              `json:"content,omitempty"`
	Collaborators      json.RawMessage              `json:"collaborators,omitempty"`
	CollaborationState *document.CollaborationState `json:"collaboration_state,omitempty"`
	SyncURL            string                       `json:"sync_url,omitempty"`
	CreatedAt          time.Time                    `json:"created_at"`
	UpdatedAt          time.Time                    `json:"updated_at"`
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

		docID := req.ID
		if docID == "" {
			docID = uuid.New().String()
		}

		if _, err := uuid.Parse(docID); err != nil {
			apierror.ErrValidation.WithMessage("id must be a UUID").Write(w)
			return
		}

		if !user.AllowsDocument(docID) {
			apierror.ErrForbidden.Write(w)
			return
		}
		contentBytes := req.Content
		if contentBytes == nil {
			contentBytes = json.RawMessage(`{"blocks":[]}`)
		}

		sizeBytes := int64(len(contentBytes))
		if sizeBytes > h.maxDocumentBytes {
			(&apierror.APIError{Code: "PAYLOAD_TOO_LARGE", Message: "Document exceeds configured byte limit", Status: 413}).Write(w)
			return
		}

		// Upload content to R2
		r2Key := "documents/" + docID + "/" + uuid.NewString() + ".json"
		if err := h.r2.Put(r.Context(), r2Key, contentBytes); err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		// Insert into DB
		now := time.Now()
		err := storage.WithUserLock(r.Context(), h.db.Pool, user.UserID, func(tx storage.Database) error {
			var docCount int64
			if err := tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM documents WHERE owner_id=$1`, user.UserID).Scan(&docCount); err != nil {
				return err
			}
			if !billing.CheckDocumentQuota(user.Plan, docCount) {
				return billing.ErrQuotaExceeded
			}
			_, insertErr := tx.Exec(r.Context(),
				`INSERT INTO documents (id, title, owner_id, version, size_bytes, r2_key, created_at, updated_at)
			 VALUES ($1, $2, $3, 1, $4, $5, $6, $6)`,
				docID, req.Title, user.UserID, sizeBytes, r2Key, now,
			)
			return insertErr
		})
		if err != nil {
			_ = h.r2.Delete(r.Context(), r2Key)
			var pgErr *pgconn.PgError
			if errors.Is(err, billing.ErrQuotaExceeded) {
				apierror.ErrQuotaExceeded.WithMessage("Document limit reached for your plan").Write(w)
			} else if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				apierror.ErrConflict.Write(w)
			} else {
				apierror.ErrInternal.Write(w)
			}
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
		if !user.AllowsDocument(docID) {
			apierror.ErrNotFound.Write(w)
			return
		}

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
		snapshot, err := document.LoadSnapshot(r.Context(), h.contents, docID, r2Key)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		doc.Content = json.RawMessage(snapshot.Content)
		doc.SizeBytes = int64(len(snapshot.Content))
		doc.CollaborationState = snapshot.CollaborationState

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
			`SELECT COUNT(*) FROM documents WHERE (owner_id = $1 OR id IN (SELECT document_id FROM document_permissions WHERE user_id = $1)) AND (COALESCE(cardinality($2::uuid[]), 0) = 0 OR id = ANY($2::uuid[]))`,
			user.UserID, user.DocumentIDs,
		).Scan(&total)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		rows, err := h.db.Pool.Query(r.Context(),
			`SELECT id, title, version, size_bytes, created_at, updated_at
			 FROM documents WHERE (owner_id = $1 OR id IN (SELECT document_id FROM document_permissions WHERE user_id = $1)) AND (COALESCE(cardinality($2::uuid[]), 0) = 0 OR id = ANY($2::uuid[]))
			 ORDER BY updated_at DESC LIMIT $3 OFFSET $4`,
			user.UserID, user.DocumentIDs, limit, offset,
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
				apierror.ErrInternal.Write(w)
				return
			}
			docs = append(docs, d)
		}

		if rows.Err() != nil {
			apierror.ErrInternal.Write(w)
			return
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
		if !user.AllowsDocument(docID) {
			apierror.ErrNotFound.Write(w)
			return
		}
		if !requireDocumentAccess(w, r, h.db.Pool, docID, "editor") {
			return
		}

		var req struct {
			Title   *string         `json:"title,omitempty"`
			Content json.RawMessage `json:"content,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		// Read the existing object key; updates write a new immutable object.
		var r2Key string
		err := h.db.Pool.QueryRow(r.Context(), `SELECT r2_key FROM documents WHERE id = $1`, docID).Scan(&r2Key)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		if req.Title != nil && *req.Title == "" {
			apierror.ErrValidation.WithMessage("title must not be empty").Write(w)
			return
		}
		if req.Title == nil && req.Content == nil {
			apierror.ErrValidation.WithMessage("title or content is required").Write(w)
			return
		}
		var sizeBytes *int64
		if req.Content != nil {
			size := int64(len(req.Content))
			if size > h.maxDocumentBytes {
				(&apierror.APIError{Code: "PAYLOAD_TOO_LARGE", Message: "Document exceeds configured byte limit", Status: 413}).Write(w)
				return
			}
			sizeBytes = &size
			r2Key = "documents/" + docID + "/" + uuid.NewString() + ".json"
		}

		if req.Content != nil {
			if err := h.r2.Put(r.Context(), r2Key, req.Content); err != nil {
				apierror.ErrInternal.Write(w)
				return
			}
		}

		_, err = h.db.Pool.Exec(r.Context(), `WITH changed AS (UPDATE documents SET title = COALESCE($1, title),
            version = version + 1, size_bytes = COALESCE($2, size_bytes), r2_key = $3, updated_at = now() WHERE id = $4 RETURNING id),
            removed_updates AS (DELETE FROM document_updates USING changed WHERE document_id = changed.id AND $5),
            removed_snapshots AS (DELETE FROM document_snapshots USING changed WHERE document_id = changed.id AND $5)
            SELECT id FROM changed`,
			req.Title, sizeBytes, r2Key, docID, req.Content != nil)
		if err != nil {
			if req.Content != nil {
				_ = h.r2.Delete(r.Context(), r2Key)
			}
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionDocumentUpdate, "document", docID, nil)

		// Return updated document
		var doc DocumentResponse
		err = h.db.Pool.QueryRow(r.Context(),
			`SELECT id, title, version, size_bytes, created_at, updated_at FROM documents WHERE id = $1`,
			docID,
		).Scan(&doc.ID, &doc.Title, &doc.Version, &doc.SizeBytes, &doc.CreatedAt, &doc.UpdatedAt)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

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
		if !user.AllowsDocument(docID) {
			apierror.ErrNotFound.Write(w)
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

		// Delete from DB (cascades to comments, versions, permissions)
		_, err = h.db.Pool.Exec(r.Context(),
			`DELETE FROM documents WHERE id = $1`,
			docID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		// Delete the object only after the authoritative row was removed. A DB
		// failure must leave the current document content readable.
		_ = h.r2.Delete(r.Context(), r2Key)

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionDocumentDelete, "document", docID, nil)

		w.WriteHeader(http.StatusNoContent)
	}
}
