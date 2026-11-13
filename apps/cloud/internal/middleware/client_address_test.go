package middleware

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5/pgconn"
)

var caddy = TrustProxies([]netip.Prefix{netip.MustParsePrefix("172.30.240.2/32"), netip.MustParsePrefix("10.0.0.0/8")})

func addressRequest(peer string, headers map[string][]string) *http.Request {
	r := httptest.NewRequest("POST", "/v1/auth/token", nil)
	r.RemoteAddr = peer
	for name, values := range headers {
		for _, value := range values {
			r.Header.Add(name, value)
		}
	}
	return r
}

func TestClientAddressTrustsForwardedHeadersOnlyFromTrustedProxies(t *testing.T) {
	for _, test := range []struct {
		name, peer string
		headers    map[string][]string
		want       string
	}{
		{"untrusted peer ignores headers", "192.0.2.1:3210", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}, "X-Real-IP": {"198.51.100.8"}}, "192.0.2.1"},
		{"proxy names the client", "172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}}, "198.51.100.7"},
		{"client-supplied hops are skipped", "172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"203.0.113.9, 198.51.100.7"}}, "198.51.100.7"},
		{"trusted chain is walked right to left", "10.0.0.9:41000", map[string][]string{"X-Forwarded-For": {"203.0.113.9, 198.51.100.7, 10.0.0.5"}}, "198.51.100.7"},
		{"repeated headers form one chain", "172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"203.0.113.9", "198.51.100.7"}}, "198.51.100.7"},
		{"all hops trusted", "172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"10.0.0.5"}}, "10.0.0.5"},
		{"hop with port", "172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7:5555"}}, "198.51.100.7"},
		{"malformed chain falls back to the proxy", "172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"attacker"}}, "172.30.240.2"},
		{"empty chain falls back to the proxy", "172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {""}}, "172.30.240.2"},
		{"X-Real-IP without X-Forwarded-For", "172.30.240.2:41000", map[string][]string{"X-Real-IP": {"2001:db8::1"}}, "2001:db8::1"},
		{"X-Forwarded-For wins over X-Real-IP", "172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}, "X-Real-IP": {"203.0.113.9"}}, "198.51.100.7"},
		{"IPv4-mapped proxy address", "[::ffff:172.30.240.2]:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}}, "198.51.100.7"},
		{"proxy without headers", "172.30.240.2:41000", nil, "172.30.240.2"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := caddy.Of(addressRequest(test.peer, test.headers)); got != test.want {
				t.Fatalf("got %s want %s", got, test.want)
			}
		})
	}
	if got := (ClientAddresses{}).Of(addressRequest("172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}})); got != "172.30.240.2" {
		t.Fatalf("zero value trusted a proxy: %s", got)
	}
}

func TestLoginLimiterSeparatesClientsBehindTrustedProxy(t *testing.T) {
	var keys []string
	limiter, err := NewRateLimiter(limiterStore(func(k []string, _ []interface{}) (int64, error) {
		keys = append(keys, k[0])
		return 1, nil
	}), 10, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	h := limiter.IPMiddleware(caddy)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }))
	for _, client := range []string{"198.51.100.7", "198.51.100.8", "2001:db8:1:2::10", "2001:db8:1:2::11", "2001:db8:1:3::10"} {
		h.ServeHTTP(httptest.NewRecorder(), addressRequest("172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {client}}))
	}
	want := []string{"rl:auth:198.51.100.7", "rl:auth:198.51.100.8", "rl:auth:2001:db8:1:2::/64", "rl:auth:2001:db8:1:2::/64", "rl:auth:2001:db8:1:3::/64"}
	if strings.Join(keys, " ") != strings.Join(want, " ") {
		t.Fatalf("got %v want %v", keys, want)
	}
}

type auditRecorder struct {
	storage.Database
	addresses []any
}

func (a *auditRecorder) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	a.addresses = append(a.addresses, args[5])
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func TestLoggerRecordsClientAndProxyAddresses(t *testing.T) {
	var output bytes.Buffer
	recorder := &auditRecorder{}
	auditLog := audit.NewAuditLogger(recorder)
	h := LoggerMiddleware(slog.New(slog.NewTextHandler(&output, nil)), caddy)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := auditLog.Log(r.Context(), "user", audit.ActionAPIKeyCreate, "api_key", "key", nil); err != nil {
			t.Fatal(err)
		}
		w.WriteHeader(201)
	}))
	h.ServeHTTP(httptest.NewRecorder(), addressRequest("172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}}))
	h.ServeHTTP(httptest.NewRecorder(), addressRequest("192.0.2.1:3210", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}}))
	var lines []string
	for _, line := range strings.Split(strings.TrimSpace(output.String()), "\n") {
		if strings.Contains(line, "msg=request") {
			lines = append(lines, line)
		}
	}
	if len(lines) != 2 || !strings.Contains(lines[0], "remote_addr=198.51.100.7 proxy_addr=172.30.240.2") || !strings.Contains(lines[1], "remote_addr=192.0.2.1") || strings.Contains(lines[1], "proxy_addr") {
		t.Fatalf("unexpected request log:\n%s", output.String())
	}
	if !strings.Contains(output.String(), "level=WARN") {
		t.Fatalf("the untrusted peer's X-Forwarded-For was not reported:\n%s", output.String())
	}
	if len(recorder.addresses) != 2 || recorder.addresses[0] != "198.51.100.7" || recorder.addresses[1] != "192.0.2.1" {
		t.Fatalf("audit addresses: %v", recorder.addresses)
	}
}

// The API trusts only Caddy, so Caddy must hand over one resolved address: a chain
// that still contains a CDN hop would make the CDN edge the "client".
func TestCaddySendsOnlyItsResolvedClientAddress(t *testing.T) {
	data, err := os.ReadFile("../../../../infra/Caddyfile")
	if err != nil {
		t.Fatal(err)
	}
	var config []string
	for _, line := range strings.Split(string(data), "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "#") {
			config = append(config, line)
		}
	}
	proxies := 0
	for i, line := range config {
		if !strings.HasPrefix(line, "reverse_proxy ") {
			continue
		}
		proxies++
		if !strings.HasSuffix(line, "{") {
			t.Fatalf("%q forwards the default X-Forwarded-For chain; set it to {client_ip}", line)
		}
		var block []string
		for _, inner := range config[i+1:] {
			if inner == "}" {
				break
			}
			block = append(block, inner)
		}
		got := strings.Join(block, "\n")
		if !strings.Contains(got, "header_up X-Forwarded-For {client_ip}") || !strings.Contains(got, "header_up -X-Real-IP") {
			t.Fatalf("%q block does not replace X-Forwarded-For and drop X-Real-IP:\n%s", line, got)
		}
	}
	if proxies == 0 {
		t.Fatal("no reverse_proxy found")
	}
}

func TestForwardedChainsThroughACDN(t *testing.T) {
	chain := map[string][]string{"X-Forwarded-For": {"198.51.100.7, 203.0.113.50"}}
	onlyCaddy := TrustProxies([]netip.Prefix{netip.MustParsePrefix("172.30.240.2/32")})
	// Caddy forwarding its own resolution ({client_ip}) sends one address.
	if got := onlyCaddy.Of(addressRequest("172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}})); got != "198.51.100.7" {
		t.Fatalf("resolved client lost: %s", got)
	}
	// A raw chain ending in a CDN edge names the edge unless the CDN is trusted too.
	if got := onlyCaddy.Of(addressRequest("172.30.240.2:41000", chain)); got != "203.0.113.50" {
		t.Fatalf("got %s", got)
	}
	both := TrustProxies([]netip.Prefix{netip.MustParsePrefix("172.30.240.2/32"), netip.MustParsePrefix("203.0.113.0/24")})
	if got := both.Of(addressRequest("172.30.240.2:41000", chain)); got != "198.51.100.7" {
		t.Fatalf("got %s", got)
	}
}

func TestTrustedProxiesAppearInTheStartupLog(t *testing.T) {
	var output bytes.Buffer
	log := slog.New(slog.NewTextHandler(&output, nil))
	log.Info("client addresses", "trusted_proxies", caddy)
	log.Info("client addresses", "trusted_proxies", ClientAddresses{})
	if got := output.String(); !strings.Contains(got, "trusted_proxies=172.30.240.2/32,10.0.0.0/8") || !strings.Contains(got, "trusted_proxies=none") {
		t.Fatalf("unexpected log: %s", got)
	}
}

func TestForwardedHeadersFromUntrustedPeersWarnAtMostOncePerMinute(t *testing.T) {
	var output bytes.Buffer
	h := LoggerMiddleware(slog.New(slog.NewTextHandler(&output, &slog.HandlerOptions{Level: slog.LevelWarn})), caddy)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	for _, request := range []*http.Request{
		addressRequest("172.30.240.2:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}}),
		addressRequest("192.0.2.1:3210", nil),
		addressRequest("172.30.240.9:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.7"}}),
		addressRequest("172.30.240.9:41000", map[string][]string{"X-Real-IP": {"198.51.100.7"}}),
		addressRequest("172.30.240.9:41000", map[string][]string{"X-Forwarded-For": {"198.51.100.8"}}),
	} {
		h.ServeHTTP(httptest.NewRecorder(), request)
	}
	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 1 || !strings.Contains(lines[0], "level=WARN") || !strings.Contains(lines[0], "peer=172.30.240.9") || !strings.Contains(lines[0], "trusted_proxies=172.30.240.2/32,10.0.0.0/8") {
		t.Fatalf("want one warning for the untrusted peer, got:\n%s", output.String())
	}

	limit := &throttle{every: time.Minute}
	start := time.Date(2026, 11, 13, 9, 0, 0, 0, time.UTC)
	if _, ok := limit.allow(start); !ok {
		t.Fatal("first warning held back")
	}
	for _, offset := range []time.Duration{time.Second, 59 * time.Second} {
		if _, ok := limit.allow(start.Add(offset)); ok {
			t.Fatalf("second warning within a minute at +%v", offset)
		}
	}
	if suppressed, ok := limit.allow(start.Add(time.Minute)); !ok || suppressed != 2 {
		t.Fatalf("after a minute: ok=%v suppressed=%d", ok, suppressed)
	}
}
