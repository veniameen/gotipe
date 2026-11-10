package middleware

import (
	"github.com/gotipe/cloud/internal/apierror"
	"net/http"
)

// BodyLimitMiddleware also bounds chunked/unknown-length requests through the
// reader, before JSON decoding or idempotency buffering can allocate the body.
func BodyLimitMiddleware(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.ContentLength > limit {
				(&apierror.APIError{Code: "PAYLOAD_TOO_LARGE", Message: "Request body exceeds configured limit", Status: 413}).Write(w)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}
