package auth

import (
	"github.com/golang-jwt/jwt/v5"
	"time"
)

// Claims represents JWT token claims
type Claims struct {
	jwt.RegisteredClaims
	UserID      string   `json:"user_id"`
	Plan        string   `json:"plan"`
	Scopes      []string `json:"scopes"`
	DocumentIDs []string `json:"document_ids,omitempty"`
	OrgID       string   `json:"org_id,omitempty"`
}

// UserContext is injected into request context after auth
type UserContext struct {
	UserID      string
	Plan        string
	Scopes      []string
	OrgID       string
	TokenID     string
	APIKeyHash  string
	ExpiresAt   time.Time
	DocumentIDs []string
}

func (u *UserContext) HasScope(scope string) bool {
	for _, s := range u.Scopes {
		if s == scope || s == "admin" {
			return true
		}
	}
	return false
}

// AllowsDocument honors document-limited JWTs before looking up permissions.
func (u *UserContext) AllowsDocument(id string) bool {
	if len(u.DocumentIDs) == 0 {
		return true
	}
	for _, allowed := range u.DocumentIDs {
		if allowed == id {
			return true
		}
	}
	return false
}
