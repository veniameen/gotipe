package config

import (
	"net/netip"
	"testing"
	"time"
)

// from loads a configuration from a fixed map instead of the developer's shell.
func from(values map[string]string) (*Config, error) {
	return LoadFrom(func(name string) (string, bool) {
		value, ok := values[name]
		return value, ok
	})
}

func required(extra map[string]string) map[string]string {
	values := map[string]string{"DATABASE_URL": "postgres://local/test", "JWT_PRIVATE_KEY": "private PEM", "JWT_PUBLIC_KEY": "public PEM"}
	for name, value := range extra {
		values[name] = value
	}
	return values
}

func TestLoadFailsWithClearConfigurationErrors(t *testing.T) {
	if _, err := from(required(map[string]string{"DATABASE_URL": ""})); err == nil {
		t.Fatal("missing database accepted")
	}
	if _, err := from(required(map[string]string{"JWT_PRIVATE_KEY": ""})); err == nil {
		t.Fatal("missing signing key accepted")
	}
	production := map[string]string{"ENVIRONMENT": "production", "DATABASE_MAX_CONNS": "4", "DATABASE_IDLE_CONNS": "0", "EXPORT_WORKERS": "0"}
	if _, err := from(required(production)); err == nil {
		t.Fatal("zero workers accepted")
	}
	production["EXPORT_WORKERS"] = "2"
	production["RATE_LIMIT_API"] = "0/min"
	if _, err := from(required(production)); err == nil {
		t.Fatal("zero rate limit accepted")
	}
	production["RATE_LIMIT_API"] = "100/min"
	production["SYNC_ALLOWED_ORIGINS"] = " https://app.example.test, http://localhost:5173 "
	c, err := from(required(production))
	if err != nil {
		t.Fatal(err)
	}
	if len(c.SyncAllowedOrigins) != 2 || c.SyncAllowedOrigins[0] != "https://app.example.test" || c.TrustedProxies != nil {
		t.Fatal(c.SyncAllowedOrigins, c.TrustedProxies)
	}
}

func TestInvalidEnvironmentAndUntrustedOriginsFailClosed(t *testing.T) {
	for _, test := range []struct{ name, value string }{
		{"DATABASE_MAX_CONNS", "invalid"}, {"DATABASE_IDLE_CONNS", "4294967296"}, {"EXPORT_POLL_INTERVAL", "bad"},
		{"JWT_EXPIRY", "3600"}, {"EXPORT_POLL_INTERVAL", "-1s"}, {"S3_USE_PATH_STYLE", "yes"},
		{"LOG_LEVEL", "verbose"}, {"LOG_FORMAT", "pretty"}, {"ENVIRONMENT", "staging"},
		{"HTTP_ALLOWED_ORIGINS", "*"}, {"SYNC_ALLOWED_ORIGINS", "https://user:password@example.test"}, {"HTTP_ALLOWED_ORIGINS", "https://example.test/path"},
		{"TRUSTED_PROXIES", "caddy"}, {"TRUSTED_PROXIES", "0.0.0.0/0"}, {"TRUSTED_PROXIES", "::/0"}, {"TRUSTED_PROXIES", "fe80::1%eth0"},
	} {
		t.Run(test.name+"="+test.value, func(t *testing.T) {
			if _, err := from(required(map[string]string{test.name: test.value})); err == nil {
				t.Fatal("invalid environment accepted")
			}
		})
	}
	c, err := from(required(map[string]string{"HTTP_ALLOWED_ORIGINS": "https://custom.example.test,http://localhost:5173"}))
	if err != nil {
		t.Fatal(err)
	}
	if len(c.HTTPAllowedOrigins) != 2 || c.HTTPAllowedOrigins[0] != "https://custom.example.test" {
		t.Fatal(c.HTTPAllowedOrigins)
	}
	if c, err = from(required(map[string]string{"HTTP_ALLOWED_ORIGINS": ""})); err != nil || len(c.HTTPAllowedOrigins) != 0 {
		t.Fatalf("explicitly empty origins replaced by defaults: %v %v", c.HTTPAllowedOrigins, err)
	}
}

func TestTrustedProxiesAcceptAddressesAndRanges(t *testing.T) {
	c, err := from(required(map[string]string{"TRUSTED_PROXIES": "172.30.240.2, 10.1.2.3/8, ::ffff:192.0.2.1, 2001:db8::/32"}))
	if err != nil {
		t.Fatal(err)
	}
	want := []netip.Prefix{
		netip.MustParsePrefix("172.30.240.2/32"), netip.MustParsePrefix("10.0.0.0/8"),
		netip.MustParsePrefix("192.0.2.1/32"), netip.MustParsePrefix("2001:db8::/32"),
	}
	if len(c.TrustedProxies) != len(want) {
		t.Fatal(c.TrustedProxies)
	}
	for i := range want {
		if c.TrustedProxies[i] != want[i] {
			t.Fatalf("proxy %d: got %v want %v", i, c.TrustedProxies[i], want[i])
		}
	}
}

func TestDurationsAreGoDurations(t *testing.T) {
	c, err := from(required(map[string]string{"JWT_EXPIRY": "90m", "EXPORT_POLL_INTERVAL": "250ms"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.JWTExpiry != 90*time.Minute || c.ExportPollInterval != 250*time.Millisecond {
		t.Fatal(c.JWTExpiry, c.ExportPollInterval)
	}
}
