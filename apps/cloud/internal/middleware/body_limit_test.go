package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBodyLimitBoundsKnownAndStreamingBodies(t *testing.T) {
	for _, length := range []int64{20, -1} {
		invoked := false
		handler := BodyLimitMiddleware(10)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			invoked = true
			value, err := io.ReadAll(r.Body)
			if err == nil || len(value) > 10 {
				t.Fatalf("unbounded request %d: %d %v", length, len(value), err)
			}
			w.WriteHeader(413)
		}))
		request := httptest.NewRequest("POST", "/", strings.NewReader(strings.Repeat("x", 20)))
		request.ContentLength = length
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != 413 || (length == 20 && invoked) {
			t.Fatalf("limit not enforced: %d %t", response.Code, invoked)
		}
	}
}
