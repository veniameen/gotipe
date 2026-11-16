package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// httpOrigins keeps an explicitly empty HTTP_ALLOWED_ORIGINS empty. Only development
// has defaults, the local dev servers. No origin is right for every production
// deployment, so there an unset variable stops the API instead of allowing a
// domain the operator never named.
func httpOrigins(value string, set bool, environment string) ([]string, error) {
	if set {
		return splitValues(value), nil
	}
	if environment == "production" {
		return nil, errors.New("HTTP_ALLOWED_ORIGINS is required in production: list the browser origins of your apps, or set it empty to allow none")
	}
	return []string{"http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"}, nil
}
func validateOrigins(name string, origins []string) error {
	for _, origin := range origins {
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || strings.ContainsAny(origin, "*# \t\r\n") {
			return fmt.Errorf("%s must contain exact http(s) origins without credentials, paths or wildcards", name)
		}
	}
	return nil
}
