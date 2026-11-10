package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIScopesRejectWritesAndAccountEscalation(t *testing.T) {
	for _, tc := range []struct {
		method, path, scope string
		status              int
	}{
		{"GET", "/v1/documents/doc", "documents:read", 200},
		{"PATCH", "/v1/documents/doc", "documents:read", 403},
		{"DELETE", "/v1/documents/doc/comments/comment", "documents:read", 403},
		{"POST", "/v1/api-keys", "documents:write", 403},
		{"GET", "/v1/organizations/org/members", "documents:read", 403},
		{"POST", "/v1/exports", "export:use", 200},
		{"POST", "/v1/ai/complete", "documents:write", 403},
		{"POST", "/v1/billing/subscribe", "account:manage", 200},
	} {
		t.Run(tc.method+tc.path+tc.scope, func(t *testing.T) {
			called := false
			handler := RequireAPIScope(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(200) }))
			r := httptest.NewRequest(tc.method, tc.path, nil)
			r = r.WithContext(WithUser(r.Context(), &UserContext{UserID: "user", Scopes: []string{tc.scope}}))
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.status || called != (tc.status == 200) {
				t.Fatalf("got %d called %v", w.Code, called)
			}
		})
	}
}
