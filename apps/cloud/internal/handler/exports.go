package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/billing"
	"github.com/gotipe/cloud/internal/storage"
)

type ExportsHandler struct {
	db    *storage.PostgresStore
	r2    *storage.R2Store
	audit *audit.AuditLogger
}

func NewExportsHandler(db *storage.PostgresStore, r2 *storage.R2Store, auditLogger *audit.AuditLogger) *ExportsHandler {
	return &ExportsHandler{db: db, r2: r2, audit: auditLogger}
}

type CreateExportRequest struct {
	DocumentID string `json:"document_id"`
	Format     string `json:"format"` // "html", "markdown", "pdf", "docx", "json", "plaintext"
}

type ExportResponse struct {
	ID         string     `json:"id"`
	DocumentID string     `json:"document_id"`
	Format     string     `json:"format"`
	Status     string     `json:"status"` // "pending", "processing", "completed", "failed"
	URL        string     `json:"url,omitempty"`
	Error      string     `json:"error,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// CreateExport handles POST /v1/exports
func (h *ExportsHandler) CreateExport() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		var req CreateExportRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		validFormats := map[string]bool{"html": true, "markdown": true, "pdf": true, "docx": true, "json": true, "plaintext": true}
		if !validFormats[req.Format] {
			apierror.ErrValidation.WithMessage("invalid export format").Write(w)
			return
		}

		// Check export quota
		var exportCount int64
		h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM export_jobs WHERE user_id = $1
			 AND created_at > date_trunc('month', now())`,
			user.UserID,
		).Scan(&exportCount)

		if !billing.CheckExportQuota(user.Plan, exportCount) {
			apierror.ErrQuotaExceeded.WithMessage("Export limit reached for your plan").Write(w)
			return
		}

		// Verify document access
		var exists bool
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM documents WHERE id = $1 AND (owner_id = $2 OR id IN (
				SELECT document_id FROM document_permissions WHERE user_id = $2
			)))`,
			req.DocumentID, user.UserID,
		).Scan(&exists)
		if err != nil || !exists {
			apierror.ErrNotFound.Write(w)
			return
		}

		jobID := uuid.New().String()
		now := time.Now()

		_, err = h.db.Pool.Exec(r.Context(),
			`INSERT INTO export_jobs (id, user_id, document_id, format, status, created_at)
			 VALUES ($1, $2, $3, $4, 'pending', $5)`,
			jobID, user.UserID, req.DocumentID, req.Format, now,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionExportCreate, "export", jobID,
			map[string]string{"document_id": req.DocumentID, "format": req.Format})

		apierror.WriteJSON(w, http.StatusAccepted, ExportResponse{
			ID:         jobID,
			DocumentID: req.DocumentID,
			Format:     req.Format,
			Status:     "pending",
			CreatedAt:  now,
		})
	}
}

// GetExport handles GET /v1/exports/{id}
func (h *ExportsHandler) GetExport() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		jobID := chi.URLParam(r, "id")

		var resp ExportResponse
		var r2Key *string
		var errorMsg *string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT id, document_id, format, status, r2_key, error_message, created_at, completed_at
			 FROM export_jobs WHERE id = $1 AND user_id = $2`,
			jobID, user.UserID,
		).Scan(&resp.ID, &resp.DocumentID, &resp.Format, &resp.Status, &r2Key, &errorMsg, &resp.CreatedAt, &resp.CompletedAt)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}

		if errorMsg != nil {
			resp.Error = *errorMsg
		}

		// Generate presigned URL if completed
		if resp.Status == "completed" && r2Key != nil {
			url, err := h.r2.PresignedURL(r.Context(), *r2Key, 1*time.Hour)
			if err == nil {
				resp.URL = url
			}
		}

		apierror.WriteJSON(w, http.StatusOK, resp)
	}
}
