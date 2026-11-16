package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/jackc/pgx/v5"
)

type contextKey string

const userContextKey contextKey = "user"

func UserFromContext(ctx context.Context) *UserContext {
	u, _ := ctx.Value(userContextKey).(*UserContext)
	return u
}

// WithUser attaches an authenticated identity to a request context.
func WithUser(ctx context.Context, u *UserContext) context.Context {
	return context.WithValue(ctx, userContextKey, u)
}

type TokenBlocklist interface {
	BlocklistCheck(context.Context, string) (bool, error)
}

// AuthMiddleware validates Bearer token (API key or JWT)
func AuthMiddleware(jwtSvc *JWTService, apiKeySvc *APIKeyService, valkeyStore TokenBlocklist) func(http.Handler) http.Handler {
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
				if errors.Is(err, ErrUnknownAPIKey) {
					apierror.ErrInvalidAPIKey.Write(w)
					return
				}
				if err != nil {
					// The database did not answer: the key may be valid.
					apierror.ErrServiceDown.Write(w)
					return
				}
				ctx := WithUser(r.Context(), user)
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
				blocked, err := valkeyStore.BlocklistCheck(r.Context(), claims.ID)
				if err != nil {
					apierror.ErrServiceDown.Write(w)
					return
				}
				if blocked {
					apierror.ErrInvalidToken.WithMessage("Token has been revoked").Write(w)
					return
				}
			}

			plan, err := apiKeySvc.CurrentPlan(r.Context(), claims.UserID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					apierror.ErrInvalidToken.Write(w)
				} else {
					apierror.ErrServiceDown.Write(w)
				}
				return
			}
			user := &UserContext{
				UserID:      claims.UserID,
				Plan:        plan,
				Scopes:      claims.Scopes,
				OrgID:       claims.OrgID,
				TokenID:     claims.ID,
				ExpiresAt:   claims.ExpiresAt.Time,
				DocumentIDs: claims.DocumentIDs,
			}
			ctx := WithUser(r.Context(), user)
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
