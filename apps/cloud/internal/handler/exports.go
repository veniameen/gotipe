package handler

import (
	"encoding/json"
	"errors"
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
	r2    storage.ObjectStore
	audit *audit.AuditLogger
}

func NewExportsHandler(db *storage.PostgresStore, r2 storage.ObjectStore, auditLogger *audit.AuditLogger) *ExportsHandler {
	return &ExportsHandler{db: db, r2: r2, audit: auditLogger}
}

type CreateExportRequest struct {
	DocumentID string `json:"document_id"`
	Format     string `json:"format"` // "html", "markdown", "pdf", "docx", "json", "plaintext"
}

type ExportResponse struct {
	ID          string     `json:"id"`
	DocumentID  string     `json:"document_id"`
	Format      string     `json:"format"`
	Status      string     `json:"status"` // "pending", "processing", "completed", "failed"
	URL         string     `json:"url,omitempty"`
	Error       string     `json:"error,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
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
		if !requireDocumentAccess(w, r, h.db.Pool, req.DocumentID, "viewer") {
			return
		}

		jobID := uuid.New().String()
		now := time.Now()

		err := storage.WithUserLock(r.Context(), h.db.Pool, user.UserID, func(tx storage.Database) error {
			var count int64
			if err := tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM usage_logs WHERE user_id=$1 AND action='export.request' AND created_at >= date_trunc('month',now())`, user.UserID).Scan(&count); err != nil {
				return err
			}
			if !billing.CheckExportQuota(user.Plan, count) {
				return billing.ErrQuotaExceeded
			}
			_, insertErr := tx.Exec(r.Context(),
				`INSERT INTO export_jobs (id, user_id, document_id, format, status, created_at)
			 VALUES ($1, $2, $3, $4, 'pending', $5)`,
				jobID, user.UserID, req.DocumentID, req.Format, now,
			)
			if insertErr != nil {
				return insertErr
			}
			_, insertErr = tx.Exec(r.Context(), `INSERT INTO usage_logs(user_id,action,resource_type,resource_id,created_at) VALUES($1,'export.request','export',$2,$3)`, user.UserID, jobID, now)
			return insertErr
		})
		if errors.Is(err, billing.ErrQuotaExceeded) {
			apierror.ErrQuotaExceeded.WithMessage("Export limit reached for your plan").Write(w)
			return
		}
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
		if !requireDocumentAccess(w, r, h.db.Pool, resp.DocumentID, "viewer") {
			return
		}

		// Generate presigned URL if completed
		if resp.Status == "completed" && r2Key != nil {
			url, err := h.r2.PresignedURL(r.Context(), *r2Key, 1*time.Hour)
			if err != nil {
				apierror.ErrServiceDown.Write(w)
				return
			}
			resp.URL = url
		}

		apierror.WriteJSON(w, http.StatusOK, resp)
	}
}
