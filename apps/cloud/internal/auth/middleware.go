package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/storage"
)

type contextKey string

const userContextKey contextKey = "user"

func UserFromContext(ctx context.Context) *UserContext {
	u, _ := ctx.Value(userContextKey).(*UserContext)
	return u
}

func withUser(ctx context.Context, u *UserContext) context.Context {
	return context.WithValue(ctx, userContextKey, u)
}

// AuthMiddleware validates Bearer token (API key or JWT)
func AuthMiddleware(jwtSvc *JWTService, apiKeySvc *APIKeyService, valkeyStore *storage.ValkeyStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if token == "" || token == r.Header.Get("Authorization") {
				apierror.ErrUnauthorized.Write(w)
				return
			}

			// API Key path: starts with "gt_"
			if strings.HasPrefix(token, "gt_") {
				user, err := apiKeySvc.ValidateKey(r.Context(), token)
				if err != nil {
					apierror.ErrInvalidAPIKey.Write(w)
					return
				}
				ctx := withUser(r.Context(), user)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// JWT path
			claims, err := jwtSvc.Validate(token)
			if err != nil {
				apierror.ErrInvalidToken.Write(w)
				return
			}

			// Check JWT blocklist
			if claims.ID != "" {
				blocked, _ := valkeyStore.BlocklistCheck(r.Context(), claims.ID)
				if blocked {
					apierror.ErrInvalidToken.WithMessage("Token has been revoked").Write(w)
					return
				}
			}

			user := &UserContext{
				UserID: claims.UserID,
				Plan:   claims.Plan,
				Scopes: claims.Scopes,
				OrgID:  claims.OrgID,
			}
			ctx := withUser(r.Context(), user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireScope returns middleware that checks for specific scope
func RequireScope(scope string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if user == nil || !user.HasScope(scope) {
				apierror.ErrForbidden.Write(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
