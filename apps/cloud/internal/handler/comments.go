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

type CommentsHandler struct {
	db    *storage.PostgresStore
	audit *audit.AuditLogger
}

func NewCommentsHandler(db *storage.PostgresStore, auditLogger *audit.AuditLogger) *CommentsHandler {
	return &CommentsHandler{db: db, audit: auditLogger}
}

type CreateCommentRequest struct {
	Content    string          `json:"content"`
	AnchorType string          `json:"anchor_type"` // "inline", "block", "document"
	BlockID    string          `json:"block_id,omitempty"`
	From       *int            `json:"from,omitempty"`
	To         *int            `json:"to,omitempty"`
	Metadata   json.RawMessage `json:"metadata,omitempty"`
}

type CommentResponse struct {
	ID         string          `json:"id"`
	DocumentID string          `json:"document_id"`
	AuthorID   string          `json:"author_id"`
	AuthorName string          `json:"author_name,omitempty"`
	Content    string          `json:"content"`
	AnchorType string          `json:"anchor_type"`
	BlockID    string          `json:"block_id,omitempty"`
	ParentID   *string         `json:"parent_id,omitempty"`
	ResolvedAt *time.Time      `json:"resolved_at,omitempty"`
	ResolvedBy *string         `json:"resolved_by,omitempty"`
	Metadata   json.RawMessage `json:"metadata,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

// CreateComment handles POST /v1/documents/{docId}/comments
func (h *CommentsHandler) CreateComment() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")

		// Verify document access
		var exists bool
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM documents WHERE id = $1 AND (owner_id = $2 OR id IN (
				SELECT document_id FROM document_permissions WHERE user_id = $2 AND role IN ('commenter', 'editor', 'admin')
			)))`,
			docID, user.UserID,
		).Scan(&exists)
		if err != nil || !exists {
			apierror.ErrNotFound.Write(w)
			return
		}

		var req CreateCommentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		if req.Content == "" {
			apierror.ErrValidation.WithMessage("content is required").Write(w)
			return
		}

		commentID := uuid.New().String()
		now := time.Now()

		_, err = h.db.Pool.Exec(r.Context(),
			`INSERT INTO comments (id, document_id, author_id, content, anchor_type, block_id, metadata, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
			commentID, docID, user.UserID, req.Content, req.AnchorType, req.BlockID, req.Metadata, now,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionCommentAdd, "comment", commentID, map[string]string{"document_id": docID})

		apierror.WriteJSON(w, http.StatusCreated, CommentResponse{
			ID:         commentID,
			DocumentID: docID,
			AuthorID:   user.UserID,
			Content:    req.Content,
			AnchorType: req.AnchorType,
			BlockID:    req.BlockID,
			Metadata:   req.Metadata,
			CreatedAt:  now,
			UpdatedAt:  now,
		})
	}
}

// ListComments handles GET /v1/documents/{docId}/comments
func (h *CommentsHandler) ListComments() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")
		includeResolved := r.URL.Query().Get("include_resolved") == "true"
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 100 {
			limit = 50
		}

		query := `SELECT c.id, c.document_id, c.author_id, u.name, c.content, c.anchor_type, c.block_id,
				  c.parent_id, c.resolved_at, c.resolved_by, c.metadata, c.created_at, c.updated_at
				  FROM comments c LEFT JOIN users u ON c.author_id = u.id
				  WHERE c.document_id = $1`
		args := []interface{}{docID}

		if !includeResolved {
			query += ` AND c.resolved_at IS NULL`
		}
		query += ` ORDER BY c.created_at ASC LIMIT $2`
		args = append(args, limit)

		rows, err := h.db.Pool.Query(r.Context(), query, args...)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		defer rows.Close()

		var comments []CommentResponse
		for rows.Next() {
			var c CommentResponse
			if err := rows.Scan(&c.ID, &c.DocumentID, &c.AuthorID, &c.AuthorName, &c.Content,
				&c.AnchorType, &c.BlockID, &c.ParentID, &c.ResolvedAt, &c.ResolvedBy,
				&c.Metadata, &c.CreatedAt, &c.UpdatedAt); err != nil {
				continue
			}
			comments = append(comments, c)
		}

		if comments == nil {
			comments = []CommentResponse{}
		}

		apierror.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": comments})
	}
}

// ReplyToComment handles POST /v1/documents/{docId}/comments/{commentId}/replies
func (h *CommentsHandler) ReplyToComment() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")
		parentID := chi.URLParam(r, "commentId")

		var req struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		if req.Content == "" {
			apierror.ErrValidation.WithMessage("content is required").Write(w)
			return
		}

		// Verify parent comment exists
		var anchorType, blockID string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT anchor_type, block_id FROM comments WHERE id = $1 AND document_id = $2`,
			parentID, docID,
		).Scan(&anchorType, &blockID)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}

		replyID := uuid.New().String()
		now := time.Now()

		_, err = h.db.Pool.Exec(r.Context(),
			`INSERT INTO comments (id, document_id, author_id, content, anchor_type, block_id, parent_id, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
			replyID, docID, user.UserID, req.Content, anchorType, blockID, parentID, now,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		apierror.WriteJSON(w, http.StatusCreated, CommentResponse{
			ID:         replyID,
			DocumentID: docID,
			AuthorID:   user.UserID,
			Content:    req.Content,
			AnchorType: anchorType,
			BlockID:    blockID,
			ParentID:   &parentID,
			CreatedAt:  now,
			UpdatedAt:  now,
		})
	}
}

// ResolveComment handles POST /v1/documents/{docId}/comments/{commentId}/resolve
func (h *CommentsHandler) ResolveComment() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")
		commentID := chi.URLParam(r, "commentId")

		result, err := h.db.Pool.Exec(r.Context(),
			`UPDATE comments SET resolved_at = now(), resolved_by = $1, updated_at = now()
			 WHERE id = $2 AND document_id = $3 AND resolved_at IS NULL`,
			user.UserID, commentID, docID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		if result.RowsAffected() == 0 {
			apierror.ErrNotFound.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionCommentResolve, "comment", commentID, nil)

		apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "resolved"})
	}
}

// DeleteComment handles DELETE /v1/documents/{docId}/comments/{commentId}
func (h *CommentsHandler) DeleteComment() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		docID := chi.URLParam(r, "docId")
		commentID := chi.URLParam(r, "commentId")

		// Only author or document owner can delete
		result, err := h.db.Pool.Exec(r.Context(),
			`DELETE FROM comments WHERE id = $1 AND document_id = $2
			 AND (author_id = $3 OR $3 IN (SELECT owner_id FROM documents WHERE id = $2))`,
			commentID, docID, user.UserID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		if result.RowsAffected() == 0 {
			apierror.ErrNotFound.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionCommentDelete, "comment", commentID, nil)

		w.WriteHeader(http.StatusNoContent)
	}
}
