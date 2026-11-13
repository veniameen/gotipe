package config

import (
	"os"
	"regexp"
	"strings"
	"testing"
	"time"
)

const envExample = "../../../../infra/.env.example"

// Compose interpolates these into docker-compose.yml; the API does not read them.
var composeOnly = map[string]bool{"POSTGRES_PASSWORD": true, "GRAFANA_ADMIN_PASSWORD": true}

var (
	envAssignment = regexp.MustCompile(`^([A-Z][A-Z0-9_]*)=(.*)$`)
	envCommented  = regexp.MustCompile(`^#\s*([A-Z][A-Z0-9_]*)=`)
	envReference  = regexp.MustCompile(`\$\{([A-Z][A-Z0-9_]*)\}`)
)

// readEnvExample parses the subset of the Compose .env syntax the example may use:
// NAME=value with a plain value, ${NAME} references to earlier lines, and comment
// lines. Anything else fails, so the file reads the same in Compose, a shell or
// systemd. Commented NAME= lines count as documented optional variables.
func readEnvExample(t *testing.T) (values map[string]string, documented map[string]bool) {
	t.Helper()
	data, err := os.ReadFile(envExample)
	if err != nil {
		t.Fatal(err)
	}
	values, documented = map[string]string{}, map[string]bool{}
	for index, line := range strings.Split(string(data), "\n") {
		number := index + 1
		if strings.TrimSpace(line) == "" {
			continue
		}
		if strings.HasPrefix(line, "#") {
			if match := envCommented.FindStringSubmatch(line); match != nil {
				documented[match[1]] = true
			}
			continue
		}
		match := envAssignment.FindStringSubmatch(line)
		if match == nil {
			t.Fatalf("line %d is not NAME=value: %q", number, line)
		}
		name, value := match[1], match[2]
		if strings.ContainsAny(value, " \t#'\"") {
			t.Fatalf("line %d: %s needs a plain value; put comments on their own line", number, name)
		}
		if _, duplicate := values[name]; duplicate {
			t.Fatalf("line %d: %s is set twice", number, name)
		}
		value = envReference.ReplaceAllStringFunc(value, func(reference string) string {
			referenced := envReference.FindStringSubmatch(reference)[1]
			resolved, ok := values[referenced]
			if !ok {
				t.Fatalf("line %d: %s refers to %s before it is set", number, name, referenced)
			}
			return resolved
		})
		if strings.Contains(value, "$") {
			t.Fatalf("line %d: %s may only reference ${NAME}", number, name)
		}
		values[name], documented[name] = value, true
	}
	return values, documented
}

func TestEnvExampleLoadsThroughTheRealLoader(t *testing.T) {
	values, documented := readEnvExample(t)
	// The example leaves the key pair to the operator; fill the required secrets.
	values["JWT_PRIVATE_KEY"] = "-----BEGIN EC PRIVATE KEY-----\ntest\n-----END EC PRIVATE KEY-----"
	values["JWT_PUBLIC_KEY"] = "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----"
	read := map[string]bool{}
	c, err := LoadFrom(func(name string) (string, bool) {
		read[name] = true
		value, ok := values[name]
		return value, ok
	})
	if err != nil {
		t.Fatalf("the API refuses infra/.env.example: %v", err)
	}
	for name := range values {
		if !read[name] && !composeOnly[name] {
			t.Errorf("infra/.env.example sets %s, which the API never reads", name)
		}
	}
	for name := range read {
		if !documented[name] {
			t.Errorf("the API reads %s; document it in infra/.env.example", name)
		}
	}
	if c.Environment != "production" || c.DatabaseURL != "postgres://gotipe:CHANGE_ME@pgbouncer:6432/gotipe?sslmode=disable" ||
		c.JWTExpiry != time.Hour || c.ExportPollInterval != time.Second || c.ExportWorkers != 2 ||
		len(c.HTTPAllowedOrigins) != 1 || c.HTTPAllowedOrigins[0] != "https://app.example.com" || c.LogFormat != "json" {
		t.Fatalf("infra/.env.example values did not take effect: %+v", c)
	}
}

func TestEnvExampleCheckRejectsUnreadNames(t *testing.T) {
	// The drift check depends on the loader reporting every name it reads; a name
	// such as ENV (instead of ENVIRONMENT) must never be looked up.
	read := map[string]bool{}
	if _, err := LoadFrom(func(name string) (string, bool) {
		read[name] = true
		return required(nil)[name], required(nil)[name] != ""
	}); err != nil {
		t.Fatal(err)
	}
	for _, legacy := range []string{"ENV", "DATABASE_DIRECT_URL", "JWT_PRIVATE_KEY_PATH", "STRIPE_PRICE_STARTER", "S3_BUCKET", "S3_ACCESS_KEY", "VALKEY_MAX_CONNS", "AI_CACHE_TTL", "R2_CDN_URL", "OAUTH_GITHUB_CLIENT_ID"} {
		if read[legacy] {
			t.Errorf("loader reads %s", legacy)
		}
	}
	for _, name := range []string{"ENVIRONMENT", "JWT_PRIVATE_KEY", "STRIPE_PRICE_STARTER_ID", "TRUSTED_PROXIES", "GOTIPE_EXPORT_COMMAND"} {
		if !read[name] {
			t.Errorf("loader does not report %s", name)
		}
	}
}
