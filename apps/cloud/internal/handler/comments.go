package handler

import (
	"encoding/json"
	"math"
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
	From       *int            `json:"from,omitempty"`
	To         *int            `json:"to,omitempty"`
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
		if !requireDocumentAccess(w, r, h.db.Pool, docID, "commenter") {
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

		if req.AnchorType == "" {
			req.AnchorType = "document"
			if req.BlockID != "" {
				req.AnchorType = "block"
			}
		}
		if req.AnchorType != "document" && req.AnchorType != "block" && req.AnchorType != "inline" {
			apierror.ErrValidation.WithMessage("invalid anchor_type").Write(w)
			return
		}
		if req.AnchorType != "document" && req.BlockID == "" {
			apierror.ErrValidation.WithMessage("block_id is required for this anchor").Write(w)
			return
		}
		// The anchor columns are INTEGER: a larger offset would fail in PostgreSQL.
		if req.AnchorType == "inline" && (req.From == nil || req.To == nil || *req.From < 0 || *req.To < *req.From || *req.To > math.MaxInt32) {
			apierror.ErrValidation.WithMessage("valid from and to are required for inline anchors").Write(w)
			return
		}
		if req.AnchorType != "inline" {
			req.From = nil
			req.To = nil
		}

		commentID := uuid.New().String()
		now := time.Now()

		_, err := h.db.Pool.Exec(r.Context(),
			`INSERT INTO comments (id, document_id, author_id, content, anchor_type, block_id, metadata, anchor_from, anchor_to, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
			commentID, docID, user.UserID, req.Content, req.AnchorType, req.BlockID, req.Metadata, req.From, req.To, now,
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
			From:       req.From, To: req.To,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}
}

// ListComments handles GET /v1/documents/{docId}/comments: oldest first, one page
// at a time (see list_page.go).
func (h *CommentsHandler) ListComments() http.HandlerFunc {
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

		query := `SELECT c.id, c.document_id, c.author_id, COALESCE(u.name, ''), c.content, c.anchor_type, COALESCE(c.block_id, ''),
				  c.parent_id, c.resolved_at, c.resolved_by, c.metadata, c.anchor_from, c.anchor_to, c.created_at, c.updated_at
				  FROM comments c LEFT JOIN users u ON c.author_id = u.id
				  WHERE c.document_id = $1`
		args := []any{docID}
		if r.URL.Query().Get("include_resolved") != "true" {
			query += ` AND c.resolved_at IS NULL`
		}
		if cursor != nil {
			query += ` AND (c.created_at, c.id) > ($2::timestamptz, $3::uuid)`
			args = append(args, cursor.createdAt, cursor.id)
		}
		args = append(args, limit+1)
		query += ` ORDER BY c.created_at ASC, c.id ASC LIMIT $` + strconv.Itoa(len(args))

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
				&c.Metadata, &c.From, &c.To, &c.CreatedAt, &c.UpdatedAt); err != nil {
				apierror.ErrInternal.Write(w)
				return
			}
			comments = append(comments, c)
		}

		if rows.Err() != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		apierror.WriteJSON(w, http.StatusOK, newListPage(comments, limit, func(c CommentResponse) (time.Time, string) {
			return c.CreatedAt, c.ID
		}))
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

		parentID, valid := pathUUID(w, r, "commentId")
		if !valid {
			return
		}
		docID := chi.URLParam(r, "docId")
		if !requireDocumentAccess(w, r, h.db.Pool, docID, "commenter") {
			return
		}

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
			`SELECT anchor_type, COALESCE(block_id, '') FROM comments WHERE id = $1 AND document_id = $2`,
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

		commentID, valid := pathUUID(w, r, "commentId")
		if !valid {
			return
		}
		docID := chi.URLParam(r, "docId")
		if !requireDocumentAccess(w, r, h.db.Pool, docID, "commenter") {
			return
		}

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

		commentID, valid := pathUUID(w, r, "commentId")
		if !valid {
			return
		}
		docID := chi.URLParam(r, "docId")
		if !requireDocumentAccess(w, r, h.db.Pool, docID, "viewer") {
			return
		}

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
