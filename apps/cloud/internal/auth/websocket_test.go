package auth

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWebSocketCredentialsUseHeaderWithoutEchoingCredentialProtocol(t *testing.T) {
	token := "opaque.credential.😀"
	r := httptest.NewRequest("GET", "/sync?doc=doc", nil)
	r.Header.Set("Sec-WebSocket-Protocol", "gotipe.v1, gotipe.auth."+base64.RawURLEncoding.EncodeToString([]byte(token)))
	w := httptest.NewRecorder()
	WebSocketCredentials(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token || r.Header.Get("Sec-WebSocket-Protocol") != "gotipe.v1" {
			t.Fatal("credential transport failed")
		}
		w.WriteHeader(204)
	})).ServeHTTP(w, r)
	if w.Code != 204 {
		t.Fatalf("got %d", w.Code)
	}
	if r.Header.Get("Authorization") != "" {
		t.Fatal("mutated request seen by outer logger")
	}
}

func TestWebSocketCredentialsRejectMalformedAmbiguousAndQueryTokens(t *testing.T) {
	encoded := base64.RawURLEncoding.EncodeToString([]byte("token"))
	for _, protocol := range []string{"gotipe.auth.%", "gotipe.auth.", "gotipe.auth." + encoded + ",gotipe.auth." + encoded} {
		r := httptest.NewRequest("GET", "/sync", nil)
		r.Header.Set("Sec-WebSocket-Protocol", protocol)
		w := httptest.NewRecorder()
		WebSocketCredentials(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("invalid credential accepted") })).ServeHTTP(w, r)
		if w.Code != 401 {
			t.Fatalf("got %d", w.Code)
		}
	}
	r := httptest.NewRequest("GET", "/sync?token=secret", nil)
	WebSocketCredentials(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Fatal("query credential accepted")
		}
	})).ServeHTTP(httptest.NewRecorder(), r)
}
