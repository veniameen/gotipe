package auth

import (
	"encoding/base64"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gotipe/cloud/internal/apierror"
)

// WebSocketCredentials adapts the browser's subprotocol transport to the usual
// bearer validation. Install only on the sync endpoint, before AuthMiddleware.
// The credential protocol is removed before upgrading; only gotipe.v1 remains.
func WebSocketCredentials(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var token string
		var protocols []string
		for _, header := range r.Header.Values("Sec-WebSocket-Protocol") {
			for _, entry := range strings.Split(header, ",") {
				protocol := strings.TrimSpace(entry)
				if !strings.HasPrefix(protocol, "gotipe.auth.") {
					if protocol != "" {
						protocols = append(protocols, protocol)
					}
					continue
				}
				encoded := strings.TrimPrefix(protocol, "gotipe.auth.")
				decoded, err := base64.RawURLEncoding.DecodeString(encoded)
				if err != nil || len(decoded) == 0 || len(decoded) > 8192 || !utf8.Valid(decoded) || strings.ContainsAny(string(decoded), "\r\n\x00") || token != "" {
					apierror.ErrInvalidToken.Write(w)
					return
				}
				token = string(decoded)
			}
		}
		request := r.Clone(r.Context())
		request.Header.Del("Sec-WebSocket-Protocol")
		if len(protocols) > 0 {
			request.Header.Set("Sec-WebSocket-Protocol", strings.Join(protocols, ", "))
		}
		if token != "" {
			if request.Header.Get("Authorization") != "" {
				apierror.ErrInvalidToken.Write(w)
				return
			}
			request.Header.Set("Authorization", "Bearer "+token)
		}
		next.ServeHTTP(w, request)
	})
}
