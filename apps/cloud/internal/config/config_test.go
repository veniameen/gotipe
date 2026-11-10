package config

import "testing"

func TestLoadFailsWithClearConfigurationErrors(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	if _, err := Load(); err == nil {
		t.Fatal("missing database accepted")
	}
	t.Setenv("DATABASE_URL", "postgres://local/test")
	t.Setenv("ENVIRONMENT", "production")
	t.Setenv("DATABASE_MAX_CONNS", "4")
	t.Setenv("DATABASE_IDLE_CONNS", "0")
	t.Setenv("EXPORT_WORKERS", "0")
	if _, err := Load(); err == nil {
		t.Fatal("zero workers accepted")
	}
	t.Setenv("EXPORT_WORKERS", "2")
	t.Setenv("RATE_LIMIT_API", "0/min")
	if _, err := Load(); err == nil {
		t.Fatal("zero rate limit accepted")
	}
	t.Setenv("RATE_LIMIT_API", "100/min")
	t.Setenv("SYNC_ALLOWED_ORIGINS", " https://app.example.test, http://localhost:5173 ")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.SyncAllowedOrigins) != 2 || c.SyncAllowedOrigins[0] != "https://app.example.test" {
		t.Fatal(c.SyncAllowedOrigins)
	}
}

func TestInvalidEnvironmentAndUntrustedOriginsFailClosed(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://local/test")
	for _, test := range []struct{ name, value string }{{"DATABASE_MAX_CONNS", "invalid"}, {"DATABASE_IDLE_CONNS", "4294967296"}, {"EXPORT_POLL_INTERVAL", "bad"}, {"S3_USE_PATH_STYLE", "yes"}, {"HTTP_ALLOWED_ORIGINS", "*"}, {"SYNC_ALLOWED_ORIGINS", "https://user:password@example.test"}, {"HTTP_ALLOWED_ORIGINS", "https://example.test/path"}} {
		t.Run(test.name+test.value, func(t *testing.T) {
			t.Setenv(test.name, test.value)
			if _, err := Load(); err == nil {
				t.Fatal("invalid environment accepted")
			}
		})
	}
	t.Setenv("HTTP_ALLOWED_ORIGINS", "https://custom.example.test,http://localhost:5173")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.HTTPAllowedOrigins) != 2 || c.HTTPAllowedOrigins[0] != "https://custom.example.test" {
		t.Fatal(c.HTTPAllowedOrigins)
	}
}
