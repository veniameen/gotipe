package handler

import (
	"net/http"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
)

type UsersHandler struct {
	db *storage.PostgresStore
}

func NewUsersHandler(db *storage.PostgresStore) *UsersHandler {
	return &UsersHandler{db: db}
}

type UserResponse struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Plan      string `json:"plan"`
	AvatarURL string `json:"avatar_url,omitempty"`
	CreatedAt string `json:"created_at"`
}

// GetMe handles GET /v1/users/me
func (h *UsersHandler) GetMe() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		var resp UserResponse
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT id, email, name, plan, avatar_url, created_at FROM users WHERE id = $1`,
			user.UserID,
		).Scan(&resp.ID, &resp.Email, &resp.Name, &resp.Plan, &resp.AvatarURL, &resp.CreatedAt)
		if err != nil {
			apierror.ErrNotFound.Write(w)
			return
		}

		apierror.WriteJSON(w, http.StatusOK, resp)
	}
}
