package auth

import (
	"github.com/gotipe/cloud/internal/apierror"
	"net/http"
	"strings"
)

// RequireAPIScope applies the same scope policy to every HTTP resource route.
// Resource-level membership checks are still performed by the handlers.
func RequireAPIScope(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}
		scope := ""
		switch {
		case strings.HasPrefix(r.URL.Path, "/v1/documents"):
			scope = "documents:read"
			if r.Method != http.MethodGet {
				scope = "documents:write"
			}
		case strings.HasPrefix(r.URL.Path, "/v1/exports"):
			scope = "export:use"
		case strings.HasPrefix(r.URL.Path, "/v1/ai/"):
			scope = "ai:use"
		case strings.HasPrefix(r.URL.Path, "/v1/api-keys"), strings.HasPrefix(r.URL.Path, "/v1/billing/"), strings.HasPrefix(r.URL.Path, "/v1/organizations"):
			scope = "account:manage"
		}
		if scope != "" && !user.HasScope(scope) {
			apierror.ErrForbidden.Write(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}
