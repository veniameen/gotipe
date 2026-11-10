package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5/pgconn"
)

type OrganizationsHandler struct {
	db    *storage.PostgresStore
	audit *audit.AuditLogger
}

func NewOrganizationsHandler(db *storage.PostgresStore, auditLogger *audit.AuditLogger) *OrganizationsHandler {
	return &OrganizationsHandler{db: db, audit: auditLogger}
}

type CreateOrgRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type OrgResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	OwnerID   string    `json:"owner_id"`
	Plan      string    `json:"plan"`
	CreatedAt time.Time `json:"created_at"`
}

type OrgMemberResponse struct {
	UserID   string    `json:"user_id"`
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

// CreateOrganization handles POST /v1/organizations
func (h *OrganizationsHandler) CreateOrganization() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		var req CreateOrgRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" || len(req.Name) > 200 || !validOrgSlug(req.Slug) {
			apierror.ErrValidation.WithMessage("name and a lowercase alphanumeric slug are required").Write(w)
			return
		}

		orgID := uuid.New().String()
		now := time.Now()

		_, err := h.db.Pool.Exec(r.Context(),
			`WITH created AS (INSERT INTO organizations (id,name,slug,owner_id,plan,created_at)
			VALUES($1,$2,$3,$4,$5,$6) RETURNING id,owner_id,created_at)
			INSERT INTO org_members(org_id,user_id,role,joined_at) SELECT id,owner_id,'admin',created_at FROM created`,
			orgID, req.Name, req.Slug, user.UserID, user.Plan, now,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				apierror.ErrConflict.WithMessage("Organization slug already exists").Write(w)
			} else {
				apierror.ErrInternal.Write(w)
			}
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionOrgCreate, "organization", orgID, map[string]string{"name": req.Name})

		apierror.WriteJSON(w, http.StatusCreated, OrgResponse{
			ID:        orgID,
			Name:      req.Name,
			Slug:      req.Slug,
			OwnerID:   user.UserID,
			Plan:      user.Plan,
			CreatedAt: now,
		})
	}
}

// GetOrganization handles GET /v1/organizations/{id}
func (h *OrganizationsHandler) GetOrganization() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		orgID := chi.URLParam(r, "id")

		var org OrgResponse
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT o.id, o.name, o.slug, o.owner_id, o.plan, o.created_at
			 FROM organizations o
			 JOIN org_members m ON o.id = m.org_id
			 WHERE o.id = $1 AND m.user_id = $2`,
			orgID, user.UserID,
		).Scan(&org.ID, &org.Name, &org.Slug, &org.OwnerID, &org.Plan, &org.CreatedAt)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}

		apierror.WriteJSON(w, http.StatusOK, org)
	}
}

// ListMembers handles GET /v1/organizations/{id}/members
func (h *OrganizationsHandler) ListMembers() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		orgID := chi.URLParam(r, "id")
		var member bool
		if err := h.db.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2)`, orgID, user.UserID).Scan(&member); err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		if !member {
			apierror.ErrNotFound.Write(w)
			return
		}

		rows, err := h.db.Pool.Query(r.Context(),
			`SELECT m.user_id, u.name, u.email, m.role, m.joined_at
			 FROM org_members m JOIN users u ON m.user_id = u.id
			 WHERE m.org_id = $1 ORDER BY m.joined_at`,
			orgID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		defer rows.Close()

		var members []OrgMemberResponse
		for rows.Next() {
			var m OrgMemberResponse
			if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Role, &m.JoinedAt); err != nil {
				apierror.ErrInternal.Write(w)
				return
			}
			members = append(members, m)
		}

		if rows.Err() != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		if members == nil {
			members = []OrgMemberResponse{}
		}

		apierror.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": members})
	}
}

// AddMember handles POST /v1/organizations/{id}/members
func (h *OrganizationsHandler) AddMember() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		orgID := chi.URLParam(r, "id")

		// Verify caller is admin
		var callerRole string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
			orgID, user.UserID,
		).Scan(&callerRole)
		if err != nil || callerRole != "admin" {
			apierror.ErrForbidden.Write(w)
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
		if req.Role != "viewer" && req.Role != "commenter" && req.Role != "editor" && req.Role != "admin" {
			apierror.ErrValidation.WithMessage("Invalid organization role").Write(w)
			return
		}

		// Look up user by email
		var newUserID string
		err = h.db.Pool.QueryRow(r.Context(),
			`SELECT id FROM users WHERE email = $1`, req.Email,
		).Scan(&newUserID)
		if err != nil {
			apierror.ErrNotFound.WithMessage("User not found").Write(w)
			return
		}

		tag, err := h.db.Pool.Exec(r.Context(),
			`INSERT INTO org_members (org_id, user_id, role, joined_at)
			 SELECT $1,$2,$3,now() FROM organizations WHERE id=$1 AND (owner_id<>$2 OR $3='admin')
			 ON CONFLICT (org_id, user_id) DO UPDATE SET role = $3`,
			orgID, newUserID, req.Role,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		if tag.RowsAffected() != 1 {
			apierror.ErrForbidden.WithMessage("Cannot demote organization owner").Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionOrgMemberAdd, "organization", orgID, map[string]string{"member_id": newUserID, "role": req.Role})

		apierror.WriteJSON(w, http.StatusCreated, map[string]string{"status": "added", "user_id": newUserID, "role": req.Role})
	}
}

// RemoveMember handles DELETE /v1/organizations/{id}/members/{userId}
func (h *OrganizationsHandler) RemoveMember() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		orgID := chi.URLParam(r, "id")
		memberID := chi.URLParam(r, "userId")

		// Verify caller is admin
		var callerRole string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
			orgID, user.UserID,
		).Scan(&callerRole)
		if err != nil || callerRole != "admin" {
			apierror.ErrForbidden.Write(w)
			return
		}

		// Cannot remove org owner
		var ownerID string
		err = h.db.Pool.QueryRow(r.Context(),
			`SELECT owner_id FROM organizations WHERE id = $1`, orgID,
		).Scan(&ownerID)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		if memberID == ownerID {
			apierror.ErrForbidden.WithMessage("Cannot remove organization owner").Write(w)
			return
		}

		_, err = h.db.Pool.Exec(r.Context(),
			`DELETE FROM org_members WHERE org_id = $1 AND user_id = $2`,
			orgID, memberID,
		)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionOrgMemberRemove, "organization", orgID, map[string]string{"member_id": memberID})

		w.WriteHeader(http.StatusNoContent)
	}
}

func validOrgSlug(slug string) bool {
	if len(slug) == 0 || len(slug) > 100 || slug[0] == '-' || slug[len(slug)-1] == '-' {
		return false
	}
	for _, c := range slug {
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '-' {
			return false
		}
	}
	return true
}
