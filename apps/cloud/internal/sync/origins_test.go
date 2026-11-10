package sync

import (
	"crypto/tls"
	"net/http/httptest"
	"testing"
)

func TestAllowedOriginsRequireExactTrustedOrigin(t *testing.T) {
	server := &Server{}
	request := httptest.NewRequest("GET", "http://localhost:65401/sync", nil)
	if !server.checkOrigin(request) {
		t.Fatal("native clients without Origin rejected")
	}
	request.Header.Set("Origin", "http://localhost:65401")
	if !server.checkOrigin(request) {
		t.Fatal("same origin rejected")
	}
	request.Header.Set("Origin", "http://localhost:5173")
	if server.checkOrigin(request) {
		t.Fatal("unconfigured cross origin accepted")
	}
	if err := server.SetAllowedOrigins([]string{"http://localhost:5173", "https://app.example.com"}); err != nil {
		t.Fatal(err)
	}
	if !server.checkOrigin(request) {
		t.Fatal("explicit frontend origin rejected")
	}
	for _, origin := range []string{"null", "http://localhost:51730", "http://evil.localhost:5173", "https://app.example.com.evil", "http://user@localhost:5173", "http://localhost:5173/path", "*"} {
		request.Header.Set("Origin", origin)
		if server.checkOrigin(request) {
			t.Fatalf("accepted %q", origin)
		}
	}
	request.Header.Set("Origin", "https://localhost:65401")
	request.TLS = &tls.ConnectionState{}
	if !server.checkOrigin(request) {
		t.Fatal("TLS same origin rejected")
	}
}
func TestInvalidOriginConfigurationDoesNotReplaceAllowlist(t *testing.T) {
	server := &Server{}
	if err := server.SetAllowedOrigins([]string{"http://localhost:5173"}); err != nil {
		t.Fatal(err)
	}
	for _, origin := range []string{"*", "null", "file://host", "https://host/", "https://user:pass@host", "https://host?x=1"} {
		if err := server.SetAllowedOrigins([]string{origin}); err == nil {
			t.Fatalf("accepted invalid config %q", origin)
		}
	}
	request := httptest.NewRequest("GET", "http://localhost:65401/sync", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	if !server.checkOrigin(request) {
		t.Fatal("bad config erased working allowlist")
	}
}
