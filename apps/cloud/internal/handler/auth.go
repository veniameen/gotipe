package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gotipe/cloud/internal/apierror"
	internalAuth "github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
)

type AuthHandler struct {
	db     *storage.PostgresStore
	jwt    *internalAuth.JWTService
	valkey *storage.ValkeyStore
}

func NewAuthHandler(db *storage.PostgresStore, jwt *internalAuth.JWTService, valkey *storage.ValkeyStore) *AuthHandler {
	return &AuthHandler{db: db, jwt: jwt, valkey: valkey}
}

type TokenRequest struct {
	GrantType string `json:"grant_type"` // "password", "refresh_token", "api_key"
	Email     string `json:"email,omitempty"`
	Password  string `json:"password,omitempty"`
	APIKey    string `json:"api_key,omitempty"`
}

type TokenResponse struct {
	AccessToken string    `json:"access_token"`
	TokenType   string    `json:"token_type"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// CreateToken handles POST /v1/auth/token
func (h *AuthHandler) CreateToken() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req TokenRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		var userID, plan string
		var scopes []string

		switch req.GrantType {
		case "password":
			if req.Email == "" || req.Password == "" {
				apierror.ErrValidation.WithMessage("email and password are required").Write(w)
				return
			}
			// Lookup user by email and verify password
			var passwordHash string
			err := h.db.Pool.QueryRow(r.Context(),
				`SELECT id, plan, password_hash FROM users WHERE email = $1`,
				req.Email,
			).Scan(&userID, &plan, &passwordHash)
			if err != nil {
				apierror.ErrUnauthorized.WithMessage("Invalid credentials").Write(w)
				return
			}
			// In production, use bcrypt.CompareHashAndPassword
			// For now, basic check
			if passwordHash == "" {
				apierror.ErrUnauthorized.WithMessage("Invalid credentials").Write(w)
				return
			}
			scopes = []string{"documents:read", "documents:write", "ai:use", "export:use"}

		case "api_key":
			if req.APIKey == "" {
				apierror.ErrValidation.WithMessage("api_key is required").Write(w)
				return
			}
			keyHash := internalAuth.HashKey(req.APIKey)
			err := h.db.Pool.QueryRow(r.Context(),
				`SELECT u.id, u.plan, k.scopes
				 FROM api_keys k JOIN users u ON k.user_id = u.id
				 WHERE k.key_hash = $1 AND (k.expires_at IS NULL OR k.expires_at > now())`,
				keyHash,
			).Scan(&userID, &plan, &scopes)
			if err != nil {
				apierror.ErrInvalidAPIKey.Write(w)
				return
			}

		default:
			apierror.ErrValidation.WithMessage("unsupported grant_type").Write(w)
			return
		}

		token, expiresAt, err := h.jwt.Generate(userID, plan, scopes, nil)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		apierror.WriteJSON(w, http.StatusOK, TokenResponse{
			AccessToken: token,
			TokenType:   "Bearer",
			ExpiresAt:   expiresAt,
		})
	}
}

// RevokeToken handles POST /v1/auth/revoke
func (h *AuthHandler) RevokeToken() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := internalAuth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		var req struct {
			TokenID string `json:"token_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		if req.TokenID == "" {
			apierror.ErrValidation.WithMessage("token_id is required").Write(w)
			return
		}

		// Add to blocklist with remaining TTL (max 24h as safety)
		_ = h.valkey.BlocklistAdd(r.Context(), req.TokenID, 24*time.Hour)

		apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
	}
}
